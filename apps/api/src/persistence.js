/**
 * Supabase persistence for ALL data — master (catalog, communities, coupons, staff, settings) and
 * transactional (customers, addresses, orders, wallet, payments, sessions, devices, redemptions).
 *
 * Model chosen with the team: Supabase is the SOURCE OF TRUTH. On boot we load every table into the
 * in-memory store (store.js / customer-store.js / access-store.js); every write updates the cache
 * AND writes through to Supabase. On a single server the app therefore always reads current data and
 * it survives restarts. Reads stay synchronous, so routes and serializers are untouched.
 *
 * Disabled under NODE_ENV=test (the suite keeps its fast, offline in-memory path) or when no
 * DATABASE_URL is set (pure local demo). Writes are fire-and-forget with error logging so a slow DB
 * never blocks a response; the cache already reflects the change. Carts and OTPs stay ephemeral.
 */
import { prisma } from './db.js';

export const persistEnabled = process.env.NODE_ENV !== 'test' && !!process.env.DATABASE_URL;

const iso = (d) => (d && d.toISOString ? d.toISOString() : d);

// ── DB row → in-memory shape (must match what store.js / serialize.js expect) ──
const rowToCategory = (r) => ({ id: r.id, name: r.name, tint: r.tint, order: r.order });
const rowToProduct = (r) => ({
  id: r.id,
  category: r.categoryId,
  name: r.name,
  aliases: r.aliases || [],
  unit: r.unit,
  increment: Number(r.increment),
  pricePaise: r.pricePaise,
  costPaise: r.costPaise,
  dailyCap: r.dailyCap,
  bufferPct: r.bufferPct,
  farm: r.farm,
  image: r.image,
  blurhash: r.blurhash,
  variableWeight: r.variableWeight,
  diet: r.diet,
  isSeasonal: r.isSeasonal,
  isActive: r.isActive,
  availability: r.availability,
  createdAt: iso(r.createdAt),
});
const rowToCommunity = (r) => ({
  id: r.id,
  name: r.name,
  area: r.area,
  blocks: r.blocks || [],
  deliveryDays: r.deliveryDays || [],
  // Null for a row written before windows became a list; communityWindows() then reads the two
  // cut-off columns below and presents them as the pair they always described.
  windows: Array.isArray(r.windows) && r.windows.length ? r.windows : null,
  morningCutoff: r.morningCutoff || '03:45',
  orderLeadDays: r.orderLeadDays ?? 1,
  eveningCutoff: r.eveningCutoff || '15:00',
  cutoffWarningMinutes: r.cutoffWarningMinutes ?? 15,
  isActive: r.isActive,
});
const rowToCoupon = (r) => ({
  code: r.code,
  label: r.label,
  type: r.type,
  valueBp: r.valueBp,
  valuePaise: r.valuePaise,
  freeProductId: r.freeProductId,
  minOrderPaise: r.minOrderPaise,
  batchId: r.batchId,
  expiresAt: iso(r.expiresAt),
  globalCap: r.globalCap,
  redeemedCount: r.redeemedCount,
  isActive: r.isActive,
});
const rowToStaff = (r) => ({
  id: r.id,
  mobile: r.mobile,
  name: r.name,
  role: r.role,
  aiAccess: r.aiAccess,
  createdAt: iso(r.createdAt),
});

// ── in-memory shape → DB columns ──
const productToRow = (p) => ({
  id: p.id,
  categoryId: p.category,
  name: p.name,
  aliases: p.aliases || [],
  unit: p.unit,
  increment: String(p.increment),
  pricePaise: p.pricePaise,
  costPaise: p.costPaise ?? 0,
  dailyCap: p.dailyCap ?? 100,
  bufferPct: p.bufferPct ?? 10,
  farm: p.farm ?? null,
  image: p.image ?? null,
  blurhash: p.blurhash ?? null,
  variableWeight: !!p.variableWeight,
  diet: p.diet || (p.category === 'cat_meat' ? 'NONVEG' : 'VEG'),
  isSeasonal: !!p.isSeasonal,
  isActive: p.isActive !== false,
  availability: p.availability || 'AVAILABLE',
});
const couponToRow = (c) => ({
  code: String(c.code).toUpperCase(),
  label: c.label ?? null,
  type: c.type,
  valueBp: c.valueBp ?? null,
  valuePaise: c.valuePaise ?? null,
  freeProductId: c.freeProductId ?? null,
  minOrderPaise: c.minOrderPaise ?? 0,
  batchId: c.batchId ?? null,
  expiresAt: new Date(c.expiresAt || '2030-12-31T23:59:59+05:30'),
  globalCap: c.globalCap ?? null,
  redeemedCount: c.redeemedCount ?? 0,
  isActive: c.isActive !== false,
});
const communityToRow = (c) => ({
  id: c.id,
  name: c.name,
  area: c.area ?? null,
  blocks: c.blocks || [],
  deliveryDays: c.deliveryDays || [],
  windows: Array.isArray(c.windows) ? c.windows : [],
  morningCutoff: c.morningCutoff ?? '03:45',
  orderLeadDays: c.orderLeadDays ?? 1,
  eveningCutoff: c.eveningCutoff ?? '15:00',
  cutoffWarningMinutes: c.cutoffWarningMinutes ?? 15,
  isActive: c.isActive !== false,
});
const staffToRow = (s) => ({
  id: s.id,
  mobile: String(s.mobile),
  name: s.name ?? null,
  role: s.role,
  aiAccess: !!s.aiAccess,
});

/**
 * Whether the `Community.windows` column exists in the database yet.
 *
 * This deploys ahead of its schema. Render's build runs `prisma generate` but NOT a migration —
 * this project applies schema changes with `prisma db push`, by hand — so between a deploy and that
 * push the generated client knows a column Postgres does not have. Prisma selects every scalar
 * field by default, so `community.findMany()` throws, and because that call sits inside `loadAll()`
 * the throw took down boot hydration entirely: the API fell back to the in-memory DEMO SEED and
 * disabled persistence, serving three seeded communities in place of the real ones.
 *
 * So: try the full read, and on a missing-column error fall back to selecting only the columns that
 * predate this feature. Communities then come back with no `windows`, which `communityWindows()`
 * already reads as the MORNING/EVENING pair described by the two cut-off columns — the same
 * fallback a pre-windows row gets. The API serves real data throughout; the only thing that waits
 * for `db push` is the ability to EDIT the windows.
 */
let hasWindowsColumn = true;

/** Every Community column that existed before `windows`. Explicit, so Prisma cannot select it. */
const LEGACY_COMMUNITY_SELECT = {
  id: true,
  name: true,
  area: true,
  blocks: true,
  deliveryDays: true,
  morningCutoff: true,
  eveningCutoff: true,
  cutoffWarningMinutes: true,
  orderLeadDays: true,
  isActive: true,
};

/** Postgres 42703 / Prisma P2022 — "column does not exist". */
const isMissingColumn = (e) =>
  e?.code === 'P2022' || /column .* does not exist/i.test(e?.message || '');

async function findCommunities() {
  if (hasWindowsColumn) {
    try {
      return await prisma.community.findMany();
    } catch (e) {
      if (!isMissingColumn(e)) throw e;
      hasWindowsColumn = false;
      // eslint-disable-next-line no-console
      console.error(
        '[persist] Community.windows is missing — reading without it, and window edits will not ' +
          'persist. Run `pnpm --filter api db:push` against the production database to add it.',
      );
    }
  }
  return prisma.community.findMany({ select: LEGACY_COMMUNITY_SELECT });
}

/** Read every master-data table and return in-memory-shaped collections + the settings row. */
export async function loadAll() {
  const [categories, products, communities, coupons, staff, config] = await Promise.all([
    prisma.category.findMany(),
    prisma.product.findMany(),
    findCommunities(),
    prisma.coupon.findMany(),
    prisma.staff.findMany(),
    prisma.appConfig.findUnique({ where: { id: 1 } }),
  ]);
  return {
    categories: categories.map(rowToCategory).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    products: products.map(rowToProduct),
    communities: communities.map(rowToCommunity),
    coupons: coupons.map(rowToCoupon),
    staff: staff.map(rowToStaff),
    config,
  };
}

// ── transactional shapes (stage 2): customers, addresses, orders, payments ──
const customerCreate = (c, w) => ({
  id: c.id,
  mobile: c.mobile,
  name: c.name ?? null,
  email: c.email ?? null,
  walletBalancePaise: w?.balancePaise ?? 0,
  walletLedger: w?.ledger ?? [],
  createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
});
const customerUpdate = (c, w) => ({
  mobile: c.mobile,
  name: c.name ?? null,
  email: c.email ?? null,
  ...(w ? { walletBalancePaise: w.balancePaise ?? 0, walletLedger: w.ledger ?? [] } : {}),
});
const addressToRow = (a, customerId) => ({
  id: a.id,
  customerId,
  communityId: a.communityId,
  block: a.block,
  flat: a.flat,
  floor: a.floor ?? null,
  landmark: a.landmark ?? null,
  recipientName: a.recipientName ?? null,
  contactNumber: a.contactNumber ?? null,
  isDefault: !!a.isDefault,
});
const orderToRow = (o) => ({
  id: o.id,
  orderNumber: o.orderNumber,
  status: o.status,
  customerId: o.customerId ?? null,
  customerName: o.customerName ?? null,
  mobile: o.mobile ?? null,
  items: o.items ?? [],
  address: o.address ?? null,
  timeline: o.timeline ?? [],
  subtotalPaise: o.subtotalPaise,
  costPaise: o.costPaise ?? 0,
  couponCode: o.couponCode ?? null,
  couponDiscountPaise: o.couponDiscountPaise ?? 0,
  deliveryChargePaise: o.deliveryChargePaise ?? 0,
  totalPaise: o.totalPaise,
  walletAppliedPaise: o.walletAppliedPaise ?? 0,
  gatewayAmountPaise: o.gatewayAmountPaise ?? 0,
  deliveryDate: o.deliveryDate ?? null,
  window: o.window ?? null,
  deliveryNote: o.deliveryNote ?? null,
  paymentMethod: o.paymentMethod ?? 'PREPAID',
  codCollectedPaise: o.codCollectedPaise ?? 0,
  codCollectedAt: o.codCollectedAt ?? null,
  deliveryOtp: o.deliveryOtp ?? null,
  deliveryOtpIssuedAt: o.deliveryOtpIssuedAt ?? null,
  deliveredAt: o.deliveredAt ?? null,
  issues: o.issues ?? [],
  cancelRequested: !!o.cancelRequested,
  cancelReason: o.cancelReason ?? null,
  cancelRequestedAt: o.cancelRequestedAt ?? null,
  createdAt: o.createdAt,
});
const paymentToRow = (p) => ({
  id: p.id,
  customerId: p.customerId,
  orderId: p.orderId ?? null,
  purpose: p.purpose,
  amountPaise: p.amountPaise,
  status: p.status,
  razorpayOrderId: p.razorpayOrderId ?? null,
  razorpayPaymentId: p.razorpayPaymentId ?? null,
});

/** Read all transactional tables. Enrichment (address community names) happens in the store. */
export async function loadTransactional() {
  const [customers, addresses, sessions, devices, redemptions, orders, payments, carts] =
    await Promise.all([
      prisma.customer.findMany(),
      prisma.address.findMany(),
      prisma.session.findMany(),
      prisma.device.findMany(),
      prisma.couponRedemption.findMany(),
      prisma.order.findMany(),
      prisma.payment.findMany(),
      // The basket table was added after the others. If it is not in the database yet, boot with
      // empty baskets rather than failing hydration — a throw here would disable persistence for
      // the whole process and drop the API back to seed data.
      prisma.cart.findMany().catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[persist] cart table unavailable, starting with empty baskets:', e?.message);
        return [];
      }),
    ]);
  return { customers, addresses, sessions, devices, redemptions, orders, payments, carts };
}

const logErr = (op) => (e) =>
  // eslint-disable-next-line no-console
  console.error(`[persist] ${op} failed:`, e?.message || e);

// Persistence can be switched off at runtime: if boot-time hydration fails, the process is serving
// the in-memory SEED, and letting it write through would overwrite live rows with demo data.
let enabled = persistEnabled;
export function disablePersistence(reason) {
  if (!enabled) return;
  enabled = false;
  // eslint-disable-next-line no-console
  console.error(`[persist] DISABLED for this process — ${reason}`);
}
export const isPersistenceEnabled = () => enabled;

/**
 * Serialise async work per key: the next write for the same record starts only after the previous
 * one settled. Writes for different keys still run concurrently. Without this, two rapid upserts of
 * the same order (create → cancel within ms) travelled the pool independently and the EARLIER row
 * could land last, leaving the DB with the pre-cancel status.
 */
const chains = new Map();
export function serialize(key, run) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(run, run);
  chains.set(key, next);
  // The cleanup chain must never be the thing that reports a failure: `next` belongs to the caller
  // (and every caller via `wt` already catches), but the promise `.finally()` derives from it is
  // ours and nobody awaits it — left bare, a rejected write surfaces as an unhandled rejection.
  next
    .finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    })
    .catch(() => {});
  return next;
}

// Wrap each write so it is a no-op when persistence is off (test / no DATABASE_URL); callers never
// branch. Writes are fire-and-forget (the cache already reflects the change); failures are logged.
// `keyOf(...args)` (optional) names the record so writes to it are applied in call order.
const wt =
  (op, fn, keyOf) =>
  (...args) => {
    if (!enabled) return undefined;
    const run = () =>
      Promise.resolve()
        .then(() => fn(...args))
        .catch(logErr(op));
    return keyOf ? serialize(`${op.split('.')[0]}:${keyOf(...args)}`, run) : run();
  };

export const persist = {
  // ── master data (stage 1) ──
  productUpsert: wt(
    'product.upsert',
    (p) => {
      const row = productToRow(p);
      return prisma.product.upsert({ where: { id: p.id }, create: row, update: row });
    },
    (p) => p.id,
  ),
  productDelete: wt('product.delete', (pid) => prisma.product.delete({ where: { id: pid } })),
  couponUpsert: wt(
    'coupon.upsert',
    (c) => {
      const row = couponToRow(c);
      return prisma.coupon.upsert({ where: { code: row.code }, create: row, update: row });
    },
    (c) => String(c.code).toUpperCase(),
  ),
  couponDelete: wt('coupon.delete', (code) =>
    prisma.coupon.delete({ where: { code: String(code).toUpperCase() } }),
  ),
  communityUpsert: wt('community.upsert', (c) => {
    const row = communityToRow(c);
    // Same reason as findCommunities(): writing a column the database does not have yet fails the
    // whole upsert, which would lose the delivery-day and block edits riding along with it.
    if (!hasWindowsColumn) delete row.windows;
    return prisma.community.upsert({ where: { id: c.id }, create: row, update: row });
  }),
  staffUpsert: wt('staff.upsert', (s) => {
    const row = staffToRow(s);
    return prisma.staff.upsert({ where: { id: s.id }, create: row, update: row });
  }),
  staffDelete: wt('staff.delete', (sid) => prisma.staff.delete({ where: { id: sid } })),
  configUpdate: wt('config.update', (data) =>
    prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data }),
  ),
  // The basket. Serialised per customer: add-then-remove within milliseconds must not land in the
  // wrong order and leave the removed line in the database.
  cartSave: wt(
    'cart.save',
    (cid, c) => {
      const row = { items: c?.items || [], couponCode: c?.couponCode || null };
      return prisma.cart.upsert({
        where: { customerId: cid },
        create: { customerId: cid, ...row },
        update: row,
      });
    },
    (cid) => cid,
  ),
  cartDelete: wt(
    'cart.delete',
    (cid) => prisma.cart.delete({ where: { customerId: cid } }).catch(() => undefined),
    (cid) => cid,
  ),

  // ── transactional (stage 2) ──
  customerUpsert: wt(
    'customer.upsert',
    (c, wallet) =>
      prisma.customer.upsert({
        where: { id: c.id },
        create: customerCreate(c, wallet),
        update: customerUpdate(c, wallet),
      }),
    (c) => c.id,
  ),
  // Same key as customerUpsert on purpose: both write the customer row, so they must not race.
  walletUpdate: wt(
    'customer.wallet',
    (cid, balancePaise, ledger) =>
      prisma.customer.update({
        where: { id: cid },
        data: { walletBalancePaise: balancePaise, walletLedger: ledger },
      }),
    (cid) => cid,
  ),
  addressUpsert: wt('address.upsert', (a, cid) => {
    const row = addressToRow(a, cid);
    return prisma.address.upsert({ where: { id: a.id }, create: row, update: row });
  }),
  orderUpsert: wt(
    'order.upsert',
    (o) => {
      const row = orderToRow(o);
      return prisma.order.upsert({ where: { id: o.id }, create: row, update: row });
    },
    (o) => o.id,
  ),
  paymentUpsert: wt(
    'payment.upsert',
    (p) => {
      const row = paymentToRow(p);
      return prisma.payment.upsert({ where: { id: p.id }, create: row, update: row });
    },
    (p) => p.id,
  ),
  sessionUpsert: wt('session.upsert', (refreshToken, customerId) =>
    prisma.session.upsert({
      where: { refreshToken },
      create: { refreshToken, customerId, expiresAt: new Date(Date.now() + 90 * 864e5) },
      update: {},
    }),
  ),
  sessionDelete: wt('session.delete', (refreshToken) =>
    prisma.session.deleteMany({ where: { refreshToken } }),
  ),
  sessionsDeleteForCustomer: wt('session.deleteForCustomer', (customerId) =>
    prisma.session.deleteMany({ where: { customerId } }),
  ),
  deviceUpsert: wt('device.upsert', (cid, token) =>
    prisma.device.upsert({
      where: { expoPushToken: token },
      create: { expoPushToken: token, customerId: cid },
      update: { customerId: cid },
    }),
  ),
  redemptionAdd: wt('redemption.add', (cid, code) =>
    prisma.couponRedemption.upsert({
      where: { couponCode_customerId: { couponCode: String(code).toUpperCase(), customerId: cid } },
      create: { couponCode: String(code).toUpperCase(), customerId: cid },
      update: {},
    }),
  ),
  redemptionDelete: wt('redemption.delete', (cid, code) =>
    prisma.couponRedemption.deleteMany({
      where: { couponCode: String(code).toUpperCase(), customerId: cid },
    }),
  ),
};
