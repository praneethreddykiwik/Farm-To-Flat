/**
 * Review #30 (21 Nov 2026): the 4-digit door code could be guessed without limit by anyone with a
 * delivery login. Five wrong codes now lock the order — every further code is refused, the right one
 * included — until an admin unlocks it or the order is sent out again with a fresh code. The lock is
 * written to the audit trail.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { getOrder, listOrders, patchOrder, updateOrderStatus, DELIVERY_CODE_MAX_ATTEMPTS } =
  await import('../src/store.js');
const { _memoryTrail } = await import('../src/lib/audit.js');
const { roleMayAccess } = await import('../src/routes/admin/auth.js');

/** A prepaid order out for delivery with a code on it. */
function outForDelivery() {
  const o = listOrders().find((x) => !['DELIVERED', 'CANCELLED'].includes(x.status));
  expect(o).toBeTruthy();
  patchOrder(o.id, (x) => {
    x.paymentMethod = 'PREPAID';
    x.status = 'PACKING';
  });
  updateOrderStatus(o.id, 'OUT_FOR_DELIVERY');
  const otp = getOrder(o.id).deliveryOtp;
  expect(otp).toMatch(/^\d{4}$/);
  return { id: o.id, otp, wrong: otp === '1000' ? '1001' : '1000' };
}

const deliver = (id, otp) => request(app).post(`/api/v1/admin/orders/${id}/deliver`).send({ otp });

describe('delivery code lock', () => {
  beforeEach(() => {
    _memoryTrail.length = 0;
  });

  it('locks after five wrong codes, refuses even the right one, and audits the lock', async () => {
    const { id, otp, wrong } = outForDelivery();
    for (let i = 1; i < DELIVERY_CODE_MAX_ATTEMPTS; i += 1) {
      const r = await deliver(id, wrong);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('DELIVERY_OTP_INVALID');
      expect(r.body.error.details.attemptsLeft).toBe(DELIVERY_CODE_MAX_ATTEMPTS - i);
    }
    const fifth = await deliver(id, wrong);
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('DELIVERY_CODE_LOCKED');

    const right = await deliver(id, otp);
    expect(right.status).toBe(423);
    expect(right.body.error.code).toBe('DELIVERY_CODE_LOCKED');
    expect(getOrder(id).status).toBe('OUT_FOR_DELIVERY');

    const locks = _memoryTrail.filter((r) => r.action === 'DELIVERY_CODE_LOCKED');
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({ target: id, details: { attempts: 5 } });

    const view = await request(app).get(`/api/v1/admin/orders/${id}`);
    expect(view.body.order.deliveryCodeLocked).toBe(true);
    expect(view.body.order.deliveryCodeAttempts).toBe(5);
  });

  it('an admin unlock (audited) lets the right code through', async () => {
    const { id, otp, wrong } = outForDelivery();
    for (let i = 0; i < DELIVERY_CODE_MAX_ATTEMPTS; i += 1) await deliver(id, wrong);
    expect((await deliver(id, otp)).status).toBe(423);

    const un = await request(app).post(`/api/v1/admin/orders/${id}/deliver-unlock`).send({});
    expect(un.status).toBe(200);
    expect(un.body.order.deliveryCodeLocked).toBe(false);
    expect(_memoryTrail.some((r) => r.action === 'DELIVERY_CODE_UNLOCKED' && r.target === id)).toBe(
      true,
    );

    const ok = await deliver(id, otp);
    expect(ok.status).toBe(200);
    expect(getOrder(id).status).toBe('DELIVERED');
  });

  it('sending the order out again issues a new code and clears the count', async () => {
    const { id, wrong } = outForDelivery();
    for (let i = 0; i < DELIVERY_CODE_MAX_ATTEMPTS; i += 1) await deliver(id, wrong);
    patchOrder(id, (x) => {
      x.status = 'PACKING';
    });
    updateOrderStatus(id, 'OUT_FOR_DELIVERY');
    const fresh = getOrder(id);
    expect(fresh.deliveryOtpLockedAt).toBeNull();
    expect(fresh.deliveryOtpAttempts).toBe(0);
    expect((await deliver(id, fresh.deliveryOtp)).status).toBe(200);
  });

  it('only ADMIN and above may unlock — not the delivery role', () => {
    const p = '/orders/ord_x/deliver-unlock';
    expect(roleMayAccess('FULFILMENT', p, 'POST')).toBe(false);
    expect(roleMayAccess('PROCUREMENT', p, 'POST')).toBe(false);
    expect(roleMayAccess('ADMIN', p, 'POST')).toBe(true);
    // The delivery role can still hand over at the door.
    expect(roleMayAccess('FULFILMENT', '/orders/ord_x/deliver', 'POST')).toBe(true);
  });
});
