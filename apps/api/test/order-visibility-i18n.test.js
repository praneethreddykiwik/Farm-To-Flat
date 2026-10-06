/**
 * Two things a tester found in the app, both of which are really about what an order IS.
 *
 * 1. A PAYMENT_FAILED order is not an order. The wallet was returned, the stock released and the
 *    coupon freed the moment the payment failed, and nothing will ever be delivered against it —
 *    yet it sat in "Your orders" with a date and a total, looking exactly like a real one.
 * 2. The NAME on an order line is a label, not a fact about the order. Price and quantity must
 *    never move after the fact; the name should follow whatever language the shopper is reading in.
 */
import { describe, expect, it } from 'vitest';
import { orderCustomer } from '../src/serialize.js';
import { listProducts } from '../src/store.js';

describe('what the customer sees of an order', () => {
  const product = listProducts().find((p) => p.id);

  const makeOrder = (status) => ({
    id: 'ord_x',
    orderNumber: 'F2F-0001',
    status,
    items: [
      {
        id: 'li_1',
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantity: 1,
        unitPricePaise: 1000,
        lineTotalPaise: 1000,
      },
    ],
    subtotalPaise: 1000,
    totalPaise: 1000,
    deliveryDate: '2026-10-08',
    window: 'MORNING',
    address: {},
    createdAt: new Date().toISOString(),
    timeline: [],
  });

  it('carries the translations for a line, so the order screen can follow the language', () => {
    const o = orderCustomer(makeOrder('CONFIRMED'));
    const line = o.items[0];
    expect(line.name).toBe(product.name);
    // `names` is present; a product with no translation for a language simply omits that key.
    expect(line).toHaveProperty('names');
    if (line.names?.te) expect(line.names.te).not.toBe(line.name);
    if (line.names?.hi) expect(line.names.hi).not.toBe(line.name);
  });

  it('still reports the price and quantity from the order, never from today’s catalog', () => {
    const o = orderCustomer(makeOrder('CONFIRMED'));
    expect(o.items[0].unitPricePaise).toBe('1000');
    expect(o.items[0].lineTotalPaise).toBe('1000');
  });

  it('leaves a line alone when its product is gone from the catalog', () => {
    const order = makeOrder('CONFIRMED');
    order.items[0].productId = 'prd_deleted_long_ago';
    order.items[0].name = 'Something delisted';
    const o = orderCustomer(order);
    expect(o.items[0].name).toBe('Something delisted');
    expect(o.items[0].names).toBeUndefined();
  });

  it('never leaks cost or margin onto a line, translations or not', () => {
    const o = orderCustomer(makeOrder('CONFIRMED'));
    const blob = JSON.stringify(o);
    for (const leak of ['costPaise', 'marginPaise', 'marginPct']) expect(blob).not.toContain(leak);
  });
});
