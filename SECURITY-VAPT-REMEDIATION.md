# Fooducia — Mobile App Security / VAPT Remediation

**App:** Fooducia customer app (Expo / React Native, Android)
**App version scanned:** 0.2.0
**Reports reviewed:** MobSF Static Code Report · Dynamic Analysis Report · AppSec Scorecard
**Date:** 2026-10-18

---

## TL;DR — what you actually need to know

- Your MobSF score (~51/100, Grade B) is **not** a sign that Fooducia's code is insecure. It is dominated by **noise from the standard libraries every RN/Expo app ships** (Expo, React Native, Razorpay, Firebase, Sentry, Glide, OkHttp). MobSF counts risky-looking API _patterns_ across **all** bundled bytecode — it cannot tell your code from a library's. The same score appears on virtually every Expo app of this size. It is not "dropping" — it is stable across scans because the library set is stable.
- The **dynamic** analysis — the one that actually runs the app and watches it — came back **clean**: no cleartext traffic, valid TLS, no trackers/malware, no clipboard or data leaks, auth token stored encrypted.
- There was **one genuine, actionable HIGH finding**: _Remote WebView debugging is enabled_. **This is now fixed** (commit `b5ede21d`). A rebuild is required and is in progress.
- One earlier real item — the customer's mobile number appearing in the `/access/resolve` URL — was already fixed last session (commit `4182e10c`).

---

## 1. The HIGH finding — Remote WebView debugging enabled ✅ FIXED

**What the scanner said**

> HIGH — Remote WebView debugging is enabled.
> `WebView.setWebContentsDebuggingEnabled(true)` in `expo/modules/logbox/ExpoLogBoxWebViewWrapper`.

**What it actually is**

`ExpoLogBoxWebViewWrapper` is part of **Expo's LogBox** — the red error overlay you see _while developing_. It is Expo's own runtime code, not Fooducia's (which is why it does not appear anywhere in our source — it only shows up when the APK is decompiled). React Native/Expo only turns remote WebView inspection on for a **debuggable** build. A release APK/AAB is not debuggable, so in your production build this was **already off at runtime**. The scanner flags the _string_ in the decompiled bytecode regardless of whether the branch can ever run in release.

**Why we fixed it anyway**

Two reasons: (1) your auditor wants concrete evidence, not an explanation, and (2) defence in depth is free here. So we now disable it ourselves, explicitly, in every non-debug build.

**The fix** — `apps/customer/plugins/with-android-hardening.js`

At app start (`MainApplication.onCreate`) we inject, for release builds only:

```kotlin
if (!BuildConfig.DEBUG) {
  android.webkit.WebView.setWebContentsDebuggingEnabled(false)
}
```

`setWebContentsDebuggingEnabled` is a **global static** — the last call wins and applies to **every WebView the app ever creates**, including the **Razorpay checkout WebView**. So even if a bundled library flips it on during its own init, our call afterwards forces it off in production. Development builds are untouched, so the LogBox overlay and Chrome DevTools still work while you build.

**Status:** committed `b5ede21d`. It is a **native** change, so it ships only in a new build (it cannot go out as an OTA update). A fresh `preview-live` APK is building now for the re-scan.

---

## 2. Why the MobSF score is ~51 and why it looks "stuck"

MobSF's static score is a deduction model: it starts high and subtracts for each pattern it recognises as _potentially_ risky, anywhere in the decompiled app. For a React Native / Expo app, the overwhelming majority of those patterns live in the frameworks and SDKs, not in your 1% of app-specific JavaScript:

| Source of the deductions        | Examples of what MobSF flags                                                | Yours?                  |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------- |
| Expo / React Native runtime     | WebView usage, reflection, dynamic class loading, `Runtime.exec` references | No — framework          |
| Razorpay SDK                    | WebView checkout, crypto calls, device fingerprinting                       | No — payment SDK        |
| Firebase / Google Play Services | Reflection, logging, broadcast receivers                                    | No — Google             |
| Sentry                          | Native crash capture, reflection                                            | No — crash tooling      |
| Glide / OkHttp                  | Cache-to-disk, SSL socket factory references                                | No — image/network libs |

This is why the number barely moves between scans — the library set is constant. A hand-written native Android app can score higher simply because it ships less third-party code for the scanner to chew on. **The score is a measure of bytecode surface area, not of how Fooducia handles data.** The dynamic scan (section 4) is the better signal, and it is clean.

---

## 3. Real security controls already in place (these are not noise)

These were implemented before this round and are genuine, verifiable protections:

- **`android:allowBackup="false"`** — blocks `adb backup` from pulling the app's private data (cart, addresses, order history) off a USB-debugging device.
- **`android:usesCleartextTraffic="false"`** — no plaintext HTTP can leave the app; a future `http://` typo fails loudly in dev instead of silently leaking.
- **`SYSTEM_ALERT_WINDOW` permission removed** — the draw-over-other-apps permission (a tapjacking vector over payment screens) was in the Expo template and is now stripped.
- **Auth token in `expo-secure-store`** — encrypted via the Android Keystore, not plain SharedPreferences.
- **No hardcoded secrets** — the only keys in the bundle are the Supabase **anon** key and the public API URL, both designed to be public (row-level security enforces access server-side).
- **`/access/resolve` no longer carries the phone number in the URL** (commit `4182e10c`) — it resolves the caller's own number from the Bearer session, keeping the mobile out of server access logs.

---

## 4. Dynamic analysis — clean

The dynamic report (app actually running, traffic intercepted) found:

- **No cleartext traffic** — everything over HTTPS.
- **Valid TLS**, modern cipher suites.
- **No trackers, no malware, no suspicious domains.**
- **No clipboard leakage, no sensitive data written to logs or world-readable storage.**
- **Auth token confirmed in encrypted secure storage.**

This is the result that matters most for a payment-handling app, and it passed.

---

## 5. One thing we deliberately did NOT do — and why

**TLS certificate pinning** is often suggested after a VAPT. We are **not** adding it, on purpose: the API sits behind **Cloudflare**, which rotates edge certificates automatically. A pinned certificate would turn one of those routine rotations into a **hard outage** — every installed app would stop reaching the API until users updated. The risk pinning defends against (a user with a maliciously-installed root CA) is far smaller than the risk of bricking the live app. If the auditor insists, the correct form is pinning to the **CA / public-key**, not the leaf cert — we can discuss that, but it is a deliberate trade-off, not an oversight.

---

## 6. For the retest — evidence to hand the auditor

1. **New `preview-live` APK** (building now) — contains the WebView fix. Re-scan this one.
   Build: `https://expo.dev/accounts/kiwik.one/projects/farm-to-flat/builds/736493f2-576b-4a85-b956-d19bfb54f302`
2. **The fix is runtime-verifiable**: with the new APK installed on a release build, `adb shell` + Chrome `chrome://inspect` will show **no inspectable WebViews**, where a debug build would list them.
3. **Release build is non-debuggable** — confirm `android:debuggable` is absent/false in the APK manifest (it is, for any EAS release profile).

---

## 7. Changes made this round

| Commit     | Change                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| `b5ede21d` | Disable WebView remote debugging in all release builds (the HIGH finding)    |
| `4182e10c` | (prev session) Stop sending the customer mobile in the `/access/resolve` URL |

Native rebuild required for `b5ede21d` → in progress.
