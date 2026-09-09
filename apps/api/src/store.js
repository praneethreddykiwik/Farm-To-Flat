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
  constants: {
    minOrderValuePaise: MIN_ORDER_VALUE_PAISE,
    deliveryChargePaise: DELIVERY_CHARGE_PAISE,
    topupDenominationsPaise: TOPUP_DENOMINATIONS_PAISE,
  },
};

let seq = 4210;

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
  return clone(product);
}
export function updateProduct(pid, patch) {
  const p = db.products.find((x) => x.id === pid);
  if (!p) return null;
  Object.assign(p, patch);
  return clone(p);
}
export function deleteProduct(pid) {
  const i = db.products.findIndex((x) => x.id === pid);
  if (i === -1) return false;
  db.products.splice(i, 1);
  return true;
}

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
  return clone(coupon);
}
export function updateCoupon(code, patch) {
  const c = db.coupons.find((x) => x.code.toLowerCase() === String(code).toLowerCase());
  if (!c) return null;
  Object.assign(c, patch);
  return clone(c);
}
export function deleteCoupon(code) {
  const i = db.coupons.findIndex((x) => x.code.toLowerCase() === String(code).toLowerCase());
  if (i === -1) return false;
  db.coupons.splice(i, 1);
  return true;
}

// ── community writes (admin) ────────────────────────────────────────────────
export function updateCommunity(cid, patch) {
  const c = db.communities.find((x) => x.id === cid);
  if (!c) return null;
  Object.assign(c, patch);
  return clone(c);
}
export function createCommunity(data) {
  const community = { id: id('com', 8), isActive: true, ...data, blocks: data.blocks || [] };
  db.communities.push(community);
  return clone(community);
}

// ── order writes (admin) ────────────────────────────────────────────────────
export function updateOrderStatus(oid, status) {
  const o = db.orders.find((x) => x.id === oid);
  if (!o) return null;
  o.status = status;
  o.timeline.push({ status, at: new Date().toISOString() });
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
