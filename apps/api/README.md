# apps/api — platform API (Tharun · with Adnan)

Node + Express (ESM), base path `/api/v1`. The frozen contract is [`docs/api-contract.md`](../../docs/api-contract.md);
a working reference of the customer routes lives in `apps/customer/src/api/mock/server.js`.

## What's built

Runs today over an **in-memory store** (`src/store.js` + `src/customer-store.js`) seeded from
`src/data/seed.js` — no database required to run or demo. **The entire frozen contract is implemented**,
so this API is a drop-in for the app's mock: point the app at it with `EXPO_PUBLIC_USE_MOCKS=0` and
`EXPO_PUBLIC_API_URL=http://<host>:4000`. Money is integer paise, on the wire as paise strings.

**Public (contract)** — `GET /catalog`, `/catalog/search?q=`, `/catalog/:id`, `/communities`,
`/delivery-windows`.

**Authenticated customer (contract)** — Bearer token from OTP verify:

- `POST /auth/otp/request` · `/auth/otp/verify` (dev OTP `123456`) · `/auth/refresh` · `/auth/logout`
- `GET/PATCH /me`, `GET/POST /addresses`, `POST /addresses/:id/default`
- `GET /cart`, `PUT /cart/items`, `DELETE /cart/items/:id`, `POST/DELETE /cart/coupon`
- `POST /orders` — the transaction (re-price, ₹500 min, window capacity, coupon lock, wallet debit,
  payment intent) · `GET /orders` · `GET /orders/:id` · `POST /orders/:id/cancel`
- `GET /wallet`, `POST /wallet/topup`, `POST /payments/verify` (doubles as the webhook), `POST /devices`
- `POST /ai/plan` — Groq/Gemini passthrough (501 until a server key is set; the app calls providers
  directly in dev)

A customer order lands in the shared store, so it **appears on the admin fulfilment board immediately**.

**Admin / operator (`/api/v1/admin/*`, cost + margin visible here — never on the public routes)**

- `GET/POST/PATCH/DELETE /admin/products`, `GET /admin/categories`
- `GET/POST/PATCH /admin/communities`, `GET /admin/communities/:id/windows`
- `GET /admin/orders` (filters + counts), `/admin/orders/:id`, `PATCH /admin/orders/:id/status`
  (fulfilment state machine), `GET /admin/orders/export.csv`, `POST /admin/orders/simulate`
- `GET /admin/metrics` — dashboard · `GET /admin/analytics` — community comparison
- `GET /admin/procurement` (buy list, `?date=`, `?bufferPct=` run override), `/procurement/export.csv`,
  `POST /admin/procurement/mark` (shared bought-checklist)

Cross-cutting: Zod at every boundary (`src/validate.js`), the contract error shape (`src/http.js`),
the auth gate (`src/routes/require-auth.js`), and the **customer/operator serialiser split**
(`src/serialize.js`) — customer shapes never emit `costPaise` / `margin*` (tested).

## Run

```bash
pnpm --filter @f2f/api dev     # http://localhost:4000  (node --watch)
pnpm --filter @f2f/api test    # vitest + supertest — 26 tests
curl localhost:4000/health
```

## The remaining swap (with Adnan — DB + real providers)

The routes are the real shape; only the backing store and external calls swap:

1. Apply `db/schema.sql` to Supabase; add Prisma (`prisma/schema.prisma`) mirroring it.
2. Give `src/store.js` + `src/customer-store.js` a Postgres-backed implementation of the same
   functions — routes don't change.
3. Turn `src/data/seed.js` into `prisma/seed.js`.
4. Replace the in-memory sessions with Adnan's real JWT + refresh rotation; wire the admin JWT into
   `src/routes/admin/auth.js` (set `ADMIN_TOKEN` to enforce a gate today). Swap `/payments/verify`'s
   webhook-double for the real Razorpay webhook + signature check. Set `GROQ_API_KEY` for `/ai/plan`.
5. Reinstall the then-needed deps (`prisma`, `@prisma/client`, `argon2`, `ioredis`, `jsonwebtoken`,
   `razorpay`) — kept out of the lean set so the API installs and runs cleanly on any machine today.

## Rules (see `CONTRIBUTING.md`)

- Integer paise only, as strings on the wire. Zod at every boundary. Never leak cost/margin to customers.
- No server secret is committed; server secrets live only in this app's env.
