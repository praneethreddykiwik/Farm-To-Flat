/**
 * A coupon used once cannot be used again by typing it in different capitals (security pentest,
 * 21 Nov 2026). Redemptions saved before the fix kept the code exactly as typed, so the basket
 * preview and the coupon list must compare without case too, not only checkout.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { redeemCoupon, validateCoupon, hasRedeemed } = await import('../src/customer-store.js');

describe('coupon redemptions ignore letter case', () => {
  it('a code saved as typed in lower case still counts as used in upper case', async () => {
    const mobile = '9777000777';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const cid = v.body.customer?.id || v.body.customerId;
    expect(cid).toBeTruthy();

    // An old row, saved the way checkout stored it before the fix.
    redeemCoupon(cid, 'farm-fresh100');
    expect(hasRedeemed(cid, 'FARM-FRESH100')).toBe(true);
    expect(hasRedeemed(cid, ' Farm-Fresh100 ')).toBe(true);
    expect(hasRedeemed(cid, 'FARM-WELCOME')).toBe(false);

    const r = validateCoupon(cid, 'FARM-FRESH100', 10_000_00);
    expect(r.error?.code).toBe('COUPON_ALREADY_USED');

    const list = await request(app)
      .get('/api/v1/coupons')
      .set({ Authorization: `Bearer ${v.body.accessToken}` });
    const row = (list.body.coupons || []).find((c) => c.code === 'FARM-FRESH100');
    expect(row).toBeTruthy();
    expect(row.alreadyUsed).toBe(true);
  });
});
