# Mobile stream — handoff notes for Adnan and Tharun

Owner: **Vivek** · Stream: `mobile/*` · App: `apps/customer` (Expo SDK 57, JavaScript)

## What is done (Days 1–11 + 13 of the execution plan, mobile column)

| Day | Item | Where |
|---|---|---|
| 1 | Expo app boots, fonts preloaded, splash held, tokens wired to NativeWind | `app/_layout.js`, `packages/tokens` |
| 2 | Navigation shell, onboarding, OTP screens against the auth contract | `app/(auth)/*` |
| 2* | Design-system components (Button, Input, Money, sheet pattern, list pattern) | `src/ui/*` — *Adnan's Day-2 handoff, built here so screens were not blocked; review welcome* |
| 3 | Address capture with community/block masters and one-time GPS serviceability | `src/components/AddressForm.js` |
| 4 | Catalog grid, alias search, product detail with parallax hero | `app/(tabs)/index.js`, `search.js`, `app/product/[id].js` |
| 5–6 | Basket sheet with steppers, ₹500 minimum bar, coupon sheet, wired to the cart contract | `app/cart.js`, `src/hooks/useCart.js` |
| 7 | Delivery window sheet with capacity and cut-off | `src/components/WindowPicker.js` |
| 8 | Checkout flow and Razorpay handoff (native SDK in dev builds, simulator in Expo Go) | `app/checkout.js`, `src/lib/razorpay.js` |
| 9 | Wallet: balance, top-up denominations, ledger | `app/(tabs)/wallet.js` |
| 10 | Order history, order detail with status timeline and scheduled window | `app/(tabs)/orders.js`, `app/order/[id].js` |
| 11 | Push registration, empty states, toasts, polish | `src/lib/notifications.js`, `src/ui/EmptyState.js` |
| 13 | Reduced-motion support, accessibility labels/roles, font scaling caps | `src/hooks/useReducedMotion.js`, every `Pressy` |

## What I need from you

### Tharun (platform)
- Freeze `docs/api-contract.md`. Every field name there is what the app reads. If you rename one, tell me and I change the mock the same day.
- `GET /catalog` should include `blurhash` per product (generate at upload time in the admin) so the grid never pops.
- `GET /delivery-windows` should return **14 days** for the address's community, including full/closed windows with `isOpen=false`, so the picker can show "full" rather than hide the day.
- CORS is irrelevant (native app), but the API must be reachable on the LAN for device testing: bind `0.0.0.0`, not `localhost`.

### Adnan (money)
- Auth token contract as implemented: access in memory (15 min), refresh in `expo-secure-store` (30 d, rotating, family revocation). The app retries once on 401 then signs out. See `src/api/baseQuery.js`.
- `paymentIntent` shape: `{ paymentId, razorpayOrderId, amountPaise, description }`. The app passes `razorpayOrderId` to the SDK and posts `{ paymentId, razorpayPaymentId, razorpayOrderId, razorpaySignature, success }` to `/payments/verify`.
- Confirm: on the 20-minute release, should the **cart be restored**? The mock leaves it empty.
- Wallet top-up denominations come from `GET /wallet.denominationsPaise` so admin can change them without an app release.

## Quality gates (all green on 2026-09-04)

| Gate | Command | Result |
|---|---|---|
| Typecheck (`checkJs`, JSDoc) | `pnpm --filter customer typecheck` | 0 errors |
| Lint (eslint-config-expo, flat config) | `pnpm --filter customer lint` | 0 errors, 16 style warnings |
| Unit tests (vitest) | `pnpm --filter customer test` | 8 passing: money formatting, mock contract incl. order transaction, coupon reuse, wallet leg, serialiser leak check |
| Metro bundle iOS + Android | `npx expo export --platform ios|android` | both bundle |
| Native iOS dev build | `npx expo run:ios` | builds and runs on iPhone 17 Pro simulator; full flow walked end to end (OTP → address → catalog → basket → checkout → wallet → order → tracking) |

**Repo location:** `~/Developer/farm-to-flat`. Do not keep it under `~/Desktop` on macOS with iCloud Desktop sync: the file provider stamps Finder metadata on build products and Xcode code-signing fails with "resource fork, Finder information, or similar detritus not allowed".

**Known behaviour in mock mode:** the mock server is in-memory, so a reload signs you out and clears orders/wallet. That is intentional until Tharun's API is up.

## Running it

```bash
pnpm install
cd apps/customer
cp .env.example .env          # USE_MOCKS=1 by default — no backend needed
pnpm start                    # scan the QR with Expo Go (iOS: Camera app, Android: Expo Go app)
```

Dev OTP in mock mode is **123456** (also shown in a toast).

To hit the real API: set `EXPO_PUBLIC_USE_MOCKS=0` and `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000` in `.env`, restart with `pnpm start --clear`.

Razorpay's native SDK and remote push on Android need a **development build**:

```bash
cd apps/customer
npx expo prebuild
eas build --profile development --platform android
```

## Decisions I made that you should know about
- **Moti dropped.** It is not compatible with Reanimated 4 (SDK 57 pins 4.5.1). Every animation uses Reanimated directly: `entering`/`exiting`, `useAnimatedStyle`, springs from `tokens.motion`.
- **MMKV deferred.** `react-native-mmkv` v4 needs a dev build (Nitro). The cache uses `expo-sqlite/kv-store` behind `src/lib/kv.js` so Expo Go works today; swapping the adapter is a 10-line change.
- **Supabase client is not in the app.** Per TDD §02 the API is the only thing that touches Postgres. The anon key slot exists in `.env.example` for Storage reads only.
- **Glass on Android** uses `expo-blur` with `blurMethod="dimezisBlurView"`. It is heavier than iOS; if a ₹12k phone drops frames on the grid, the fallback is to set `intensity={0}` on list-cell `Glass` (the translucent fill still reads as frost).
- **Payment SDK routing.** The native Razorpay SDK is only invoked in a real build against the real API with a real `rzp_test_/rzp_live_` key. With `EXPO_PUBLIC_USE_MOCKS=1` or the placeholder key, the in-app simulator sheet runs instead (both success and failure paths reach the same `/payments/verify` handler).
- **Liquid Glass on iOS 26** is used only for the tab bar and the floating action bars via `expo-glass-effect`; everywhere else is the portable frost so the two platforms look the same.

## Added 5 Sep 2026 — the "personal dietitian" layer (from the client call)

Built on top of P1 without touching the order flow. Files: `app/(tabs)/plan.js`, `app/calendar.js`, `src/lib/ai.js`, `src/lib/nutrition.js`, `src/lib/reminders.js`, `src/features/plan/planSlice.js`, `src/components/{NutritionBars,MealCard,PlanShoppingList,ProfileSheet}.js`.

| Piece | What it does |
|---|---|
| Profile + standing instructions | Age, sex, weight, height, activity, goal, diet, meals/day, allergies, free-text instructions the planner must always follow. Persisted on device. |
| Targets | Mifflin–St Jeor × activity, protein 1.0–1.8 g/kg by goal. Computed in the app. |
| Nutrition table | Per-100 g kcal/protein/carbs/fat/fibre for all 45 products (USDA FDC + IFCT 2017 rounded), edible fraction, grams per sale unit. |
| Planner | Groq `openai/gpt-oss-120b` (default) or Gemini `gemini-3.6-flash`, JSON mode. The model only picks products + grams + steps; **every number shown is recomputed from the table**, unknown products are dropped, grams clamped. Horizons: one meal, today, week, month. |
| Result UI | Animated coverage bars vs target, meal cards with tappable product chips (→ product page), steps, honest cautions, aggregated shopping list rounded to sale units with price, "Add all to basket". |
| Calendar | Day / week / month views, per-day meals + bars + "order for this day". Persisted. |
| Reminders | Local notification at 18:00 IST the evening before the first day (then every 3 days), so the customer orders before the cut-off. |
| Production | The app should call `POST /api/v1/ai/plan` (Tharun) so keys stay on the server; dev builds call providers directly with `EXPO_PUBLIC_*` keys in `.env` (git-ignored). |

Legal note from the call: the copy says "general nutrition guidance from reference tables, not medical advice" on every plan.
