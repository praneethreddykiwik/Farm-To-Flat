# Farm-to-Flat — Backend handoff for Tharun (and Adnan)

From: Vivek (mobile) · Updated: 5 Sep 2026
Repo: `farm-to-flat` · API workspace: `apps/api` · Schema: `db/schema.js` → `db/schema.sql`

The customer app is complete and runs against an in-app mock of the API contract. It now also has the
AI diet planner (client-side in dev; production calls `POST /api/v1/ai/plan` — see §2 AI) and a
read-only Supabase Storage image resolver. To move from mock to real, the platform stream needs to
stand up the services below and hand back the values in §5.

---

## 0. Current status (5 Sep 2026)

| Thing                           | State                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase project                | **Created by owner.** Ref `anphxxszdqkqnbzdsrre`, region `ap-south-1`. URL + anon (publishable) key are in `apps/customer/.env`.                               |
| Supabase Auth — phone/OTP       | **Disabled** (`phone:false`). Not used in P1 anyway — OTP is handled by the API via MSG91 + Redis (see §1). Leave off unless we switch to Supabase Auth later. |
| Database tables                 | **Not yet created.** DDL is ready in `db/schema.sql` (17-entity model per TDD §03). Apply it — see §4 step 1.                                                  |
| Storage bucket `product-images` | **Not yet created.** Public read. The app resolves `bucket/path` → public URL via `src/lib/supabase.js`.                                                       |
| API (`apps/api`)                | Not started. Contract frozen in `docs/api-contract.md`; mock reference in `apps/customer/src/api/mock/server.js`.                                              |
| App → real API                  | Flip `EXPO_PUBLIC_USE_MOCKS=0` once §5 values are back.                                                                                                        |

> **Security note:** the owner pasted the anon key (and earlier the Groq/Gemini keys) into chat. The
> anon key is public so that's fine; **rotate the Groq and Gemini keys** before any real use. Never
> put `SERVICE_ROLE`, `DATABASE_URL`, or Razorpay secrets anywhere under `apps/customer`/`apps/admin`
> — the pre-commit hook blocks it.

---

## 1. Accounts to create (owner + Tharun, Day 0–1)

| Service                           | Purpose                                                | Who                 | Lead time                         | Notes                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------ | ------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase project                  | Postgres 17, Storage for product images                | **Done (owner)**    | —                                 | Ref `anphxxszdqkqnbzdsrre`, `ap-south-1`. Enable extensions `pgcrypto`, `pg_trgm` (the DDL does this). Create bucket `product-images` (public read). |
| Upstash Redis                     | OTP hashes, rate limits, token revocation, idempotency | Tharun              | Minutes                           | Use TLS URL (`rediss://`).                                                                                                                           |
| MSG91 (or Kaleyra)                | OTP SMS                                                | Owner (Praneeth)    | **1–3 weeks, DLT**                | Register entity, sender ID and the OTP template. Until approved, run the API with `OTP_PROVIDER=console`.                                            |
| Razorpay                          | Payments, refunds, webhooks                            | Owner (KYC) + Adnan | **1–4 weeks**                     | Test keys are enough until Day 14.                                                                                                                   |
| API host (Railway / Render / Fly) | Runs `apps/api`                                        | Tharun              | Minutes                           | Must be reachable over HTTPS from phones.                                                                                                            |
| Expo EAS                          | Builds, OTA, client distribution (§7)                  | Vivek               | Minutes                           | Covered on the mobile side.                                                                                                                          |
| Apple Developer + Google Play     | Ship to client phones (§7)                             | Owner               | **Apple same-day; Play 1–2 days** | ₹ ~8,300/yr Apple, $25 once Google. Needed for TestFlight / Play testing.                                                                            |
| Sentry                            | Errors                                                 | Tharun              | Minutes                           | Optional until Day 14.                                                                                                                               |

---

## 2. Environment variables for `apps/api/.env`

Copy `.env.example` at the repo root and fill these. **None of these ever go into `apps/customer` or
`apps/admin`**; the pre-commit hook blocks it.

### Database (Supabase → Project Settings → Database)

| Variable       | Value                                                                                                                         | Notes                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL` | `postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` | **Transaction pooler, port 6543.** Runtime queries. `<ref>` = `anphxxszdqkqnbzdsrre`. |
| `DIRECT_URL`   | `postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`                                   | **Direct / session, port 5432.** Migrations and DDL only.                             |

`<password>` is the database password from Project Settings → Database → Reset/Show. It is **not** the
anon key.

### Supabase (Project Settings → API)

| Variable                    | Value                                      | Notes                                                                                     |
| --------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | `https://anphxxszdqkqnbzdsrre.supabase.co` | Already known.                                                                            |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret                        | **Server only.** Storage uploads from the admin API, and any DB access that bypasses RLS. |
| `SUPABASE_ANON_KEY`         | anon / publishable key                     | Public. Already in the app's `.env` for read-only Storage.                                |

### Redis (Upstash → Database → Details)

| Variable    | Value                                     |
| ----------- | ----------------------------------------- |
| `REDIS_URL` | `rediss://default:<password>@<host>:6379` |

### Auth (custom, in the API — not Supabase Auth)

| Variable             | Value                     | Notes                                       |
| -------------------- | ------------------------- | ------------------------------------------- |
| `JWT_ACCESS_SECRET`  | 64 random bytes, base64   | `openssl rand -base64 64`                   |
| `JWT_REFRESH_SECRET` | different 64 random bytes | never the same as access                    |
| `ACCESS_TOKEN_TTL`   | `15m`                     | app keeps it in memory                      |
| `REFRESH_TOKEN_TTL`  | `30d`                     | app keeps it in expo-secure-store, rotating |

### SMS

| Variable                | Value                      | Notes                                                                  |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `OTP_PROVIDER`          | `msg91` or `console`       | `console` logs the OTP to the API log (dev only, delete before Day 14) |
| `MSG91_AUTH_KEY`        | from MSG91 dashboard       |                                                                        |
| `MSG91_SENDER_ID`       | 6-char DLT-approved header |                                                                        |
| `MSG91_OTP_TEMPLATE_ID` | DLT template id            |                                                                        |

### Razorpay (Dashboard → Settings → API keys / Webhooks)

| Variable                  | Value                                         | Notes                                                                                                                  |
| ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `RAZORPAY_KEY_ID`         | `rzp_test_…` now, `rzp_live_…` on Day 14      | Public; the app also needs it (see §5).                                                                                |
| `RAZORPAY_KEY_SECRET`     | key secret                                    | **Server only.**                                                                                                       |
| `RAZORPAY_WEBHOOK_SECRET` | separate secret set when creating the webhook | Webhook URL: `https://<api-host>/api/v1/webhooks/razorpay`, events `payment.captured`, `payment.failed`, `order.paid`. |

### AI planner (server-side; see api-contract.md → POST /ai/plan)

| Variable         | Value                    | Notes                                                                                                                                              |
| ---------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`    | `groq` or `gemini`       | default `groq`                                                                                                                                     |
| `GROQ_API_KEY`   | from console.groq.com    | model `openai/gpt-oss-120b`. **No JSON mode** — it returns empty generations; the app parses/repairs plain text and recomputes all macros in code. |
| `GEMINI_API_KEY` | from aistudio.google.com | model `gemini-3.6-flash`                                                                                                                           |

The model only ever returns `{ productId, grams }`; the server (like the app today) recomputes every
calorie/macro from the catalog nutrition table. Do not trust model-provided numbers.

### App policy

| Variable                           | Value                                                    |
| ---------------------------------- | -------------------------------------------------------- |
| `MIN_ORDER_VALUE_PAISE`            | `50000`                                                  |
| `ORDER_RELEASE_MINUTES`            | `20`                                                     |
| `WALLET_TOPUP_DENOMINATIONS_PAISE` | `50000,100000,200000,500000`                             |
| `TZ`                               | `Asia/Kolkata`                                           |
| `PORT`                             | `4000`                                                   |
| `HOST`                             | `0.0.0.0` (so phones on the LAN can reach a dev machine) |
| `CORS_ORIGINS`                     | admin panel origin(s), comma-separated                   |
| `SENTRY_DSN`                       | optional                                                 |

---

## 3. What the API must expose

The frozen contract is `docs/api-contract.md`. Base path `/api/v1`, JSON, Bearer tokens, money as
integer paise **strings**, errors as `{ error: { code, message, details? } }`. The mock in
`apps/customer/src/api/mock/server.js` is a working reference implementation of every route and error
code; matching it field-for-field means the app needs zero changes.

Non-negotiables from the TDD the app relies on:

- `POST /orders` is idempotent on the `Idempotency-Key` header and returns `paymentIntent` only when `gatewayAmountPaise > 0`.
- Orders become `CONFIRMED` only from the Razorpay **webhook**; `/payments/verify` is advisory.
- `GET /delivery-windows` returns 14 days including closed/full windows with `isOpen=false`.
- The customer serialiser never emits `margin`, `procurementCost`, `consumablesCost`, `costPaise`. There is a test in the app that greps for these.
- Every mutating route accepts and stores `Idempotency-Key`; every request carries `X-Request-Id`.

---

## 4. Order of work (matches execution-plan.md)

1. **Day 1 — schema.** Apply `db/schema.sql` to the Supabase project (SQL editor, or
   `psql "$DIRECT_URL" -f db/schema.sql`). It creates the 17-entity model, enums, and indexes, and is
   idempotent. Edit `db/schema.js` and run `node db/generate-sql.mjs` to regenerate. Then seed:
   3 communities, ~40 products with images uploaded to the `product-images` bucket, 1 admin. _(If the
   team prefers Prisma, generate `schema.prisma` to match `db/schema.js` and keep both URLs in the
   datasource — but `db/schema.sql` is the source of truth.)_
2. Day 2: Auth routes (Adnan) and catalog/admin skeleton (Tharun). Contract frozen.
3. Day 3–7: Catalog, cart, windows.
4. Day 8: `GET /admin/orders` + CSV exports, the manual fulfilment screen.
5. Day 9–11: Order transaction, webhook, release job (Adnan + Tharun paired).
6. Day 12: Integration day. Vivek flips the app to the real API.

---

## 5. What to send back to Vivek

Only these, none of them secret:

| Value                           | Used for                                                               | Status                                                |
| ------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`           | e.g. `https://f2f-api.up.railway.app` (or a LAN IP for device testing) | **pending** — needs the API host                      |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID`   | the `rzp_test_…` / `rzp_live_…` key id                                 | **pending** — needs Razorpay                          |
| `EXPO_PUBLIC_SUPABASE_URL`      | product image URLs in `/catalog` resolve                               | **done** — `https://anphxxszdqkqnbzdsrre.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same                                                                   | **done** — in the app `.env`                          |
| Admin panel URL                 | so the team can watch orders arrive during UAT                         | **pending**                                           |

Two of the four are already set. Once the API URL and Razorpay key id are back, Vivek sets
`EXPO_PUBLIC_USE_MOCKS=0` in `apps/customer/.env`, rebuilds, and the app runs live. The `/catalog`
response should return each product image as either an absolute URL or a `product-images/<file>` path —
the app resolves both.

---

## 6. Security checklist before any real customer

- Secrets only in the API host's environment, never committed, never in a client bundle (`pnpm typecheck` and the pre-commit grep gate this).
- **Rotate the Groq and Gemini keys** that were pasted in chat before production.
- Add **Row-Level Security** policies to every table before the anon key is used for anything beyond public Storage. In P1 only the API holds a database credential, so RLS is defence-in-depth; it becomes load-bearing the moment any client reads the DB directly.
- Keep the anon key read-only on Storage; keep `product-images` public-read only (no public write).
- HTTPS everywhere, HSTS on the API, TLS to Redis.
- Webhook signature verified on the **raw** body with a constant-time compare.
- Rate limits on OTP request/verify, login, coupon validate, order placement.
- Argon2id for the admin password; customers have no password.
- Dependency audit in CI; a high-severity advisory fails the build.

---

## 7. Getting the app onto client phones (mobile — Vivek)

Ways to let clients download and use the app, cheapest/fastest first. All except the last two need
nothing from the stores.

| Method                                    | Who can install                    | Needs                                                                    | Good for                                                                                                                                                                                     |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Expo Go + QR**                          | Anyone with the Expo Go app        | Nothing (dev server running)                                             | Quick demos on the owner's / a tester's phone on the same network or via tunnel. **Not** for real clients — needs our laptop running and can't include the native modules (payments, voice). |
| **EAS Build — internal distribution**     | People you send a link to          | Free Expo account; Apple: an **ad-hoc** profile listing each device UDID | A handful of named testers. Android gets a plain `.apk` link; iOS installs over the air after we register their device.                                                                      |
| **TestFlight (iOS)**                      | Up to 10,000 testers by email/link | **Apple Developer Program** (₹ ~8,300/yr)                                | Real iOS beta — full native build, no UDID juggling, auto-updates. ~1 day first review.                                                                                                      |
| **Google Play — internal/closed testing** | Testers you list, via Play Store   | **Google Play Developer** ($25 once)                                     | Real Android beta through the Play Store.                                                                                                                                                    |
| **Public App Store / Play listing**       | Anyone                             | Both accounts + store review                                             | General launch.                                                                                                                                                                              |

**Recommended path for a client pilot:** Apple Developer + Google Play accounts (owner's, ~1–2 days),
then `eas build` → **TestFlight** for iOS and **Play internal testing** for Android. Clients get a
normal store-style install and automatic updates, and after the first native build most JS changes
ship instantly over the air (`eas update`) without a new store review.

Blocking prerequisites for a _real_ pilot build (not Expo Go): a reachable HTTPS API (§5), the
Razorpay key id, and — for iOS — the Apple account so we can sign the build. Until those exist, the
shareable artifact is an **Android internal-distribution `.apk`** pointed at a hosted API, which is the
fastest way to get something a client can tap and open.
