# Farm-to-Flat — Backend handoff for Tharun (and Adnan)

From: Vivek (mobile) · Date: 4 Sep 2026
Repo: `farm-to-flat` · API workspace: `apps/api` · Schema: `prisma/`

The customer app is complete and runs against an in-app mock of the API contract. To move from mock to
real, the platform stream needs to stand up the services below and hand back the four values in section 5.

---

## 1. Accounts to create (owner + Tharun, Day 0–1)

| Service | Purpose | Who creates | Lead time | Notes |
|---|---|---|---|---|
| Supabase project | Postgres 15+, Storage for product images | Tharun | Minutes | Region `ap-south-1` (Mumbai). Enable extensions `pg_trgm`, `uuid-ossp`. Create bucket `product-images` (public read). |
| Upstash Redis | OTP hashes, rate limits, token revocation, idempotency | Tharun | Minutes | Use TLS URL (`rediss://`). |
| MSG91 (or Kaleyra) | OTP SMS | Owner (Praneeth) | **1–3 weeks, DLT** | Register entity, sender ID and the OTP template. Until approved, run the API with `OTP_PROVIDER=console`. |
| Razorpay | Payments, refunds, webhooks | Owner (KYC) + Adnan | **1–4 weeks** | Test keys are enough until Day 14. |
| API host (Railway / Render / Fly) | Runs `apps/api` | Tharun | Minutes | Must be reachable over HTTPS from phones. |
| Expo EAS | Builds and OTA | Vivek | Minutes | Already covered on the mobile side. |
| Sentry | Errors | Tharun | Minutes | Optional until Day 14. |

---

## 2. Environment variables for `apps/api/.env`

Copy `.env.example` at the repo root and fill these. **None of these ever go into `apps/customer` or `apps/admin`**; the pre-commit hook blocks it.

### Database (Supabase → Project Settings → Database)
| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` | **Transaction pooler, port 6543.** Runtime queries. |
| `DIRECT_URL` | `postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` | **Direct / session, port 5432.** Migrations only. Both go in `schema.prisma` datasource. |

### Supabase (Project Settings → API)
| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **Server only.** Used for Storage uploads from the admin API. |
| `SUPABASE_ANON_KEY` | anon key | Only value that may reach a client, and only for read-only Storage. Not needed by the app in P1. |

### Redis (Upstash → Database → Details)
| Variable | Value |
|---|---|
| `REDIS_URL` | `rediss://default:<password>@<host>:6379` |

### Auth
| Variable | Value | Notes |
|---|---|---|
| `JWT_ACCESS_SECRET` | 64 random bytes, base64 | `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | different 64 random bytes | never the same as access |
| `ACCESS_TOKEN_TTL` | `15m` | app keeps it in memory |
| `REFRESH_TOKEN_TTL` | `30d` | app keeps it in expo-secure-store, rotating |

### SMS
| Variable | Value | Notes |
|---|---|---|
| `OTP_PROVIDER` | `msg91` or `console` | `console` logs the OTP to the API log (dev only, delete before Day 14) |
| `MSG91_AUTH_KEY` | from MSG91 dashboard | |
| `MSG91_SENDER_ID` | 6-char DLT-approved header | |
| `MSG91_OTP_TEMPLATE_ID` | DLT template id | |

### Razorpay (Dashboard → Settings → API keys / Webhooks)
| Variable | Value | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_…` now, `rzp_live_…` on Day 14 | This one is public; the app also needs it (see §5). |
| `RAZORPAY_KEY_SECRET` | key secret | **Server only.** |
| `RAZORPAY_WEBHOOK_SECRET` | separate secret set when creating the webhook | Webhook URL: `https://<api-host>/api/v1/webhooks/razorpay`, events `payment.captured`, `payment.failed`, `order.paid`. |

### AI planner (server-side; see api-contract.md → POST /ai/plan)
| Variable | Value | Notes |
|---|---|---|
| `AI_PROVIDER` | `groq` or `gemini` | default `groq` |
| `GROQ_API_KEY` | from console.groq.com | model `openai/gpt-oss-120b`, JSON mode |
| `GEMINI_API_KEY` | from aistudio.google.com | model `gemini-3.6-flash` |

### App policy
| Variable | Value |
|---|---|
| `MIN_ORDER_VALUE_PAISE` | `50000` |
| `ORDER_RELEASE_MINUTES` | `20` |
| `WALLET_TOPUP_DENOMINATIONS_PAISE` | `50000,100000,200000,500000` |
| `TZ` | `Asia/Kolkata` |
| `PORT` | `4000` |
| `HOST` | `0.0.0.0` (so phones on the LAN can reach a dev machine) |
| `CORS_ORIGINS` | admin panel origin(s), comma-separated |
| `SENTRY_DSN` | optional |

---

## 3. What the API must expose

The frozen contract is `docs/api-contract.md`. Base path `/api/v1`, JSON, Bearer tokens, money as integer paise **strings**, errors as `{ error: { code, message, details? } }`. The mock in `apps/customer/src/api/mock/server.js` is a working reference implementation of every route and error code; matching it field-for-field means the app needs zero changes.

Non-negotiables from the TDD the app relies on:
- `POST /orders` is idempotent on the `Idempotency-Key` header and returns `paymentIntent` only when `gatewayAmountPaise > 0`.
- Orders become `CONFIRMED` only from the Razorpay **webhook**; `/payments/verify` is advisory.
- `GET /delivery-windows` returns 14 days including closed/full windows with `isOpen=false`.
- The customer serialiser never emits `margin`, `procurementCost`, `consumablesCost`, `costPaise`. There is a test in the app that greps for these.
- Every mutating route accepts and stores `Idempotency-Key`; every request carries `X-Request-Id`.

---

## 4. Order of work (matches execution-plan.md)

1. Day 1: Supabase + Redis projects, `schema.prisma` with both URLs, `pnpm db:migrate`, `pnpm db:seed` (3 communities, 40 products with images in Storage, 1 admin).
2. Day 2: Auth routes (Adnan) and catalog/admin skeleton (Tharun). Contract frozen.
3. Day 3–7: Catalog, cart, windows.
4. Day 8: `GET /admin/orders` + CSV exports, the manual fulfilment screen.
5. Day 9–11: Order transaction, webhook, release job (Adnan + Tharun paired).
6. Day 12: Integration day. Vivek flips the app to the real API.

---

## 5. What to send back to Vivek

Only these four values, none of them secret:

| Value | Used for |
|---|---|
| `EXPO_PUBLIC_API_URL` | e.g. `https://f2f-api.up.railway.app` (or a LAN IP for device testing) |
| `EXPO_PUBLIC_RAZORPAY_KEY_ID` | the `rzp_test_…` / `rzp_live_…` key id |
| Supabase Storage public base URL | so product image URLs in `/catalog` resolve |
| Admin panel URL | so the team can watch orders arrive during UAT |

Vivek then sets `EXPO_PUBLIC_USE_MOCKS=0` in `apps/customer/.env`, rebuilds, and the app runs live.

---

## 6. Security checklist before any real customer

- Secrets only in the API host's environment, never committed, never in a client bundle (`pnpm typecheck` and the pre-commit grep gate this).
- Supabase RLS is irrelevant in P1 because only the API holds a database credential; keep the anon key read-only on Storage.
- HTTPS everywhere, HSTS on the API, TLS to Redis.
- Webhook signature verified on the **raw** body with a constant-time compare.
- Rate limits on OTP request/verify, login, coupon validate, order placement.
- Argon2id for the admin password; customers have no password.
- Dependency audit in CI; a high-severity advisory fails the build.
