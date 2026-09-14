/**
 * In-memory datastore. This is the seam the Prisma build replaces: every route reads and writes
 * through this module, never through globals, so swapping to a real database is a matter of giving
 * these same functions a Postgres-backed implementation. State resets when the process restarts.
 *
 * Money is integer paise throughout. Order lines record BOTH price and cost at capture time
 * (unitPricePaise / unitCostPaise), so revenue and margin analytics stay correct even after a
 * product is later repriced or removed. Serialisation (and the customer/operator field split)
 * lives in serialize.js.
 */
import {
  CATEGORIES,
  COMMUNITIES,
  COUPONS,
  DELIVERY_CHARGE_PAISE,
  MIN_ORDER_VALUE_PAISE,
  PRODUCTS,
  SEED_ORDERS,
  TOPUP_DENOMINATIONS_PAISE,
} from './data/seed.js';
import { addDaysISO, todayISO } from './lib/dates.js';
import { id } from './lib/ids.js';
import { persist } from './persistence.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

const db = {
  categories: clone(CATEGORIES),
  products: clone(PRODUCTS),
  communities: clone(COMMUNITIES),
  coupons: clone(COUPONS),
  /** @type {any[]} */
  orders: [],
  /** window bookings, key `${communityId}|${date}|${window}` -> count */
  windows: new Map(),
  /** actual-cost records from procurement, key `${dateKey}|${productId}` -> record. Resets on restart. */
  procurementRecords: new Map(),
  constants: {
    minOrderValuePaise: MIN_ORDER_VALUE_PAISE,
    deliveryChargePaise: DELIVERY_CHARGE_PAISE,
    topupDenominationsPaise: TOPUP_DENOMINATIONS_PAISE,
    // Procurement cost-variance buffer. If the price actually paid is within ±costBufferPct of the
    // estimate, the buy is auto-approved; otherwise it waits for admin approval. Admin editable.
    procurement: { costBufferPct: 2, autoApprove: true },
    // Support contact shown in the app. Each channel is shown to customers only when its toggle is on.
    support: {
      email: 'support@farmtoflat.in',
      phone: '',
      showEmail: true,
      showPhone: false,
    },
  },
};

let seq = 4210;
// Orders persist only after boot (the import-time seed loop below must NOT write). Declared here so
// createOrder (called during seeding) can read it without a temporal-dead-zone error.
let orderPersist = false;

/** Build one order line, capturing price AND cost at this moment. Unknown product ids are dropped. */
function makeLine(productId, qty, note = null) {
  const p = db.products.find((x) => x.id === productId);
  if (!p) return null;
  const quantity = Number(qty);
  return {
    id: id('ci', 8),
    productId: p.id,
    name: p.name,
    unit: p.unit,
    increment: p.increment,
    image: p.image,
    tint: db.categories.find((c) => c.id === p.category)?.tint,
    variableWeight: !!p.variableWeight,
    categoryId: p.category,
    quantity: quantity.toFixed(3),
    unitPricePaise: p.pricePaise,
    unitCostPaise: p.costPaise ?? 0,
    lineTotalPaise: Math.round(p.pricePaise * quantity),
    lineCostPaise: Math.round((p.costPaise ?? 0) * quantity),
    note: note || null,
  };
}

/**
 * Create + store an order. Used by the seed, the "incoming order" simulator, and the real customer
 * order transaction (POST /orders). Lines may be `[productId, qty]` pairs or
 * `{ productId, quantity, note }` objects. Money fields default sensibly when omitted.
 * @param {any} input
 */
export function createOrder(input) {
  const community = db.communities.find((c) => c.id === input.communityId);
  const items = (input.lines || [])
    .map((l) =>
      Array.isArray(l) ? makeLine(l[0], l[1]) : makeLine(l.productId, l.quantity, l.note),
    )
    .filter(Boolean);
  const subtotal = items.reduce((s, l) => s + l.lineTotalPaise, 0);
  const cost = items.reduce((s, l) => s + l.lineCostPaise, 0);
  const delivery = input.deliveryChargePaise ?? db.constants.deliveryChargePaise;
  const discount = input.couponDiscountPaise ?? 0;
  const total = Math.max(0, subtotal - discount + delivery);
  const walletApplied = input.walletAppliedPaise ?? 0;
  const gateway = input.gatewayAmountPaise ?? total - walletApplied;
  const createdAt = input.createdAt || new Date().toISOString();
  const status = input.status || 'CONFIRMED';
  seq += 1;
  const order = {
    id: id('ord', 10),
    orderNumber: `F2F-${seq}`,
    status,
    customerId: input.customerId || null,
    customerName: input.customerName,
    mobile: input.mobile,
    items,
    subtotalPaise: subtotal,
    costPaise: cost,
    couponDiscountPaise: discount,
    deliveryChargePaise: delivery,
    totalPaise: total,
    walletAppliedPaise: walletApplied,
    gatewayAmountPaise: gateway,
    couponCode: input.couponCode || null,
    deliveryDate: input.deliveryDate,
    window: input.window,
    deliveryNote: input.deliveryNote || null,
    address: input.address || {
      communityId: community?.id,
      communityName: community?.name,
      area: community?.area,
      block: input.block,
      flat: input.flat,
    },
    createdAt,
    timeline: [{ status, at: createdAt }],
  };
  db.orders.unshift(order);
  if (orderPersist) persist.orderUpsert(order);
  return clone(order);
}

// seed the initial orders
for (const spec of SEED_ORDERS) {
  createOrder({
    ...spec,
    deliveryDate: addDaysISO(todayISO(), spec.dayOffset),
    createdAt: new Date(Date.now() + (spec.dayOffset - 1) * 864e5).toISOString(),
  });
}
db.orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

/**
 * Replace the seeded master data with what was loaded from Supabase at boot (persistence.loadAll).
 * Orders stay in-memory (stage 2). Called once, before the server accepts requests.
 */
export function hydrate(data) {
  if (data.categories?.length) db.categories = data.categories;
  if (data.products) db.products = data.products;
  if (data.communities) db.communities = data.communities;
  if (data.coupons) db.coupons = data.coupons;
  const cfg = data.config;
  if (cfg) {
    db.constants.minOrderValuePaise = cfg.minOrderValuePaise ?? db.constants.minOrderValuePaise;
    db.constants.deliveryChargePaise = cfg.deliveryChargePaise ?? db.constants.deliveryChargePaise;
    db.constants.procurement = {
      costBufferPct: cfg.procurementCostBufferPct ?? db.constants.procurement.costBufferPct,
      autoApprove: cfg.procurementAutoApprove ?? db.constants.procurement.autoApprove,
    };
    db.constants.support = {
      email: cfg.supportEmail ?? '',
      phone: cfg.supportPhone ?? '',
      showEmail: cfg.supportShowEmail ?? true,
      showPhone: cfg.supportShowPhone ?? false,
    };
  }
}

// boot() calls this after hydration so real orders (not the import-time seed) write through.
export const enableOrderPersistence = () => {
  orderPersist = true;
};

/**
 * Load orders from Supabase into the cache. On the very first boot (empty orders table) the seeded
 * demo orders are pushed up once so the admin has example data; thereafter they load from the DB.
 */
export function hydrateOrders(rows) {
  if (rows?.length) {
    db.orders = rows
      .map((r) => ({
        ...r,
        items: r.items || [],
        timeline: r.timeline || [],
        address: r.address || null,
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } else if (process.env.NODE_ENV === 'production') {
    // Production must start clean — never push the fake demo orders (Imran Khan, Anjali, …) into a
    // real database. Only dev/local gets example data.
    db.orders = [];
  } else {
    for (const o of db.orders) persist.orderUpsert(o); // one-time seed of demo orders (dev only)
  }
  // Continue numbering AFTER the highest order that already exists, so a newly placed order can never
  // reuse a number a stored order already holds. Without this, `seq` reset to its base on every boot
  // and real orders collided with earlier ones (the same F2F-#### showing two different orders).
  syncOrderSeq();
}

/** Advance the order counter past the largest existing F2F-<n>. Safe to call repeatedly. */
export function syncOrderSeq() {
  let max = 0;
  for (const o of db.orders) {
    const m = /^F2F-(\d+)$/.exec(o.orderNumber || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  if (max > seq) seq = max;
}

// ── reads ────────────────────────────────────────────────────────────────
export const listCategories = () => clone(db.categories);
export const listProducts = () => clone(db.products);
export const getProduct = (pid) => {
  const p = db.products.find((x) => x.id === pid);
  return p ? clone(p) : null;
};
export const listCommunities = () => clone(db.communities);
export const getCommunity = (cid) => {
  const c = db.communities.find((x) => x.id === cid);
  return c ? clone(c) : null;
};
export const listCoupons = () => clone(db.coupons);
export const listOrders = () => clone(db.orders);
export const getOrder = (oid) => {
  const o = db.orders.find((x) => x.id === oid);
  return o ? clone(o) : null;
};
/** Orders belonging to one customer, newest first (customer-facing /orders). */
export const listOrdersForCustomer = (customerId) =>
  clone(db.orders.filter((o) => o.customerId === customerId));
export const getOrderForCustomer = (oid, customerId) => {
  const o = db.orders.find((x) => x.id === oid && x.customerId === customerId);
  return o ? clone(o) : null;
};
/** Mutate an order in place by id (used by the order transaction for cancel / status). */
export function patchOrder(oid, fn) {
  const o = db.orders.find((x) => x.id === oid);
  if (!o) return null;
  fn(o);
  if (orderPersist) persist.orderUpsert(o);
  return clone(o);
}
export const constants = () => clone(db.constants);
export const rawProducts = () => db.products;

// ── product writes (admin) ─────────────────────────────────────────────────
export function createProduct(data) {
  const product = {
    id: id('p', 8),
    createdAt: new Date().toISOString(),
    blurhash: null,
    isActive: true,
    availability: 'AVAILABLE',
    bufferPct: 10,
    ...data,
    aliases: data.aliases || [],
  };
  db.products.push(product);
  persist.productUpsert(product);
  return clone(product);
}
export function updateProduct(pid, patch) {
  const p = db.products.find((x) => x.id === pid);
  if (!p) return null;
  Object.assign(p, patch);
  persist.productUpsert(p);
  return clone(p);
}
export function deleteProduct(pid) {
  const i = db.products.findIndex((x) => x.id === pid);
  if (i === -1) return false;
  db.products.splice(i, 1);
  persist.productDelete(pid);
  return true;
}

// ── support contact ──────────────────────────────────────────────────────────
export const getSupport = () => clone(db.constants.support);
export function updateSupport(patch) {
  const s = db.constants.support;
  if (patch.email !== undefined) s.email = String(patch.email).trim();
  if (patch.phone !== undefined) s.phone = String(patch.phone).trim();
  if (patch.showEmail !== undefined) s.showEmail = !!patch.showEmail;
  if (patch.showPhone !== undefined) s.showPhone = !!patch.showPhone;
  persist.configUpdate({
    supportEmail: s.email,
    supportPhone: s.phone,
    supportShowEmail: s.showEmail,
    supportShowPhone: s.showPhone,
  });
  return clone(s);
}
/** Customer-facing: each channel only when its toggle is on. */
export function publicSupport() {
  const s = db.constants.support;
  return {
    email: s.showEmail && s.email ? s.email : null,
    phone: s.showPhone && s.phone ? s.phone : null,
  };
}

// ── procurement cost-buffer approval ────────────────────────────────────────
export const getProcurementSettings = () => clone(db.constants.procurement);
export function updateProcurementSettings(patch) {
  const s = db.constants.procurement;
  if (patch.costBufferPct != null)
    s.costBufferPct = Math.max(0, Math.min(100, Number(patch.costBufferPct)));
  if (patch.autoApprove != null) s.autoApprove = !!patch.autoApprove;
  persist.configUpdate({
    procurementCostBufferPct: s.costBufferPct,
    procurementAutoApprove: s.autoApprove,
  });
  return clone(s);
}

/** Decide a buy's status from how far the paid price strayed from the estimate. */
function decideStatus(estCostPaise, actualCostPaise, settings) {
  const est = Number(estCostPaise);
  if (!est || est <= 0) return { status: 'NEEDS_APPROVAL', variancePct: null };
  const variancePct = ((Number(actualCostPaise) - est) / est) * 100;
  const within = Math.abs(variancePct) <= Number(settings.costBufferPct || 0);
  return {
    status: settings.autoApprove && within ? 'AUTO_APPROVED' : 'NEEDS_APPROVAL',
    variancePct: Math.round(variancePct * 10) / 10,
  };
}

/** Procurement submits what they actually paid for a line. Returns the decided record. */
export function submitProcurementCost({ productId, dateKey, estCostPaise, actualCostPaise }) {
  const settings = db.constants.procurement;
  const { status, variancePct } = decideStatus(estCostPaise, actualCostPaise, settings);
  const record = {
    productId,
    dateKey: dateKey || 'all',
    estCostPaise: Number(estCostPaise),
    actualCostPaise: Number(actualCostPaise),
    variancePct,
    bufferPctAtSubmit: settings.costBufferPct,
    status,
    submittedAt: new Date().toISOString(),
    decidedAt: status === 'AUTO_APPROVED' ? new Date().toISOString() : null,
  };
  db.procurementRecords.set(`${record.dateKey}|${productId}`, record);
  return clone(record);
}

/** Admin approves or rejects a line that fell outside the buffer. */
export function decideProcurementCost({ productId, dateKey, decision }) {
  const key = `${dateKey || 'all'}|${productId}`;
  const r = db.procurementRecords.get(key);
  if (!r) return null;
  r.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  r.decidedAt = new Date().toISOString();
  return clone(r);
}

export const getProcurementRecord = (productId, dateKey) =>
  clone(db.procurementRecords.get(`${dateKey || 'all'}|${productId}`) || null);
export const listProcurementRecords = (dateKey) =>
  [...db.procurementRecords.values()]
    .filter((r) => !dateKey || r.dateKey === dateKey || r.dateKey === 'all')
    .map((r) => clone(r));

// ── coupon writes (admin) ───────────────────────────────────────────────────
export const getCoupon = (code) => {
  const c = db.coupons.find((x) => x.code.toLowerCase() === String(code).toLowerCase());
  return c ? clone(c) : null;
};
export function createCoupon(data) {
  const coupon = {
    batchId: 'batch_admin',
    expiresAt: '2030-12-31T23:59:59+05:30',
    globalCap: null,
    redeemedCount: 0,
    isActive: true,
    ...data,
    code: String(data.code).toUpperCase(),
  };
  db.coupons.push(coupon);
  persist.couponUpsert(coupon);
  return clone(coupon);
}
export function updateCoupon(code, patch) {
  const c = db.coupons.find((x) => x.code.toLowerCase() === String(code).toLowerCase());
  if (!c) return null;
  Object.assign(c, patch);
  persist.couponUpsert(c);
  return clone(c);
}
export function deleteCoupon(code) {
  const i = db.coupons.findIndex((x) => x.code.toLowerCase() === String(code).toLowerCase());
  if (i === -1) return false;
  const [removed] = db.coupons.splice(i, 1);
  persist.couponDelete(removed.code);
  return true;
}

// ── community writes (admin) ────────────────────────────────────────────────
export function updateCommunity(cid, patch) {
  const c = db.communities.find((x) => x.id === cid);
  if (!c) return null;
  Object.assign(c, patch);
  persist.communityUpsert(c);
  return clone(c);
}
export function createCommunity(data) {
  const community = {
    id: id('com', 8),
    isActive: true,
    ...data,
    blocks: data.blocks || [],
    // New communities deliver every day by default (so windows appear immediately); the admin can
    // then narrow the days per community. Capacity + cutoff get sensible defaults too.
    deliveryDays: data.deliveryDays?.length ? data.deliveryDays : [0, 1, 2, 3, 4, 5, 6],
    cutoffHours: data.cutoffHours ?? 10,
    windowCapacity: data.windowCapacity ?? 40,
  };
  db.communities.push(community);
  persist.communityUpsert(community);
  return clone(community);
}

// ── order writes (admin) ────────────────────────────────────────────────────
export function updateOrderStatus(oid, status) {
  const o = db.orders.find((x) => x.id === oid);
  if (!o) return null;
  o.status = status;
  o.timeline.push({ status, at: new Date().toISOString() });
  if (orderPersist) persist.orderUpsert(o);
  return clone(o);
}

// ── window bookings ─────────────────────────────────────────────────────────
export const bookedFor = (communityId, date, window) =>
  db.windows.get(`${communityId}|${date}|${window}`) || 0;
export function book(communityId, date, window) {
  const key = `${communityId}|${date}|${window}`;
  db.windows.set(key, (db.windows.get(key) || 0) + 1);
}

export { db };
