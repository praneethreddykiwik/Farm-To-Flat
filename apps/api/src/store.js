/**
 * In-memory datastore. This is the seam the Prisma build replaces: every route reads and writes
 * through this module, never through globals, so swapping to a real database is a matter of giving
 * these same functions a Postgres-backed implementation. State resets when the process restarts.
 *
 * Money is integer paise throughout. Nothing here emits to the wire — serialisation (and the
 * customer/operator field split) lives in serialize.js.
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

/** @typedef {{ items: any[] }} Cart */

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

// ── seed orders ────────────────────────────────────────────────────────────
let seq = 4210;
function buildSeedOrder(spec) {
  const community = db.communities.find((c) => c.id === spec.communityId);
  const lines = spec.lines
    .map(([pid, qty]) => {
      const p = db.products.find((x) => x.id === pid);
      if (!p) return null; // unknown product id in seed -> skip, never crash
      const quantity = Number(qty);
      const lineTotalPaise = Math.round(p.pricePaise * quantity);
      return {
        id: id('ci', 8),
        productId: p.id,
        name: p.name,
        unit: p.unit,
        quantity: quantity.toFixed(3),
        unitPricePaise: p.pricePaise,
        lineTotalPaise,
        note: null,
      };
    })
    .filter(Boolean);
  const subtotal = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
  const delivery = db.constants.deliveryChargePaise;
  const total = subtotal + delivery;
  const deliveryDate = addDaysISO(todayISO(), spec.dayOffset);
  const createdAt = new Date(Date.now() + (spec.dayOffset - 1) * 864e5).toISOString();
  seq += 1;
  return {
    id: id('ord', 10),
    orderNumber: `F2F-${seq}`,
    status: spec.status,
    customerName: spec.customerName,
    mobile: spec.mobile,
    items: lines,
    subtotalPaise: subtotal,
    couponDiscountPaise: 0,
    deliveryChargePaise: delivery,
    totalPaise: total,
    couponCode: null,
    deliveryDate,
    window: spec.window,
    address: {
      communityId: community?.id,
      communityName: community?.name,
      area: community?.area,
      block: spec.block,
      flat: spec.flat,
    },
    createdAt,
    timeline: [{ status: spec.status, at: createdAt }],
  };
}
for (const spec of SEED_ORDERS) db.orders.push(buildSeedOrder(spec));
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
export const constants = () => clone(db.constants);
export const rawProducts = () => db.products; // for search scoring (read-only use)

// ── product writes (admin) ─────────────────────────────────────────────────
export function createProduct(data) {
  const product = {
    id: id('p', 8),
    createdAt: new Date().toISOString(),
    blurhash: null,
    isActive: true,
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
