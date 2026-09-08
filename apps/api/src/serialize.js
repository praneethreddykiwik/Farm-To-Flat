/**
 * Serialisers — the ONLY place internal rows become wire JSON, and the place the customer/operator
 * field split is enforced.
 *
 * NON-NEGOTIABLE: the customer-facing serialiser never emits `costPaise`, `margin*`, or any
 * procurement figure. The admin serialiser is the operator panel and DOES expose cost + margin, so
 * Tharun can price. There is a test (serialize.test.js) that greps the public shape for leaks.
 */
import { listCategories } from './store.js';
import { money } from './lib/money.js';

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
    isActive: p.isActive !== false,
  };
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
  };
}
