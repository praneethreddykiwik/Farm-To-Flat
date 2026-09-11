# Sharing Farm-to-Flat with employees for testing

Two separate goals — don't confuse them:

- **Phase A — "Let them try the app."** Employees install a real app on their phone and click through
  everything. Runs on the built-in **mock data** (on-device), so it needs **no backend, no hosting,
  no Postgres.** Available almost immediately. Data is fake and per-phone.
- **Phase B — "Real shared testing."** Everyone sees the same live data, real orders, real payments
  (test mode). Needs the **backend hosted publicly** first (the API→Postgres + deploy step).

Do **Phase A now** to get feedback on the experience; do Phase B when the backend is live.

---

## What only you (Vivek) can do — accounts

| Need                        | Cost     | For                                                                                         |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| **Expo account** (expo.dev) | Free     | Running any EAS build (both platforms)                                                      |
| **Apple Developer account** | $99/yr   | ANY iPhone but yours to run the app (Apple blocks side-loading)                             |
| **Google Play account**     | $25 once | Only if you want the Play "internal testing" track. **Not needed** to share an APK by link. |

D-U-N-S number is only needed if you register Apple as an _organization_. For fastest testing, an
**individual** Apple Developer account skips DUNS.

---

## One-time setup (do once)

```bash
npm install -g eas-cli
cd apps/customer
eas login              # your Expo account
eas init               # creates the project, fills the empty projectId in app.json
```

---

## Phase A — Android (fastest, ~free, no backend)

```bash
cd apps/customer
eas build -p android --profile preview
```

- Uses the **`preview`** profile → mock mode, no secrets bundled (safe for outside phones).
- ~10–15 min in Expo's cloud. You get a **URL + QR code**.
- Send the link to employees. On their Android phone: open link → Download → "Install unknown apps"
  → Allow → Install. Done. Works on **any network, any time**, no store, no review.

## Phase A — iOS (needs the $99 Apple account)

Two ways once you have the Apple Developer account:

**Option 1 — Ad-hoc (up to 100 specific iPhones, no review):**

```bash
eas device:create        # each tester opens the link once to register their iPhone UDID
eas build -p ios --profile preview
```

Share the resulting install link with those registered devices.

**Option 2 — TestFlight (up to 10,000 testers, cleaner, small review):**

```bash
eas build -p ios --profile production
eas submit -p ios --latest
```

Then in App Store Connect → TestFlight, add testers by email. Internal team = instant; external
testers = ~1-day Apple review of the build (not the full store review).

For a handful of employees, **Option 1 (ad-hoc)** is simplest.

---

## Phase B — Real shared data (after the backend is hosted)

1. Deploy the API (Render/Railway/Hostinger VPS) → you get an HTTPS URL.
2. In `eas.json`, set the **`preview-live`** profile's `EXPO_PUBLIC_API_URL` to that URL.
3. Rebuild with `--profile preview-live` (Android and/or iOS) and re-share.
   Now every tester hits the same live database; test-mode Razorpay real; data persists.

---

## Build profiles (already configured in eas.json)

| Profile        | Mode                | Backend needed | Use                                 |
| -------------- | ------------------- | -------------- | ----------------------------------- |
| `development`  | dev client          | Yes (LAN)      | Your own dev machine                |
| `preview`      | **mock, on-device** | **No**         | **Phase A — hand to employees now** |
| `preview-live` | real API            | Yes (hosted)   | Phase B — shared live testing       |
| `production`   | real API            | Yes            | Store submission                    |

## Security notes (enforced by the profiles)

- `preview` and `preview-live` **do not bundle the AI keys** — production AI goes through the API,
  so keys never ship in an installed app. (Satisfies the pre-beta security checklist.)
- Before ANY public/store build, rotate the AI keys still sitting in `apps/customer/.env` and make
  sure `/access/resolve` is authenticated on the server.
