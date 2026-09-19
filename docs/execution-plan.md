# Farm-to-Flat — Execution Plan

**Team:** Adnan · Vivek · Tharun
**Target:** P1 in 15 working days + 4 buffer
**Supersedes** the generic day grid in `stack-and-work-plan.md` — that file remains the stack reference.

---

## 1. Read this first

Three things decide whether this lands on time, and none of them is how fast anyone types.

**The critical path is sequential.** Schema → auth → wallet → payments → the order transaction. Each needs the one before it. Three people cannot compress that chain; they can only make sure it never waits on anything.

**Two days of setup unblock the other thirteen.** Days 1 and 2 produce almost no visible product. Skip them and you spend Days 6 through 10 rewriting each other's assumptions. Every hour saved there costs three later.

**One thing is genuinely hard.** The order transaction combines a coupon redemption, a wallet debit, a window decrement and a gateway call, and any of the four can fail halfway. It gets two people and three days. Everything else is ordinary work done carefully.

---

## 2. The three streams

Split by what the work _demands_, so the streams barely touch each other.

| Stream                             | What this work demands                                                                                                                                                                                      | Owner      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Money and the core transaction** | Deep transactional reasoning — row locks, race conditions, idempotency. A mistake here silently costs real money and is close to undiagnosable in production. Lowest tolerance for error in the project.    | **Adnan**  |
| **Mobile application**             | The largest surface area — thirteen screens, navigation, state, device behaviour. Every piece is independently verifiable on a phone, so it rewards fast iteration and frequent checking.                   | **Vivek**  |
| **Platform and admin**             | The clearest contracts. Catalog, cart, windows, and the admin web panel. Well-specified CRUD that everyone else builds on top of, so correctness of the _interface_ matters more than cleverness inside it. | **Tharun** |

**Why this shape:** Adnan and Tharun both work server-side but never in the same files. Vivek is alone in the mobile app and is never blocked by either — he builds against a contract that gets frozen on Day 2 and mocked until it's real.

**One deliberate exception.** Adnan sets up the mobile architecture and design-system components on Day 2, then hands the screen work to Vivek. Architecture decisions in a React Native app compound across every screen; building the screens themselves does not. Put the architectural decisions where they multiply.

---

## 3. Days 1–2 — the unblock

Nobody works alone yet. This is the highest-leverage 48 hours in the project.

### Day 1

| Time           | Who                     | What                                                                                                                                                                 |
| -------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Morning        | **All three, together** | Repo, pnpm workspaces, Turborepo, jsconfig + typecheck in CI, ESLint, Prettier, husky with the secret-grep hook, `.env.example`. One machine, three people watching. |
| Afternoon      | Adnan                   | Prisma schema — all 17 tables, money as BigInt paise, quantities as Decimal                                                                                          |
| Afternoon      | Tharun                  | Express skeleton: Zod `validate()` middleware, error handler, pino logging with request IDs, `/health`                                                               |
| Afternoon      | Vivek                   | Expo app boots on a physical device. Fonts preloaded, splash held, tokens wired to NativeWind                                                                        |
| **End of day** | **All three**           | **Schema review, out loud, line by line.** A wrong column type found on Day 10 costs a day. Found now it costs ten minutes.                                          |

### Day 2

| Who            | What                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Adnan          | Auth API: OTP request and verify, MSG91, JWT with refresh rotation, jti revocation. Then hand the token contract to Vivek          |
| Adnan          | Mobile architecture and design-system components — Button, Input, Money, sheet pattern, list pattern. Then hand to Vivek           |
| Tharun         | Catalog and admin API skeleton. **Writes the API contract** — paths, payloads, error shapes                                        |
| Vivek          | Navigation shell, onboarding and OTP screens against the real auth API                                                             |
| **End of day** | **API contract frozen.** Vivek builds against it and mocks anything not yet real. Changes after this need agreement from all three |

If Day 2 ends without a frozen contract, do not start Day 3. Fix it first.

---

## 4. Days 3–15

| Day    | Adnan — money                                                                                     | Tharun — platform & admin                  | Vivek — mobile                                |
| ------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| **3**  | Wallet schema, ledger tables, balance locking                                                     | Catalog API, alias search with trigram     | Address capture, serviceability check         |
| **4**  | Wallet endpoints + **concurrency test first**                                                     | Admin web: catalog CRUD, image upload      | Catalog list, search, product detail          |
| **5**  | Coupon model, batch generation, code format                                                       | Admin web: pricing, communities, windows   | Cart screen and bottom sheet                  |
| **6**  | Coupon validate and redeem + **race test**                                                        | Cart API, ₹500 minimum order value         | Cart wired to the real API                    |
| **7**  | Razorpay: order creation, SDK config                                                              | Delivery windows API, capacity decrement   | Window selection sheet                        |
| **8**  | Webhook handler, signature verification, idempotency                                              | Admin web: order list, filters             | Checkout flow, Razorpay handoff               |
| **9**  | **Order transaction — build.** Pair with Tharun                                                   | **Pair with Adnan**                        | Wallet screens: balance, top-up, ledger       |
| **10** | **Order transaction — concurrency tests.** Still paired                                           | **Still paired**                           | Order history, status, scheduled window       |
| **11** | Order-release job, reconciliation job, refunds                                                    | Admin fulfilment screen + CSV exports      | Push notifications, empty states, polish      |
| **12** | **Integration day — all three. Nothing new starts.** Wire it end to end and fix what doesn't meet |                                            |                                               |
| **13** | Security pass, secret grep, payment edge cases                                                    | Indexes, EXPLAIN on hot queries, load test | Device testing, accessibility, reduced motion |
| **14** | **All three — real ₹1 payment, real refund, real catalog loaded, bug fixing**                     |                                            |                                               |
| **15** | **All three — UAT with Praneeth, release builds, store submission**                               |                                            |                                               |
| 16–19  | Buffer — UAT defects, store review, pilot prep                                                    |                                            |                                               |

---

## 5. What each stream owes the others

Missing one of these blocks somebody. They are commitments, not intentions.

| By end of | Who → who      | What                                                |
| --------- | -------------- | --------------------------------------------------- |
| Day 1     | Adnan → all    | Prisma schema, reviewed and merged                  |
| Day 2     | Tharun → Vivek | The API contract, written down                      |
| Day 2     | Adnan → Vivek  | Auth endpoints and the token storage contract       |
| Day 2     | Adnan → Vivek  | Design-system components and mobile architecture    |
| Day 4     | Tharun → Vivek | Catalog API live, seeded, callable                  |
| Day 6     | Tharun → Adnan | Cart API stable — the order transaction reads it    |
| Day 7     | Tharun → Adnan | Window capacity API — the transaction decrements it |
| Day 8     | Adnan → Vivek  | Payment intent shape, so checkout can be built      |

---

## 6. The pairing block — Days 9 and 10

Adnan and Tharun, same screen, two days. This is not a code review; it is the two of them building it together.

**Why pair:** the transaction spans both streams. Adnan owns the wallet debit and coupon lock; Tharun owns cart pricing and window capacity. Built separately and merged, it will be wrong in a way that only shows up under concurrent load.

**What "done" means for these two days:**

- Fifty concurrent orders against a ₹1,000 wallet balance — nothing overspends, and the ledger reconciles exactly.
- Six hundred concurrent redemptions against a coupon capped at 500 — exactly 500 succeed.
- The same customer redeeming the same coupon twice — the second fails on the database constraint, not in application code.
- A window at capacity cannot be oversold.
- A killed process mid-transaction leaves no partial state.

Write each test failing first. Then make it pass.

Vivek keeps building screens through both days and does not join this.

---

## 7. Working agreements

- **Branch per stream.** `money/*`, `platform/*`, `mobile/*`. PR reviewed by one other person. No direct pushes to `main`.
- **The schema has one editor at a time.** Announce it, edit it, merge it, tell people to rebase. Never two migrations in flight.
- **`pnpm typecheck` and `pnpm test` pass before anyone says "done."**
- **Every route gets a Zod schema.** A route without one throws at startup, so this enforces itself.
- **All money is integer paise.** No floats. Anywhere. Ever.
- **Nothing is done until it has run on a physical mid-range Android.** Not a simulator, not a flagship.
- **Test-first only where it matters** — wallet, coupons, capacity, payments. Everywhere else, tests follow the code.
- **Blocked for two hours → raise it.** In a fifteen-day build, half a day lost quietly is 3% of the project.

---

## 8. Rhythm

**Standup, 15 minutes, same time daily.** What landed, what's next, what's blocking. Not a status report — a dependency check.

**Demo to Praneeth on alternate days.** Working software on a device. Nothing is "90% done."

**End-of-day merge.** Everything mergeable goes to `main` the same day. Three streams diverging for two days is how integration day turns into integration week.

---

## 9. If you're ahead

Usually the mobile stream gets there first. Pick up in this order:

1. Write tests for someone else's stream — a second pair of eyes on the money path is worth more than another screen.
2. The admin fulfilment screen, if Tharun hasn't reached it.
3. Accessibility: screen reader through the order flow, reduced motion, largest font size.
4. Seed realistic catalog data — real vegetable names, real aliases, real prices.

**Do not start P2 work.** Not aggregation, not procurement, not routing. It will not be reviewed, it will rot, and it creates the impression that P2 is underway when it isn't.

## 10. If you're behind

Cut in this order, and say so out loud rather than quietly slipping:

1. Push notifications
2. Order history
3. Admin reports
4. Visual polish

**Never cut:** the order transaction, payment verification, the concurrency tests, or the admin fulfilment screen. A pilot survives without notifications. It cannot start without a way to see what was ordered.

If two of the four cuts aren't enough, the problem is scope, not speed — take it to Praneeth on the day you know, not on Day 15.

---

## 11. Extra — new features implemented

Everything in this section was built **after** the plan above was written. It is recorded here so the plan and the delivered product do not quietly diverge: some of it replaces a decision the build proved wrong, some closes a gap found in testing, and some is new capability nobody asked for but the pilot needs.

### 11.1 Delivery windows close on a clock, not a seat count

The original model capped each window with a `windowCapacity` and a rolling `cutoffHours`. That is gone. Each community now carries a fixed `morningCutoff` and `eveningCutoff` in IST plus a `cutoffWarningMinutes` lead time, and a window is open until its cut-off passes — never "full".

This was an operational call, not a technical one. The farm harvests against the night's total, so what matters is when the list closes, and an operator can tell a customer "orders close at 3:45" in a way they cannot explain a hidden capacity number. Cut-off times are editable per community from the admin site, so a closing time moves without a deploy.

The cut-off is re-checked at commit time, not trusted from the client. A basket that was legal when checkout opened is refused with `ORDER_CUTOFF_PASSED` if the window closed in between, and the error carries the next available window.

### 11.2 Legal pages and a contactable operator

Public **Terms & Conditions** and **Privacy** pages, written against Indian law — eligibility, pricing and GST, the cut-off, delivery, cancellation and refunds, limitation of liability, governing law at Hyderabad, and a named **Grievance Officer** as required by the IT Act 2000 and the Consumer Protection (E-Commerce) Rules 2020. Both are reachable from inside the app.

Every customer-facing contact address is now **set by the operator from the admin site** rather than compiled in, via a public `/support` endpoint. No build-time email address remains in the product, and no reference to the contracting agency appears anywhere a customer can see.

### 11.3 Operator tools that work on a phone

The fulfilment board was designed for drag-and-drop, which is unusable on the phone the fulfilment staff actually carry. It now also supports **long-press a card, then tap the destination column**, with the picked-up card banner-flagged and only legal target columns highlighted. Drag still works on a desktop.

Two readability defects found in testing were fixed at the same time: the pricing screen's cost and price fields were being computed to about a third of the width their contents needed — the numbers were simply invisible — and the cut-off time fields were clipped the same way.

### 11.4 Staff screens now stay in step with the website

A real gap, not in the plan. Staff screens on the phone read state the **website** can change while the screen sits open. Nothing pushed that down, so a buyer standing in a market who had submitted an over-budget price saw _"Awaiting admin"_ indefinitely — including long after the admin had approved it.

Every staff screen now refetches when it regains focus and offers pull-to-refresh. Verified end to end both ways: a price submitted on the phone appeared in the website's approval queue, was approved there, and the phone then showed _Approved_.

### 11.5 Checkout was impossible without live gateway keys

Worth recording because of how long it looked like a client bug. The server stamped a placeholder gateway order id on **every** payment and handed it to the app regardless of whether the gateway had issued one. The app opened the payment sheet against an order that did not exist, and the gateway showed its own failure screen. An earlier client-side guard did nothing, because the server always sent a non-null id. Fixed server-side, on both order payment and wallet top-up.

### 11.6 Performance and measured capacity

The order book is now indexed once per checkout rather than rescanned once per basket line, and the 60-second lifecycle sweeper no longer deep-clones every order. Measured against an isolated instance:

| Load                           | Throughput   | Failures                                       | Latency                         |
| ------------------------------ | ------------ | ---------------------------------------------- | ------------------------------- |
| 1,000 concurrent               | 11,100 req/s | 0                                              | 5 ms worst event-loop stall     |
| 2,000 concurrent · 5,000 users | 12,733 req/s | 0                                              | p99 258 ms                      |
| 300 simultaneous orders        | —            | 0 · no duplicate order numbers, no lost writes | 181 `CAP_EXCEEDED`, all correct |

One number deserves its own note. The first version of the window-booking index measured **1.0× — no improvement at all**, because the code it replaced already exited on a cheap comparison while the index paid for a key on every order. It was rewritten before being accepted; the reworked version measures 7.3×. The figure quoted is the measured one, not the intended one.

### 11.7 Local testing without touching production

An `api-mem` run configuration boots the API on an in-memory seed with persistence disabled and no gateway credentials, and the app carries a local `.env.local` pointing at it. Load tests and order-rush tests run against this, so nothing in testing can reach production Supabase. This also explains an earlier round of "the OTP is wrong" reports — the app had been pointed at the production API, an environment problem rather than a code one.

### 11.8 Still deferred — do not read this section as "done"

| Item                                | Status                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Live payment-signature verification | Wired, never exercised against a real gateway                                                  |
| OTP over SMS / WhatsApp             | Deferred; the development OTP path is what is tested                                           |
| `DEV_OTP_ALLOWLIST` on the host     | Deferred to the deployment phase, by agreement                                                 |
| More than one API process           | **Not safe.** Sessions, carts, OTPs and the order-number sequence live in one process's memory |
| Sustained write bursts              | Fire-and-forget writes over a small pool can drop a write after the response already succeeded |
| `GET /admin/orders`                 | Unpaginated — fine at pilot volume, not beyond it                                              |

The first two are ordinary deployment work. The third and fourth are the ones that decide whether this can scale past a single pilot community, and neither is a small change.

---

## 12. Extra — new features implemented (19 September)

§11 stops at 18 September. This section continues the record. Two entries are defects that would have stopped the pilot outright, one is a security exposure that was live in production, and the rest is new capability and polish. Everything here was verified against the live deployment, not a local build.

A designed version of this section, with screenshots of the app and the operator site, is at `docs/delivery-record-19-sep.pdf`.

### 12.1 Payment now completes end to end

Two independent faults meant **no customer could pay**. Either alone was enough to stop the pilot.

**The cloud build shipped without the gateway key.** Public configuration lives in a git-ignored `.env`, which never reaches an EAS cloud build. The build fell back to a placeholder key, the client rejected it as malformed, and the app dead-ended on "Payment unavailable" — the order then sat unpaid until the sweeper cancelled it thirty minutes later. Fixed by declaring the public values in the build profile, plus `scripts/preflight-env.mjs`, which fails the build when one is missing. The check was confirmed to catch the original fault.

**The payment signature was never forwarded.** On return from the gateway the app sent only `razorpayPaymentId`, never the signature or gateway order id. With real credentials configured the server verified a signature it had not been given, so **every successful payment was rejected** and the customer's money sat against an order that then auto-cancelled. It was invisible for months because no environment had gateway credentials: without them the signature branch is skipped entirely. It activates the moment real keys are set.

Verified on an Android device against live production: order `F2F-4231`, ₹520, paid through the real gateway sheet, returned **Confirmed** with "Paid via Razorpay ₹520" recorded server-side.

### 12.2 The operator panel required no login

The admin site was open to anyone with the URL. Today's revenue, every order, and every customer's name, phone number and delivery address rendered without a sign-in.

The cause was `VITE_ADMIN_TOKEN`. Vite inlines a `VITE_*` variable as a literal, so the admin token was readable in the public JavaScript and could be lifted out and used directly against the API. It had been that way for as long as the site had been up.

The token now lives only in the signed-in operator's browser (`localStorage`, see `apps/admin/src/lib/auth.js`); the bundle carries no secret, an anonymous visitor gets a sign-in screen, and a 401 or 403 clears the stored token so a rotation signs the panel out rather than failing every call in a loop. `/privacy` and `/terms` stay public. Verified on the live site after deployment: the published bundle no longer contains the token.

The published token has since been rotated, which is what actually revokes it — the code change alone does not.

### 12.3 Abuse controls on the public API

Per-mobile throttling on OTP requests already existed, so brute-forcing one number was impractical. What was missing was everything else: nothing stopped one host farming thousands of different numbers — real money the day SMS is live — and nothing capped total traffic. See `apps/api/src/lib/rate-limit.js`.

| Control                 | Limit       | Why that number                                                              |
| ----------------------- | ----------- | ---------------------------------------------------------------------------- |
| OTP request, per mobile | 5 / 15 min  | Existing; blocks code guessing                                               |
| OTP request, per IP     | 60 / 15 min | Deliberately loose — Indian carriers put many subscribers behind one address |
| OTP verify, per IP      | 90 / 15 min | Allows honest retries, stops sweeps                                          |
| All endpoints, per IP   | 600 / min   | Global ceiling, tunable via `RATE_LIMIT_PER_MIN` without a deploy            |

`app.set('trust proxy', 1)` was added at the same time. Without it every request appears to come from the hosting proxy's own address and any per-address rule throttles all customers as a single bucket — the control would have been worse than none.

**These counters are in memory.** They hold only while there is one process; a second replica silently doubles every limit here.

### 12.4 The staff roles could not be signed into at all

A number registered as staff was excluded from the fixed test code in production. With no SMS provider wired there is nothing to deliver the random code it received instead, so **Procurement, Fulfilment, Admin and Super admin were unreachable** — the entire operator side of the app was untestable. Verified before the fix: `9000000000` (super admin) and `9848011111` (procurement) both rejected `123456` while an ordinary customer number accepted it.

All six staff accounts now sign in during the closed test and resolve to the correct role and section list. `DEV_OTP_ALLOWLIST` also changed meaning usefully: it is now a confinement that a named number escapes, rather than a list that excluded everyone not on it. Adding staff numbers to it before would have locked out every customer tester.

While `ALLOW_DEV_OTP` is enabled, anyone who guesses a staff number can sign in as that role. That is the cost of a test deployment with no SMS, and it must be removed before any public release.

### 12.5 The basket stopped promising a discount it did not apply

The basket celebrated "You've unlocked every offer 🎉" over a total still charging full price. Coupons are opt-in, so qualifying for one changes nothing until it is applied — the copy described a discount the customer had not received.

The wording now names the applied coupon, or says an offer is available and where to take it. The discount machinery itself was never broken: applying a coupon was confirmed live to deduct **−₹60.20** from a ₹602 basket, giving ₹541.80. Offers the basket already qualifies for now read "Ready to apply" rather than "Spend ₹500 to unlock".

A live **100% off** coupon was also found published to every customer, redeemable by anyone who opened the offer list. It had zero redemptions and has been deactivated.

### 12.6 The welcome screen

An animated village on the hill line: a procession of figures that walk — a real gait, feet on the ground, following the curve of the terrain rather than sliding across it — with livestock, houses, trees and a drifting landscape behind. Built to match a supplied reference, with the palette sampled from it rather than judged by eye. It runs on the UI thread, loops seamlessly, and respects the system reduced-motion setting. See `apps/customer/src/components/VillageRidge.js`.

### 12.7 Smaller corrections found in testing

| Symptom                                                               | Now                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| A field's red error stayed under text the shopper had already fixed   | Clears as they type; other invalid fields keep theirs |
| Notification permission re-asked on every launch after being declined | Asked once, and only while the system still offers it |
| First action of the day appeared frozen for up to a minute            | Explains that it is waking the server (see 12.8)      |

### 12.8 Measured behaviour

Warm, the API answers in about **130–150 ms**. The application is not slow. What testers experience as lag is the hosting tier: the service sleeps after roughly fifteen minutes idle and takes about **50 seconds** to wake. The retry and session handling already tolerated that correctly, but silently — so the app now says what it is waiting for after five seconds. Moving off the free tier is what removes the wait itself.

Test suites: **103** API tests and **19** client tests passing. The full admin surface — all eleven screens including Procurement, Fulfilment, Orders, Pricing and Access — was walked on the live site with no failed request and no console error.

### 12.9 Still outstanding — do not read §12 as "done"

| Item                                | Consequence if shipped as-is                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Remove the fixed test OTP; wire SMS | One code signs in as any customer, **and as any staff role**                                                          |
| Live payment credentials            | No real money can move; test mode only                                                                                |
| More than one API process           | **Not safe.** Sessions, carts, OTPs, order numbering and the new rate-limit counters all live in one process's memory |
| Deploys clear live baskets          | In-memory carts are lost on restart; acceptable for testers, not for paying customers                                 |
| iOS tester build                    | Android is the only distributable surface until the Apple Developer account exists                                    |
| `GET /admin/orders` unpaginated     | Carried over from §11.8 — fine at pilot volume, not beyond it                                                         |
| Per-operator admin logins           | The panel takes one shared token; there is no way to revoke one person without locking out everyone                   |

The first three are what decide whether this is a pilot or a product.
