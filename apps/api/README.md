# apps/api — platform API (Tharun · with Adnan)

Node + Express (ESM), base path `/api/v1`. The frozen contract is [`docs/api-contract.md`](../../docs/api-contract.md);
a working reference of the customer routes lives in `apps/customer/src/api/mock/server.js`.

## What's built (Tharun's platform surface)

Runs today over an **in-memory store** (`src/store.js`) seeded from `src/data/seed.js` — no database
required to run or demo. Money is integer paise everywhere and crosses the wire as paise strings.

**Public (frozen contract)**

- `GET /catalog` — categories + products
- `GET /catalog/search?q=` — alias search with misspelling tolerance (exact › prefix › substring › trigram)
- `GET /catalog/:id`
- `GET /communities`
- `GET /delivery-windows?communityId=&date=` — 14-day schedule, capacity, cut-off

**Admin / operator (`/api/v1/admin/*`, cost + margin visible here — never on the public routes)**

- `GET/POST/PATCH/DELETE /admin/products`, `GET /admin/categories`
- `GET/POST/PATCH /admin/communities`, `GET /admin/communities/:id/windows`
- `GET /admin/orders` (filters + status counts), `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status`
  (validated against a fulfilment state machine), `GET /admin/orders/export.csv?type=packing|manifest`
- `GET /admin/metrics` — dashboard aggregates

Cross-cutting: Zod at every boundary (`src/validate.js`), the contract error shape
`{ error: { code, message, details? } }` (`src/http.js`), and the **customer/operator serialiser split**
(`src/serialize.js`) — the public product shape never emits `costPaise` / `margin*` (there's a test for it).

## Run

```bash
pnpm --filter @f2f/api dev     # http://localhost:4000  (node --watch)
pnpm --filter @f2f/api test    # vitest + supertest — 12 tests
curl localhost:4000/health
```

## Deferred to the DB + money phase (with Adnan)

Auth, cart, the order transaction, wallet, coupons and payments return `501 NOT_IMPLEMENTED` today.
Landing them is the Prisma/Postgres swap:

1. Apply `db/schema.sql` to Supabase; add Prisma (`prisma/schema.prisma`) mirroring it.
2. Replace `src/store.js` with a Postgres-backed implementation of the same functions — routes don't change.
3. Turn `src/data/seed.js` into `prisma/seed.js`.
4. Wire Adnan's JWT into `src/routes/admin/auth.js` (set `ADMIN_TOKEN` to enforce a gate today) and add
   the auth-protected customer routes (cart/orders/wallet).
5. Reinstall the deferred deps then (`prisma`, `@prisma/client`, `argon2`, `ioredis`, `jsonwebtoken`,
   `razorpay`, `nanoid`, `pino`) — kept out of the lean set so the platform surface installs and runs
   cleanly on any machine.

## Rules (see `CONTRIBUTING.md`)

- Integer paise only, as strings on the wire. Zod at every boundary. Never leak cost/margin to customers.
- No server secret is committed; server secrets live only in this app's env.
