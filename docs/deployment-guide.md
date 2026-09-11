# Farm-to-Flat — Deployment Guide (Play Store + App Store)

**Owner:** Vivek · **Build system:** Expo Application Services (EAS) · **Status:** pre-launch
**App:** Farm to Flat · slug `farm-to-flat` · version `0.1.0` · id `in.farmtoflat.customer` (both platforms)

This is the plan we follow to get the app onto the Apple App Store and Google Play Store, plus what
each teammate needs to provide. It also corrects two common misunderstandings (see §5).

---

## 1. The one thing to understand first

There are **two separate systems**, and they are often confused:

1. **The backend** (API + database + images) — this is what **Cloudflare / Firebase / Supabase** are
   for. It runs on a server on the internet.
2. **The mobile app** — the thing on the phone. It is **built and published with EAS (Expo)**, not
   with Cloudflare/Firebase/Supabase. Those services can NOT put the app on the stores.

The app talks to the backend over the internet. So **both** must be ready:
the backend hosted at a public URL, and the app built by EAS and submitted to the stores.

---

## 2. Vivek's plan (from the call) — verified

| Vivek's step                                          | Verdict                    | Correction / note                                                                                                                                              |
| ----------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build/host from **expo.dev (EAS)**                    | ✅ Correct                 | EAS builds the app in the cloud.                                                                                                                               |
| **Test** it first (internal testers / TestFlight)     | ✅ Correct                 | EAS internal distribution (Android) + TestFlight (iOS).                                                                                                        |
| Then take the build file and **upload to the stores** | ✅ Correct idea            | Use `eas submit` — it uploads for you.                                                                                                                         |
| Convert to **`.aab`** for Play Store                  | ✅ Correct for **Android** | Play Store = `.aab`.                                                                                                                                           |
| Upload the **same `.aab`** to Apple too               | ❌ Not correct             | Apple uses a different file: **`.ipa`**, uploaded to **App Store Connect** (via `eas submit`). One `.aab` for Google, one `.ipa` for Apple. EAS produces both. |
| Senior said "Cloudflare / Firebase"                   | ⚠️ Different topic         | That's the **backend hosting**, not store publishing. See §5.                                                                                                  |

**Bottom line: your plan is ~80% right.** The build→test→submit flow is correct. The two things to
fix in your understanding: (a) Apple takes `.ipa`, not `.aab`; (b) Cloudflare/Firebase are backend,
not app publishing.

---

## 3. The full end-to-end flow (with exact commands)

Run all commands from **`apps/customer`**.

### Phase 0 — Accounts (one-time)

- **Expo account** — free (expo.dev). ✅ already created.
- **Apple Developer Program** — **$99/year**. Required for TestFlight and the App Store. (Individual
  account is fastest; Organisation needs a D-U-N-S number.)
- **Google Play Developer** — **$25 one-time**.

### Phase 1 — Configure the app (mostly done ✅)

Already set in `app.json`: name, icon, splash, bundle id `in.farmtoflat.customer`, permissions,
version `0.1.0`. `eas.json` build profiles are configured.

### Phase 2 — Log in the build tool

```bash
npm install -g eas-cli
eas login            # or set EXPO_TOKEN from expo.dev → Settings → Access tokens
```

### Phase 3 — TEST builds (share with our team first)

```bash
# Android — installable APK by link (no store, no review, no Google account needed)
eas build -p android --profile preview

# iOS — needs the Apple Developer account; registers tester devices, then builds
eas device:create
eas build -p ios --profile preview
```

Send the resulting link/QR to testers. (Our internal, no-backend build runs in mock mode — safe.)

### Phase 4 — STORE builds (the real, uploadable files)

```bash
eas build -p android --profile production   # produces the .aab for Google Play
eas build -p ios      --profile production   # produces the .ipa for the App Store
```

### Phase 5 — SUBMIT to the stores

```bash
eas submit -p android --latest    # uploads the .aab to Google Play Console
eas submit -p ios     --latest    # uploads the .ipa to App Store Connect
```

### Phase 6 — Finish in each store's console (manual, in the browser)

- **Google Play Console:** create the app, fill the store listing, run a **Closed test** with ≥12
  testers for **14 days** (Google's rule for new personal accounts), then promote to Production.
- **App Store Connect:** fill the listing, attach the TestFlight build, submit for **App Review**
  (~1–3 days). On approval, release.

---

## 4. Where we currently lag (honest gap list)

| Gap                                                                                            | Blocks                                 | Owner                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| **Backend not hosted** — API still runs on a laptop, in-memory                                 | Real (non-mock) testing & production   | Vivek + Adnan                      |
| **Apple Developer account** ($99) not created                                                  | Any iPhone testing + App Store         | Vivek                              |
| **Google Play account** ($25) not created                                                      | Play Store                             | Vivek                              |
| **iOS local/native build failing** — `expo-sqlite` compile error (`exsqlite3changeset_invert`) | iOS builds until fixed                 | Dev (needs a clean pod/config fix) |
| **Store assets** — screenshots, feature graphic, descriptions, **privacy policy URL**          | Store review (both)                    | Vivek + teammate                   |
| **DLT registration** for SMS/OTP                                                               | Real OTP login in production           | Vivek                              |
| **Razorpay live keys + KYC**                                                                   | Real payments (test keys work for now) | Vivek + Adnan                      |
| Rotate AI keys; authenticate `/access/resolve` before any public build                         | Security (pre-beta checklist)          | Dev                                |

**Sequence that matters:** host the backend → point the app at it (`preview-live` profile) → test →
production build → submit. The backend is the true first domino.

---

## 5. Clearing up "Cloudflare / Firebase / Supabase"

| Service        | What it actually does for us                              | Publishes the app? |
| -------------- | --------------------------------------------------------- | ------------------ |
| **Supabase**   | Our database + file/image storage                         | ❌ No              |
| **Firebase**   | Optional: push notifications (Android FCM), analytics     | ❌ No              |
| **Cloudflare** | Optional: DNS, HTTPS, CDN, security for our API domain    | ❌ No              |
| **EAS (Expo)** | Builds the `.aab` / `.ipa` **and** submits to both stores | ✅ **Yes**         |

So the senior is right that we'll _use_ Cloudflare/Firebase/Supabase — but for the **backend**. The
**app publishing** goes through **EAS + the two developer accounts**. They are complementary, not
alternatives.

---

## 6. Requirements for the teammate picking this up

**Accounts & credentials to obtain (Vivek provides / creates):**

- [ ] Apple Developer account ($99) — Apple ID + Team ID
- [ ] Google Play Developer account ($25) — service-account JSON for `eas submit`
- [ ] Expo access token (for CI/non-interactive builds)
- [ ] Backend hosting decided (Render / Railway / Hostinger VPS) → public HTTPS API URL

**App-store listing assets to prepare:**

- [ ] App name, subtitle, short + full description
- [ ] Screenshots: iPhone 6.7" & 6.5"; Android phone (min 2 each)
- [ ] App icon 1024×1024 (have it), Play feature graphic 1024×500
- [ ] **Privacy policy URL** (both stores require it) + support email/URL
- [ ] Content rating questionnaire (Play) + age rating (Apple)
- [ ] Data-safety / privacy nutrition labels (location, phone number → declare)

**Engineering tasks before production build:**

- [ ] Fix the `expo-sqlite` iOS build error
- [ ] Deploy the backend and set `EXPO_PUBLIC_API_URL` in the `preview-live` / `production` profile
- [ ] Rotate AI keys; ensure no secret ships in the app bundle
- [ ] Bump `version` and let EAS auto-increment build numbers

**Commands cheat-sheet:** see §3.

---

## 7. MSG91 / SMS-OTP setup (DLT) — for the teammate

Login uses a phone number + OTP. The code is generated and verified **by our server**; **MSG91 only
delivers the SMS.** The integration is already written (`apps/api/src/lib/msg91.js`, called from
`customer-store.js`) and stays dormant until these three values are in the **server** `.env`.

**End state — fill in `apps/api/.env` (server only, NEVER `EXPO_PUBLIC_*`):**

```
MSG91_AUTH_KEY=        # MSG91 dashboard → Settings → Authkey
MSG91_SENDER_ID=       # 6-letter DLT header, e.g. FRMFLT
MSG91_OTP_TEMPLATE_ID= # the DLT-approved OTP template's id
```

**Tasks, in order:**

- [ ] **MSG91 account** created (goal = _OTP - User Authentication_, channel = _SMS_). ✅ in progress
- [ ] **Create an Authkey** (Settings → Authkey). For now IP Security **OFF**; at launch turn it **ON**
      and whitelist the **hosted server's public IP**. → `MSG91_AUTH_KEY`
- [ ] **DLT registration** (mandatory in India; needs **PAN / GST / company proof**; ~1–3 days):
  - [ ] Register the business as a **Principal Entity** → get an **Entity ID**
  - [ ] Register a **Sender ID / Header** (6 letters, e.g. `FRMFLT`) → `MSG91_SENDER_ID`
  - [ ] Register the **OTP content template** (must contain an `##OTP##` variable), e.g.
        _"Your Farm to Flat login OTP is ##OTP##. Valid for 5 minutes. Do not share it with anyone."_
        → once approved, its id is `MSG91_OTP_TEMPLATE_ID`
- [ ] Paste the three values into `apps/api/.env`, run the API in production mode, send a test OTP.

**Notes / gotchas:**

- Mobile numbers are sent with the `91` country code (handled in code).
- The OTP-send code **self-disables** until the keys exist, so nothing breaks before DLT is done.
- **Testing is not blocked:** in dev/test the code is always `123456` (no SMS, no MSG91 needed).
- Cost ≈ **₹0.15–0.25 per SMS** + one-time DLT registration (~₹5,900). See the cost model xlsx.
- The Authkey is a **secret** — server-side only; if it leaks, someone can spend your SMS balance.

---

## 8. Quick reference — which file goes where

| Store           | Build command                               | File produced | Submit command                   | Console           |
| --------------- | ------------------------------------------- | ------------- | -------------------------------- | ----------------- |
| Google Play     | `eas build -p android --profile production` | `.aab`        | `eas submit -p android --latest` | Play Console      |
| Apple App Store | `eas build -p ios --profile production`     | `.ipa`        | `eas submit -p ios --latest`     | App Store Connect |

_Docs to follow: Expo — "Build your project for app stores" and "Submit to the app stores"
(docs.expo.dev). Share the specific links you're using and we'll align this guide to them._
