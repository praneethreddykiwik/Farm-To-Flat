# db — schema (single source of truth)

Farm-to-Flat's database schema, per **Technical Design §03** (seventeen entities; money as BigInt
paise, quantities `numeric(10,3)`, `timestamptz` everywhere, uuid PKs).

## Files

- **`schema.js`** — the source of truth. Exports `ENUMS`, `TABLES`, and `SCHEMA_SQL` (idempotent DDL).
  App tooling and tests import this to introspect the model without parsing SQL.
- **`schema.sql`** — generated from `schema.js`. Paste into the Supabase **SQL editor**, or run with
  `psql`. Re-generate after editing `schema.js`: `node db/generate-sql.mjs`.

## Applying it

The DDL is idempotent (`create … if not exists`, guarded `create type`), so it is safe to re-run.

**Supabase SQL editor:** open the F2F project → SQL editor → paste `schema.sql` → Run.

**psql (server-side, uses the direct connection — never the pooler for DDL):**

```bash
psql "$DIRECT_URL" -f db/schema.sql
```

`DIRECT_URL` is the port-5432 connection string (see `docs/handoff-tharun-env.md`). It is a
**server-only** secret and must never enter the mobile or admin app.

## Scope

This defines the table **shape** only. The order transaction (wallet `SELECT … FOR UPDATE`, coupon
row lock, delivery-window capacity decrement) is application logic in the `/api` server, not encoded
here beyond the constraints those routines depend on — chiefly:

- `customer.mobile` unique
- `coupon.code` unique, and `coupon_redemption (coupon_id, customer_id)` unique — the per-account
  redemption enforcement point
- one `OPEN` cart per customer; one default address per customer
- `wallet.customer_id` unique with an optimistic-lock `version`

## Not yet applied to the live database

The tables have **not** been created in the F2F Supabase project yet — that project was not reachable
from this session's Supabase connection. Apply `schema.sql` as above, then add Row-Level Security
policies before the app talks to it directly (P1 reaches the DB through the `/api/v1` server, which
uses the service-role key server-side, so RLS is defence-in-depth for the anon key).
