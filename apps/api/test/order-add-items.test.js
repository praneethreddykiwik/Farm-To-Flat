/**
 * Adding items to an already-placed order — the edit-window top-up.
 *
 * The rule the customer cares about: lines they already agreed to are NEVER re-priced. New lines are
 * priced at today's prices and APPENDED, and the order's totals move to the new, larger bill. The
 * delta the projection reports is exactly what the customer pays (online) or owes at the door (COD),
 * and applying it must grow the stored total by that same delta — no more, no less.
 *
 * Tested against the real store + seed so the price breakdown (delivery, charges, tax) is the one the
 * app actually quotes, not a stub that could drift from it.
 */
import { describe, expect, it, beforeAll } from 'vitest';

process.env.NODE_ENV = 'test';
const store = await import('../src/store.js');

/** First two active, in-stock catalogue products — whatever the seed happens to carry. */
function twoProducts() {
  const active = store
    .listProducts()
    .filter((p) => p.isActive !== false && (!p.availability || p.availability === 'AVAILABLE'));
  return [active[0], active[1]];
}

describe('projectOrderAddition', () => {
  let order;
  let a;
  let b;
  beforeAll(() => {
    [a, b] = twoProducts();
    order = store.createOrder({
      communityId: store.listProducts().length ? 'com_cyberzon' : null,
      customerId: 'cus_test_add',
      customerName: 'Add Test',
      mobile: '9999900001',
      deliveryDate: '2099-01-01',
      window: 'MORNING',
      status: 'CONFIRMED',
      lines: [{ productId: a.id, quantity: 2 }],
    });
  });

  it('appends the new line and reports a positive delta equal to the total it grew by', () => {
    const before = Number(order.totalPaise);
    const proj = store.projectOrderAddition(order, [{ productId: b.id, quantity: 1 }]);
    expect(proj.added).toHaveLength(1);
    expect(proj.added[0].productId).toBe(b.id);
    // One more line than the order started with; the original line is untouched.
    expect(proj.items).toHaveLength(order.items.length + 1);
    expect(proj.deltaPaise).toBeGreaterThan(0);
    // The delta is the difference between the new bill and the old total — the customer pays exactly it.
    expect(proj.deltaPaise).toBe(proj.bill.totalPaise - before);
  });

  it('never re-prices the line the customer already agreed to', () => {
    const originalLine = order.items[0];
    const proj = store.projectOrderAddition(order, [{ productId: b.id, quantity: 1 }]);
    const sameLine = proj.items.find((l) => l.id === originalLine.id);
    expect(sameLine.lineTotalPaise).toBe(originalLine.lineTotalPaise);
  });

  it('is a dry run — projecting does not mutate the order', () => {
    const itemsBefore = order.items.length;
    const totalBefore = order.totalPaise;
    store.projectOrderAddition(order, [{ productId: b.id, quantity: 3 }]);
    expect(order.items).toHaveLength(itemsBefore);
    expect(order.totalPaise).toBe(totalBefore);
  });
});

describe('applyOrderAddition', () => {
  it('grows the stored total by the projected delta and records an audit entry', () => {
    const [a, b] = twoProducts();
    const order = store.createOrder({
      communityId: 'com_cyberzon',
      customerId: 'cus_test_apply',
      customerName: 'Apply Test',
      mobile: '9999900001',
      deliveryDate: '2099-01-01',
      window: 'MORNING',
      status: 'CONFIRMED',
      lines: [{ productId: a.id, quantity: 2 }],
    });
    const before = Number(order.totalPaise);
    const proj = store.projectOrderAddition(order, [{ productId: b.id, quantity: 2 }]);

    const updated = store.applyOrderAddition(order.id, [{ productId: b.id, quantity: 2 }], {
      gatewayPaid: proj.deltaPaise,
    });

    expect(Number(updated.totalPaise) - before).toBe(proj.deltaPaise);
    expect(updated.items).toHaveLength(order.items.length + 1);
    expect(updated.additions).toHaveLength(1);
    expect(updated.additions[0].addedPaise).toBe(proj.deltaPaise);
    expect(updated.additions[0].paidOnline).toBe(proj.deltaPaise);
    // A customer-visible breadcrumb on the timeline, not just a hidden audit row.
    expect(updated.timeline.some((t) => t.note === 'items added')).toBe(true);
  });

  it('counts a COD addition as owed at the door (nothing paid online)', () => {
    const [a, b] = twoProducts();
    const order = store.createOrder({
      communityId: 'com_cyberzon',
      customerId: 'cus_test_cod',
      customerName: 'COD Test',
      mobile: '9999900001',
      deliveryDate: '2099-01-01',
      window: 'MORNING',
      status: 'CONFIRMED',
      paymentMethod: 'COD',
      lines: [{ productId: a.id, quantity: 2 }],
    });
    const updated = store.applyOrderAddition(order.id, [{ productId: b.id, quantity: 1 }], {
      gatewayPaid: 0,
    });
    expect(updated.additions[0].paidOnline).toBe(0);
  });

  it('is a no-op when there is nothing resolvable to add', () => {
    const [a] = twoProducts();
    const order = store.createOrder({
      communityId: 'com_cyberzon',
      customerId: 'cus_test_noop',
      customerName: 'Noop Test',
      mobile: '9999900001',
      deliveryDate: '2099-01-01',
      window: 'MORNING',
      status: 'CONFIRMED',
      lines: [{ productId: a.id, quantity: 2 }],
    });
    const before = order.totalPaise;
    const updated = store.applyOrderAddition(
      order.id,
      [{ productId: 'p_does_not_exist', quantity: 1 }],
      {
        gatewayPaid: 0,
      },
    );
    expect(updated.totalPaise).toBe(before);
    expect(updated.additions || []).toHaveLength(0);
  });
});
