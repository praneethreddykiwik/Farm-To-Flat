/**
 * Serialisers — the ONLY place internal rows become wire JSON, and the place the customer/operator
 * field split is enforced.
 *
 * NON-NEGOTIABLE: the customer-facing serialiser never emits `costPaise`, `margin*`, or any
 * procurement figure. The admin serialiser is the operator panel and DOES expose cost + margin, so
 * Tharun can price. There is a test (serialize.test.js) that greps the public shape for leaks.
 */
import { getProduct, listCategories } from './store.js';
import { money } from './lib/money.js';

const rupees = (paise) => `₹${Math.round(Number(paise) / 100).toLocaleString('en-IN')}`;

/** Human "what you get" line for a coupon, e.g. "10% off", "₹100 off", "Free coriander". */
export function couponDiscountText(c) {
  if (c.type === 'PERCENT') return `${Math.round(c.valueBp / 100)}% off`;
  if (c.type === 'FLAT') return `${rupees(c.valuePaise)} off`;
  if (c.type === 'FREE_ITEM') return `Free ${getProduct(c.freeProductId)?.name || 'item'}`;
  return c.label || 'Discount';
}

/**
 * Customer-facing coupon — terms only, never internal caps. `unlockText` tells the shopper exactly
 * what's needed, e.g. "Spend ₹500 to unlock" or (when their basket already qualifies) null.
 */
export function couponPublic(c, subtotalPaise = 0) {
  const min = Number(c.minOrderPaise || 0);
  const met = Number(subtotalPaise) >= min;
  return {
    code: c.code,
    label: c.label || couponDiscountText(c),
    type: c.type,
    discountText: couponDiscountText(c),
    minOrderPaise: money(min),
    minOrderText: min > 0 ? `Spend ${rupees(min)} to unlock` : 'No minimum',
    unlockText:
      !met && min > 0 ? `Add ${rupees(min - Number(subtotalPaise))} more to unlock` : null,
    meetsMinimum: met,
    expiresAt: c.expiresAt,
  };
}

/** Operator coupon — the full row incl. caps and redemption count. */
export function couponAdmin(c) {
  return {
    code: c.code,
    label: c.label || couponDiscountText(c),
    type: c.type,
    valueBp: c.valueBp ?? null,
    valuePaise: c.valuePaise != null ? money(c.valuePaise) : null,
    freeProductId: c.freeProductId ?? null,
    discountText: couponDiscountText(c),
    minOrderPaise: money(c.minOrderPaise || 0),
    expiresAt: c.expiresAt,
    globalCap: c.globalCap ?? null,
    redeemedCount: c.redeemedCount ?? 0,
    isActive: c.isActive !== false,
  };
}

let _cats = null;
const cats = () => (_cats ||= listCategories());
const tintFor = (categoryId) => cats().find((c) => c.id === categoryId)?.tint;
const catName = (categoryId) => cats().find((c) => c.id === categoryId)?.name;

/** Customer-facing product. Must match apps/customer/src/api/mock/server.js serialiseProduct. */
export function productPublic(p) {
  return {
    id: p.id,
    name: p.name,
    aliases: p.aliases,
    categoryId: p.category,
    categoryName: catName(p.category),
    tint: tintFor(p.category),
    unit: p.unit,
    increment: p.increment,
    pricePaise: money(p.pricePaise),
    dailyCap: p.dailyCap,
    farm: p.farm,
    image: p.image,
    blurhash: p.blurhash || null,
    variableWeight: !!p.variableWeight,
    diet: dietOf(p),
    isSeasonal: !!p.isSeasonal,
    isActive: p.isActive !== false,
    availability: p.availability || (p.isActive === false ? 'HIDDEN' : 'AVAILABLE'),
  };
}

/** Veg / non-veg. Explicit p.diet wins; otherwise everything in Meat & fish is non-veg, rest veg. */
export function dietOf(p) {
  if (p.diet === 'VEG' || p.diet === 'NONVEG') return p.diet;
  return p.category === 'cat_meat' ? 'NONVEG' : 'VEG';
}

/** Operator product — everything the public shape has, PLUS cost and derived margin. */
export function productAdmin(p) {
  const price = Math.round(p.pricePaise);
  const cost = Math.round(p.costPaise ?? 0);
  const marginPaise = price - cost;
  const marginPct = price > 0 ? Math.round((marginPaise / price) * 1000) / 10 : 0;
  return {
    ...productPublic(p),
    costPaise: money(cost),
    marginPaise: money(marginPaise),
    marginPct,
    bufferPct: p.bufferPct ?? 10,
    createdAt: p.createdAt,
  };
}

export function categoryPublic(c) {
  return { id: c.id, name: c.name, tint: c.tint, order: c.order };
}

export function communityPublic(c) {
  return { id: c.id, name: c.name, area: c.area, blocks: c.blocks, deliveryDays: c.deliveryDays };
}

export function communityAdmin(c) {
  return {
    ...communityPublic(c),
    lat: c.lat,
    lng: c.lng,
    cutoffHours: c.cutoffHours,
    windowCapacity: c.windowCapacity,
    isActive: c.isActive !== false,
  };
}

function orderItems(items) {
  return items.map((it) => ({
    id: it.id,
    productId: it.productId,
    name: it.name,
    unit: it.unit,
    quantity: it.quantity,
    unitPricePaise: money(it.unitPricePaise),
    lineTotalPaise: money(it.lineTotalPaise),
    note: it.note || null,
  }));
}

/** Customer view of a customer (contract shape). */
export function customerPublic(c, { isNew, hasAddress } = {}) {
  return {
    id: c.id,
    mobile: c.mobile,
    name: c.name ?? null,
    email: c.email ?? null,
    hasAddress: !!hasAddress,
    ...(isNew !== undefined ? { isNew } : {}),
  };
}

/** Customer-facing order line — NEVER emits cost/margin. */
function orderItemsCustomer(items) {
  return items.map((it) => ({
    id: it.id,
    productId: it.productId,
    name: it.name,
    unit: it.unit,
    increment: it.increment,
    image: it.image ?? null,
    blurhash: it.blurhash ?? null,
    tint: it.tint,
    variableWeight: !!it.variableWeight,
    quantity: it.quantity,
    unitPricePaise: money(it.unitPricePaise),
    lineTotalPaise: money(it.lineTotalPaise),
    note: it.note || null,
  }));
}

/** Customer-facing order (contract Order shape). No cost/margin fields. */
export function orderCustomer(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    items: orderItemsCustomer(o.items),
    subtotalPaise: money(o.subtotalPaise),
    couponDiscountPaise: money(o.couponDiscountPaise || 0),
    deliveryChargePaise: money(o.deliveryChargePaise || 0),
    totalPaise: money(o.totalPaise),
    walletAppliedPaise: money(o.walletAppliedPaise || 0),
    gatewayAmountPaise: money(o.gatewayAmountPaise || 0),
    couponCode: o.couponCode || null,
    deliveryDate: o.deliveryDate,
    window: o.window,
    address: o.address,
    createdAt: o.createdAt,
    timeline: o.timeline,
    cancelRequested: !!o.cancelRequested,
    cancelReason: o.cancelReason || null,
    // Can start a cancellation unless it's already done, delivered, or a request is pending.
    canCancel: !['DELIVERED', 'CANCELLED'].includes(o.status) && !o.cancelRequested,
  };
}

/** Operator order — used by the admin order list + fulfilment screens. */
export function orderAdmin(o) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    customerName: o.customerName,
    mobile: o.mobile,
    items: orderItems(o.items),
    itemCount: o.items.length,
    subtotalPaise: money(o.subtotalPaise),
    couponDiscountPaise: money(o.couponDiscountPaise || 0),
    deliveryChargePaise: money(o.deliveryChargePaise || 0),
    totalPaise: money(o.totalPaise),
    couponCode: o.couponCode || null,
    deliveryDate: o.deliveryDate,
    window: o.window,
    address: o.address,
    createdAt: o.createdAt,
    timeline: o.timeline,
    cancelRequested: !!o.cancelRequested,
    cancelReason: o.cancelReason || null,
    cancelRequestedAt: o.cancelRequestedAt || null,
  };
}
