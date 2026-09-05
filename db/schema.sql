-- GENERATED from db/schema.js — do not edit by hand. Regenerate: node db/generate-sql.mjs

-- Farm-to-Flat schema — generated from db/schema.js (TDD §03). Idempotent.
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- trigram index for alias search

-- ── enum types ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE product_unit AS ENUM ('KG', 'BUNCH', 'PIECE', 'DOZEN', 'PACK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'PAYMENT_FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_slot AS ENUM ('MORNING', 'EVENING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_direction AS ENUM ('CREDIT', 'DEBIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_source AS ENUM ('TOPUP', 'ORDER', 'REFUND', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE coupon_type AS ENUM ('PERCENT', 'FLAT', 'FREE_ITEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_purpose AS ENUM ('WALLET_TOPUP', 'ORDER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cart_status AS ENUM ('OPEN', 'ORDERED', 'ABANDONED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── lookups & communities ─────────────────────────────────────────────────────
create table if not exists category (
  id          text primary key,                       -- e.g. 'cat_leafy'
  name        text not null,
  sort        int  not null default 0
);

create table if not exists community (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  area           text,
  delivery_days  int[] not null default '{}',          -- 0=Sun … 6=Sat
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists block (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references community(id) on delete cascade,
  name          text not null,
  unique (community_id, name)
);

-- ── customer & address ────────────────────────────────────────────────────────
create table if not exists customer (
  id            uuid primary key default gen_random_uuid(),
  mobile        text not null unique,                  -- E.164 without +91, OTP only
  full_name     text,
  email         text,
  food_pref     text,                                  -- 'vegetarian' | 'non-vegetarian' | …
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists address (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customer(id) on delete cascade,
  community_id   uuid not null references community(id),
  block_id       uuid references block(id),
  flat           text not null,
  recipient_name text,
  recipient_phone text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);
-- At most one default address per customer.
create unique index if not exists address_one_default
  on address (customer_id) where is_default;

-- ── catalog ───────────────────────────────────────────────────────────────────
create table if not exists product (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique,                            -- stable id used by the app (e.g. 'p_palak')
  category_id  text not null references category(id),
  name         text not null,
  unit         product_unit not null,
  increment    numeric(10,3) not null default 1,       -- min orderable step
  daily_cap    numeric(10,3),                          -- max harvestable per day
  farm         text,
  image_path   text,                                   -- Storage object path or absolute URL
  blurhash     text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
-- Catalog listing is the hottest read (TDD §03 indexes).
create index if not exists product_active_category on product (is_active, category_id);

create table if not exists product_alias (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references product(id) on delete cascade,
  name        text not null
);
-- Alias search with misspelling tolerance.
create index if not exists product_alias_trgm on product_alias using gin (name gin_trgm_ops);

create table if not exists price (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references product(id) on delete cascade,
  selling_price_paise bigint not null check (selling_price_paise >= 0),
  effective_from timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists price_product_effective on price (product_id, effective_from desc);

-- ── cart ──────────────────────────────────────────────────────────────────────
create table if not exists cart (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id) on delete cascade,
  status      cart_status not null default 'OPEN',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- One OPEN cart per customer.
create unique index if not exists cart_one_open
  on cart (customer_id) where status = 'OPEN';

create table if not exists cart_item (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references cart(id) on delete cascade,
  product_id  uuid not null references product(id),
  quantity    numeric(10,3) not null check (quantity > 0),
  unique (cart_id, product_id)
);

-- ── delivery windows ──────────────────────────────────────────────────────────
create table if not exists delivery_window (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references community(id) on delete cascade,
  delivery_date date not null,
  "window"      delivery_slot not null,
  capacity      int not null,
  booked        int not null default 0,
  created_at    timestamptz not null default now(),
  unique (community_id, delivery_date, "window"),
  check (booked >= 0 and booked <= capacity)
);

-- ── orders ────────────────────────────────────────────────────────────────────
create table if not exists orders (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references customer(id),
  address_id           uuid not null references address(id),
  delivery_window_id   uuid references delivery_window(id),
  delivery_date        date not null,
  "window"             delivery_slot not null,
  status               order_status not null default 'PENDING_PAYMENT',
  subtotal_paise       bigint not null default 0,
  coupon_id            uuid,
  coupon_discount_paise bigint not null default 0,
  wallet_applied_paise bigint not null default 0,
  gateway_amount_paise bigint not null default 0,
  total_paise          bigint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- Order history, and the admin fulfilment list — where ops lives (TDD §03 indexes).
create index if not exists orders_customer_created on orders (customer_id, created_at desc);
create index if not exists orders_fulfilment on orders (delivery_date, "window", status);

create table if not exists order_item (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  product_id        uuid not null references product(id),
  name              text not null,                     -- captured at confirmation
  unit              product_unit not null,
  quantity          numeric(10,3) not null check (quantity > 0),
  unit_price_paise  bigint not null,                   -- locked at confirmation
  line_total_paise  bigint not null
);

-- ── coupons ───────────────────────────────────────────────────────────────────
create table if not exists coupon (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  batch_id        text not null,                       -- traces to a print run / channel
  type            coupon_type not null,
  value_bp        int,                                 -- basis points, for PERCENT
  value_paise     bigint,                              -- for FLAT
  free_product_id uuid references product(id),         -- for FREE_ITEM
  min_order_paise bigint not null default 50000,       -- ₹500
  expires_at      timestamptz not null,
  global_cap      int,
  redeemed_count  int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists coupon_redemption (
  id           uuid primary key default gen_random_uuid(),
  coupon_id    uuid not null references coupon(id),
  customer_id  uuid not null references customer(id),
  order_id     uuid not null unique references orders(id),
  amount_paise bigint not null,
  created_at   timestamptz not null default now(),
  unique (coupon_id, customer_id)                      -- one per account — the enforcement point
);

-- ── wallet ────────────────────────────────────────────────────────────────────
create table if not exists wallet (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null unique references customer(id) on delete cascade,
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  version       int not null default 0,                -- optimistic lock
  created_at    timestamptz not null default now()
);

create table if not exists wallet_ledger (
  id            uuid primary key default gen_random_uuid(),
  wallet_id     uuid not null references wallet(id),
  direction     ledger_direction not null,
  amount_paise  bigint not null check (amount_paise > 0),
  balance_after bigint not null,
  source        ledger_source not null,
  order_id      uuid references orders(id),
  payment_id    uuid,
  reason        text,                                  -- required for ADJUSTMENT (app-enforced)
  created_by    text,                                  -- admin actor for ADJUSTMENT
  created_at    timestamptz not null default now()
);
create index if not exists wallet_ledger_wallet_created on wallet_ledger (wallet_id, created_at);

-- ── payments ──────────────────────────────────────────────────────────────────
create table if not exists payment (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references customer(id),
  purpose            payment_purpose not null,
  order_id           uuid references orders(id),
  amount_paise       bigint not null check (amount_paise > 0),
  status             payment_status not null default 'CREATED',
  razorpay_order_id  text,
  razorpay_payment_id text,
  signature_valid    boolean,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists payment_rzp_order on payment (razorpay_order_id);

-- ── infrastructure ────────────────────────────────────────────────────────────
create table if not exists idempotency_key (
  key           text primary key,
  endpoint      text not null,
  customer_id   uuid references customer(id),
  response      jsonb,
  status_code   int,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,
  entity_id   text,
  action      audit_action not null,
  old_value   jsonb,
  new_value   jsonb,
  actor       text,
  created_at  timestamptz not null default now()
);
