# Releasing updates — Farm-to-Flat

How to ship changes to the three surfaces safely, and how to test before every user gets them.
Written 2026-10-21. Keep this current.

---

## The three release trains

| Surface                                             | Lives on                                  | How it ships                                      | Who gets it              | Review    |
| --------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- | ------------------------ | --------- |
| **Website + operator console** (`apps/admin`, Vite) | Vercel (`fooducia.in`, `fooducia.health`) | `git push main` → Vercel auto-builds              | everyone, next page load | none      |
| **API** (`apps/api`, Express)                       | Render (`api.fooducia.in`)                | `git push main` → **manual** Deploy latest commit | everyone, instantly      | none      |
| **Mobile app** (`apps/customer`, Expo)              | EAS + Play Store / App Store              | **OTA** _or_ **new build** (see below)            | installed apps           | sometimes |

Website and API are server-side: "update" = deploy, everyone gets it at once. The **mobile app is the
one that needs a process**, because the code runs on phones you don't control.

---

## MOBILE: the one rule — OTA update vs new build

The app has EAS Update (OTA) enabled, `runtimeVersion` policy = **fingerprint** (crash-safe).

### Use an OTA update (`eas update`) when you changed ONLY:

- JavaScript / TypeScript under `apps/customer/app/` or `apps/customer/src/`
- images / fonts / other JS-bundled assets
- copy, styling, screen logic, API-driven behaviour

→ **Instant, no store review.** ~90% of updates are this.

### You MUST do a new build (`eas build` → store) when you changed:

- a dependency that has native code (a new `expo-*` module, a native SDK)
- permissions, app icon / splash, app name, deep-link / scheme config
- anything in `app.json`'s native section
- the Expo SDK version

→ **Store review applies (hours–days).** The fingerprint policy will refuse to deliver an OTA across
these changes anyway — that's the safety net working.

**If unsure:** did you add/remove a line in `package.json` dependencies, or touch `app.json`/`plugins/`?
If yes → new build. If you only edited `app/` or `src/` → OTA.

---

## The pre-release gate (test before everyone)

Two layers, one per update type. **Never push straight to the `production` channel untested.**

### Channels (already configured in `eas.json`)

- `preview-live` — the **pre-release / tester** channel (internal APK, real prod API, mocks off)
- `production` — everyone (store AAB)

### A. OTA update — the daily flow

```bash
cd apps/customer

# 1. publish to the tester channel
eas update --branch preview-live --message "feat: <what changed>"

# 2. open the app on your TESTER device (running the preview-live build) → it updates on next launch → test hands-on

# 3. happy? promote the SAME bits to everyone
eas update --branch production --message "feat: <what changed>"
```

All installed production apps pick it up on their next launch. Rollback in seconds if needed (below).

### B. New build — the native-change flow

```bash
cd apps/customer

# 1. build
eas build --profile production --platform android     # AAB  (+ --platform ios for IPA)

# 2. send to the stores' TEST tracks first
eas submit --profile production --platform android     # → upload, then assign to Play "Internal testing"
#   iOS: eas submit --profile production --platform ios  → TestFlight

# 3. test via Internal testing / TestFlight on your tester devices

# 4. promote to Production in the Play / App Store console — with a STAGED rollout (below)
```

### C. Website / admin

`git push main` → Vercel builds. Every push also gets a **preview URL** — test there before it's on the
live domain. (Operators use the `fooducia.in` console; the HttpOnly session cookie only works there.)

### D. API

`git push main`, then in Render → **`f2f-api` → Manual Deploy → Deploy latest commit**. Production does
**not** auto-deploy (deliberate gate). Verify after: `curl -s https://api.fooducia.in/health | jq`.
**Dependency changes:** run `pnpm --filter api exec prisma generate` locally first — the test suite does
NOT catch a bad dep that breaks the Render build (learned the hard way with the `effect` override).

---

## The tester group (your "give the team early access" idea)

Updates are delivered by **which build a phone installed + its channel**, NOT by phone number. A phone
_number_ sets your **role** (super-admin / procurement / delivery) = which _features_ you see. So the
tester setup is a **tester build on a pre-release track**, optionally with a staff test number.

Set up once:

- **Android — Play Console → Testing → Internal testing:** add you + procurement + delivery by email
  (up to 100). They install from a private opt-in link. New builds appear in minutes, no review.
- **iOS — App Store Connect → TestFlight:** add the same people as internal testers (up to 100).
- Give each tester device a **staff phone number** so they exercise real procurement/delivery flows on
  the pre-release version before customers see it.

Result: a trusted group that gets every build + OTA first, tests on real devices, and only then do you
release to all users.

---

## Staged rollout + rollback (matters at scale)

- **Staged rollout (new builds):** in Play Console release to **10% → 50% → 100%** over a few days;
  watch Sentry for a crash spike and halt if needed. App Store has phased release (7-day auto ramp).
- **OTA rollback:** `eas update:rollback` (or re-publish the last good update to `production`) — fixes
  every user in seconds, no store involved. This is why OTA is your friend.
- **Bad native build:** can only be fixed by shipping another build → why native changes go through the
  test track first.

---

## Version bumps (when to touch what)

- **OTA-only change:** nothing to bump — the fingerprint runtimeVersion is unchanged.
- **New build:** bump `expo.version` in `app.json` (e.g. `0.2.0` → `0.2.1`). `versionCode`/`buildNumber`
  auto-increment (`eas.json` `autoIncrement: true` + `appVersionSource: remote`).

---

## Quick reference

| I changed…                            | Ship with                                                     | Tested on                     | Goes live by         |
| ------------------------------------- | ------------------------------------------------------------- | ----------------------------- | -------------------- |
| a screen / logic / copy / style       | `eas update --branch preview-live` → `production`             | tester device (preview-live)  | next app launch      |
| added a native dep / permission / SDK | `eas build` → `eas submit` → Internal/TestFlight → Production | Internal testing / TestFlight | staged store rollout |
| website / console                     | `git push`                                                    | Vercel preview URL            | Vercel auto-deploy   |
| API                                   | `git push` + Render manual deploy                             | `f2f-api-staging` (optional)  | your manual promote  |

</content>
