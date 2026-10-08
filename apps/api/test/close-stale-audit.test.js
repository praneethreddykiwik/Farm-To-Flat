import { beforeEach, describe, expect, it } from 'vitest';
import { roleMayAccess } from '../src/routes/admin/auth.js';
import { orderIsStale } from '../src/serialize.js';
import { _memoryTrail, listActions, recordAction } from '../src/lib/audit.js';

describe('who may close orders in bulk', () => {
  // The general /orders rule grants the fulfilment and procurement sections. Closing stale orders
  // REFUNDS every paid one, so it must not inherit that.
  it('is super admin only — a driver cannot refund 31 orders', () => {
    expect(roleMayAccess('SUPER_ADMIN', '/orders/close-stale', 'POST')).toBe(true);
    for (const role of ['ADMIN', 'FULFILMENT', 'PROCUREMENT'])
      expect(roleMayAccess(role, '/orders/close-stale', 'POST')).toBe(false);
  });

  it('still lets those roles use the ordinary orders screen', () => {
    expect(roleMayAccess('FULFILMENT', '/orders', 'GET')).toBe(true);
  });

  it('keeps the audit trail to super admin', () => {
    expect(roleMayAccess('SUPER_ADMIN', '/audit', 'GET')).toBe(true);
    for (const role of ['ADMIN', 'FULFILMENT', 'PROCUREMENT'])
      expect(roleMayAccess(role, '/audit', 'GET')).toBe(false);
  });
});

describe('which orders count as stale', () => {
  const today = '2026-10-08';
  const at = (status, deliveryDate) => ({ status, deliveryDate });

  it('is an open order whose delivery day has passed', () => {
    expect(orderIsStale(at('CONFIRMED', '2026-10-07'), today)).toBe(true);
    expect(orderIsStale(at('PACKING', '2026-09-22'), today)).toBe(true);
    expect(orderIsStale(at('OUT_FOR_DELIVERY', '2026-09-30'), today)).toBe(true);
  });

  it("is not today's run — there is still a day to deliver it", () => {
    expect(orderIsStale(at('CONFIRMED', today), today)).toBe(false);
    expect(orderIsStale(at('PACKING', '2026-10-11'), today)).toBe(false);
  });

  it('never touches an order that is already settled', () => {
    for (const s of ['DELIVERED', 'CANCELLED', 'PAYMENT_FAILED', 'PENDING_PAYMENT'])
      expect(orderIsStale(at(s, '2026-09-01'), today)).toBe(false);
  });
});

describe('the audit trail', () => {
  beforeEach(() => {
    _memoryTrail.length = 0;
  });

  it('names the operator who acted', async () => {
    await recordAction({
      staff: { email: 'ops@fooducia.in', role: 'SUPER_ADMIN', viaGoogle: true },
      action: 'ORDERS_CLOSE_STALE',
      details: { count: 3 },
    });
    const [row] = await listActions();
    expect(row.actor).toBe('ops@fooducia.in');
    expect(row.via).toBe('google');
    expect(row.details.count).toBe(3);
  });

  it('records the shared token as nameless rather than looking complete', async () => {
    // This is the case where "who did this" has no answer. The log should say so.
    await recordAction({ staff: undefined, action: 'ORDERS_CLOSE_STALE' });
    const [row] = await listActions();
    expect(row.actor).toBe('shared-token');
    expect(row.via).toBe('shared-token');
  });

  it('is append-only — a second action never replaces the first', async () => {
    await recordAction({ staff: { email: 'a@x.in' }, action: 'ONE' });
    await recordAction({ staff: { email: 'b@x.in' }, action: 'TWO' });
    const rows = await listActions();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.action)).toContain('ONE');
    expect(rows.map((r) => r.action)).toContain('TWO');
  });

  it('can be read back for one order', async () => {
    await recordAction({ staff: { email: 'a@x.in' }, action: 'X', target: 'F2F-4261' });
    await recordAction({ staff: { email: 'a@x.in' }, action: 'X', target: 'F2F-9999' });
    const rows = await listActions({ target: 'F2F-4261' });
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe('F2F-4261');
  });
});
