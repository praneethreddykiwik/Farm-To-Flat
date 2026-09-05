# Farm-to-Flat — Stack and Work Plan

**Team:** 3 developers · **Target:** 15 working days + 4 buffer
**Note:** for named ownership, the Day 1–2 sequencing and the handoff contracts, see `execution-plan.md`. This file is the stack reference and the scenario playbook.
**Scope:** P1 — account, catalog, cart, coupon, wallet, Razorpay payment, delivery window

---

## First, the honest bit

Three developers will not finish this faster than two. The critical path — **schema → auth → wallet → payments → the order transaction** — is sequential, and most of it is one person's work at a time. Adding a third pair of hands does not shorten a chain.

What the third developer buys is everything *around* that chain done in parallel, so the chain never waits. That is worth a great deal. Just don't plan as if 45 developer-days means half the calendar.

---

## The stack

| Layer | Choice |
|---|---|
| Mobile | **React Native via Expo**, JavaScript |
| Admin panel | **React + Vite**, JavaScript (web, not mobile) |
| Backend | **Node + Express**, JavaScript (ESM) |
| Database | **PostgreSQL** on Supabase, via **Prisma** |
| Cache / locks | **Redis** (Upstash) |
| Payments | **Razorpay** |
| SMS / OTP | **MSG91** (DLT-registered) |
| Monorepo | pnpm workspaces + Turborepo |

**Mobile packages:** `expo-router`, `nativewind`, `react-native-reanimated`, `moti`, `@gorhom/bottom-sheet`, `@shopify/flash-list`, `expo-image`, `expo-secure-store`, `react-native-razorpay`, `@reduxjs/toolkit`.

**Backend packages:** `express`, `zod`, `@prisma/client`, `ioredis`, `bullmq`, `jsonwebtoken`, `argon2`, `pino`, `razorpay`.

Install anything with native code using `npx expo install`, never `pnpm add`. Wrong versions compile fine and then crash on device.

---

## Who does what

Three streams that touch each other as little as possible.

| | Stream | Owns |
|---|---|---|
| **Dev A** | Backend core | Prisma schema, auth, catalog API, cart API, delivery windows, **the order transaction**, admin panel |
| **Dev B** | Money | Wallet + ledger, coupons, Razorpay, webhooks, idempotency, reconciliation |
| **Dev C** | Mobile app | Every customer screen, design system, navigation, state, device testing |

**Why this split:** A and B both work server-side but never in the same files. C is alone in the mobile app and never blocked by either — they build against the API contract, mocked until it's real.

**Dev A is on the critical path.** Protect their time. Route questions elsewhere.

---

## Day by day

| Day | Dev A — backend | Dev B — money | Dev C — mobile |
|---|---|---|---|
| **1** | Repo, workspaces, Prisma schema, migrations, seed | Env, Redis, CI, typecheck gate | Expo app shell, design tokens, fonts |
| **2** | Auth: OTP request/verify, JWT, refresh rotation | Rate limits, idempotency middleware | Navigation, onboarding, OTP screens |
| **3** | Catalog API, admin API skeleton | Wallet schema + ledger tables | Address capture, serviceability |
| **4** | Admin web: catalog CRUD, pricing | Wallet endpoints + **concurrency test** | Catalog list, search, product detail |
| **5** | Admin web: communities, days, windows | Coupon model, batch generation, CSV | Cart screen + bottom sheet |
| **6** | Cart API, ₹500 minimum | Coupon validate + redeem, **race test** | Cart wiring against real API |
| **7** | Delivery windows API + capacity | Razorpay order creation, SDK setup | Window selection sheet |
| **8** | **Order transaction — build** | Webhook handler, signature verification | Checkout flow, payment handoff |
| **9** | **Order transaction — pair with B** | **Pair with A on the wallet leg** | Wallet screens: balance, top-up, ledger |
| **10** | **Order transaction — concurrency tests** | Order-release job, reconciliation job | Order history, status, scheduled window |
| **11** | Admin fulfilment screen + CSV exports | Payment edge cases, refunds | Push notifications, empty states, polish |
| **12** | **All three — integration day.** Wire everything end to end, fix what doesn't meet | | |
| **13** | Indexes, EXPLAIN, load test | Security pass, secret grep | Device testing, accessibility |
| **14** | **All three — real ₹1 payment, real refund, real catalog loaded, bug fixing** | | |
| **15** | **All three — UAT with Praneeth, release builds, store submission** | | |
| 16–19 | Buffer: UAT defects, store review, pilot prep | | |

---

## The five points where streams must meet

Everything else is independent. These need a conversation, not a Slack message.

| Day | Meeting point | Who |
|---|---|---|
| 1 | **Schema review.** Read it line by line before anything is built on it | All three |
| 2 | **API contract frozen.** Paths, payloads, error shapes. C builds mocks from it | A + C |
| 6 | **Coupon → cart handshake.** How discount reaches the cart total | A + B |
| 9 | **Order transaction.** Wallet debit inside A's transaction. Pair on this | A + B |
| 12 | **Integration day.** Nothing new starts | All three |

---

## Scenarios

### DLT approval hasn't landed by Day 2
**Every login is blocked.** Continue with a stub OTP provider that logs the code to console — dev only, behind an env flag, and delete it before Day 14. Escalate to Praneeth the same morning; this is not an engineering problem and engineering cannot solve it.

### Razorpay KYC isn't through by Day 7
Build the whole thing against **test keys** — Days 7 to 11 work fine. Only the real ₹1 transaction on Day 14 needs live credentials. Flag it, don't stop.

### The order transaction overruns Day 10
Expected — it's the hardest single item. A and B stay on it into Day 11. **Cut order history (Day 10, Dev C) first**; a customer can live without it for the pilot. Never cut the concurrency tests to save time.

### A developer is out for two days
- **Dev C out:** least damaging. Screens slip, backend continues.
- **Dev B out:** B's work moves to A, A's admin panel slips to Day 13.
- **Dev A out, Days 8–10:** this is the bad one. Stop, replan, tell Praneeth. Do not have B guess at the order transaction alone.

### Praneeth adds scope mid-build
Default answer is **P2**. Write it down, don't argue, don't build it. The scope is fixed in the TDD Section 01. One exception: if it's a genuine legal or payment blocker, it comes in and something else goes out — decided out loud, not absorbed quietly.

### Catalog content isn't ready by Day 12
Launch with the seed catalog and swap real content in via the admin panel — no code change required. Content is not an engineering task; assign an owner on Day 1.

### A concurrency test fails
**Stop and fix it.** Wallet or coupon races are the one class of bug that silently costs real money and is nearly impossible to diagnose in production. Nothing ships around a red concurrency test.

### Two developers need the same file
It shouldn't happen with this split. When it does, the shared file is almost always the Prisma schema — one person edits it, announces it, others rebase. Never two schema migrations in flight at once.

### A stream finishes early
Dev C usually gets there first. Pick up in this order: write tests for someone else's stream, then the admin fulfilment screen, then accessibility. **Don't start P2 work.**

### Day 15 arrives and it isn't done
Use the buffer, and cut in this order: push notifications → order history → admin reports → polish. **Never cut:** the order transaction, payment verification, the concurrency tests, or the fulfilment screen. A pilot can start without notifications. It cannot start without a way to see what was ordered.

---

## Rules everyone follows

- Branch per stream, PR reviewed by one other dev, no direct pushes to `main`.
- `pnpm typecheck` and `pnpm test` must pass before "done" is said out loud.
- Every route gets a Zod schema. A route without one throws at startup.
- All money is **integer paise**. No floats, anywhere, ever.
- Nothing is done until it's been seen on a **physical mid-range Android**.
- No secret ever enters `apps/customer` or `apps/admin`. The pre-commit hook enforces it.
- Test-first only for money, coupons, wallet and capacity. Everywhere else, tests follow.

---

## Daily rhythm

**15-minute standup, same time.** Three questions: what landed, what's next, what's blocking.

Anything blocked for more than **two hours** goes to the group. In a fifteen-day build, half a day lost quietly is 3% of the project.

**Alternate-day demo to Praneeth** — working software on a device, not a status update. Nothing is "90% done."
