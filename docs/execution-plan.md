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

Split by what the work *demands*, so the streams barely touch each other.

| Stream | What this work demands | Owner |
|---|---|---|
| **Money and the core transaction** | Deep transactional reasoning — row locks, race conditions, idempotency. A mistake here silently costs real money and is close to undiagnosable in production. Lowest tolerance for error in the project. | **Adnan** |
| **Mobile application** | The largest surface area — thirteen screens, navigation, state, device behaviour. Every piece is independently verifiable on a phone, so it rewards fast iteration and frequent checking. | **Vivek** |
| **Platform and admin** | The clearest contracts. Catalog, cart, windows, and the admin web panel. Well-specified CRUD that everyone else builds on top of, so correctness of the *interface* matters more than cleverness inside it. | **Tharun** |

**Why this shape:** Adnan and Tharun both work server-side but never in the same files. Vivek is alone in the mobile app and is never blocked by either — he builds against a contract that gets frozen on Day 2 and mocked until it's real.

**One deliberate exception.** Adnan sets up the mobile architecture and design-system components on Day 2, then hands the screen work to Vivek. Architecture decisions in a React Native app compound across every screen; building the screens themselves does not. Put the architectural decisions where they multiply.

---

## 3. Days 1–2 — the unblock

Nobody works alone yet. This is the highest-leverage 48 hours in the project.

### Day 1

| Time | Who | What |
|---|---|---|
| Morning | **All three, together** | Repo, pnpm workspaces, Turborepo, jsconfig + typecheck in CI, ESLint, Prettier, husky with the secret-grep hook, `.env.example`. One machine, three people watching. |
| Afternoon | Adnan | Prisma schema — all 17 tables, money as BigInt paise, quantities as Decimal |
| Afternoon | Tharun | Express skeleton: Zod `validate()` middleware, error handler, pino logging with request IDs, `/health` |
| Afternoon | Vivek | Expo app boots on a physical device. Fonts preloaded, splash held, tokens wired to NativeWind |
| **End of day** | **All three** | **Schema review, out loud, line by line.** A wrong column type found on Day 10 costs a day. Found now it costs ten minutes. |

### Day 2

| Who | What |
|---|---|
| Adnan | Auth API: OTP request and verify, MSG91, JWT with refresh rotation, jti revocation. Then hand the token contract to Vivek |
| Adnan | Mobile architecture and design-system components — Button, Input, Money, sheet pattern, list pattern. Then hand to Vivek |
| Tharun | Catalog and admin API skeleton. **Writes the API contract** — paths, payloads, error shapes |
| Vivek | Navigation shell, onboarding and OTP screens against the real auth API |
| **End of day** | **API contract frozen.** Vivek builds against it and mocks anything not yet real. Changes after this need agreement from all three |

If Day 2 ends without a frozen contract, do not start Day 3. Fix it first.

---

## 4. Days 3–15

| Day | Adnan — money | Tharun — platform & admin | Vivek — mobile |
|---|---|---|---|
| **3** | Wallet schema, ledger tables, balance locking | Catalog API, alias search with trigram | Address capture, serviceability check |
| **4** | Wallet endpoints + **concurrency test first** | Admin web: catalog CRUD, image upload | Catalog list, search, product detail |
| **5** | Coupon model, batch generation, code format | Admin web: pricing, communities, windows | Cart screen and bottom sheet |
| **6** | Coupon validate and redeem + **race test** | Cart API, ₹500 minimum order value | Cart wired to the real API |
| **7** | Razorpay: order creation, SDK config | Delivery windows API, capacity decrement | Window selection sheet |
| **8** | Webhook handler, signature verification, idempotency | Admin web: order list, filters | Checkout flow, Razorpay handoff |
| **9** | **Order transaction — build.** Pair with Tharun | **Pair with Adnan** | Wallet screens: balance, top-up, ledger |
| **10** | **Order transaction — concurrency tests.** Still paired | **Still paired** | Order history, status, scheduled window |
| **11** | Order-release job, reconciliation job, refunds | Admin fulfilment screen + CSV exports | Push notifications, empty states, polish |
| **12** | **Integration day — all three. Nothing new starts.** Wire it end to end and fix what doesn't meet | | |
| **13** | Security pass, secret grep, payment edge cases | Indexes, EXPLAIN on hot queries, load test | Device testing, accessibility, reduced motion |
| **14** | **All three — real ₹1 payment, real refund, real catalog loaded, bug fixing** | | |
| **15** | **All three — UAT with Praneeth, release builds, store submission** | | |
| 16–19 | Buffer — UAT defects, store review, pilot prep | | |

---

## 5. What each stream owes the others

Missing one of these blocks somebody. They are commitments, not intentions.

| By end of | Who → who | What |
|---|---|---|
| Day 1 | Adnan → all | Prisma schema, reviewed and merged |
| Day 2 | Tharun → Vivek | The API contract, written down |
| Day 2 | Adnan → Vivek | Auth endpoints and the token storage contract |
| Day 2 | Adnan → Vivek | Design-system components and mobile architecture |
| Day 4 | Tharun → Vivek | Catalog API live, seeded, callable |
| Day 6 | Tharun → Adnan | Cart API stable — the order transaction reads it |
| Day 7 | Tharun → Adnan | Window capacity API — the transaction decrements it |
| Day 8 | Adnan → Vivek | Payment intent shape, so checkout can be built |

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
