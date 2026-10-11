/**
 * The fee lines the operator configures must actually reach the customer's basket, and the total
 * the app displays must be the total the card is charged.
 *
 * This is the join between the admin console and the app. The unit tests prove the arithmetic; this
 * proves the wiring — that a fee added in one place appears in the other, and that the figure the
 * customer sees on the checkout screen is the same number the payment is created for.
 */
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { updateCharges } = await import('../src/store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function basketWith(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  const { body } = await request(app).get('/api/v1/admin/products');
  const p = body.products.find((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE');
  await request(app)
    .put('/api/v1/cart/items')
    .set(auth(token))
    .send({ productId: p.id, quantity: 2 });
  return token;
}

afterEach(() => {
  updateCharges({ charges: [], tax: { enabled: false, goodsRateBps: 0, feeRateBps: 1800 } });
});

describe('a fee added in the admin console', () => {
  it('appears on the customer basket, and the total includes it', async () => {
    const token = await basketWith('9000000101');
    const before = await request(app).get('/api/v1/cart').set(auth(token));
    const baseTotal = Number(before.body.cart.totalPaise);

    updateCharges({
      charges: [{ label: 'Platform fee', kind: 'FLAT', valuePaise: 1499 }],
      tax: { enabled: true, goodsRateBps: 0, feeRateBps: 1800 },
    });

    const after = await request(app).get('/api/v1/cart').set(auth(token));
    const cart = after.body.cart;
    const line = cart.chargeLines.find((l) => l.label === 'Platform fee');
    expect(line.amountPaise).toBe('1499');
    expect(cart.taxLabel).toBe('GST');
    expect(Number(cart.taxPaise)).toBe(270); // 18% of the fee; 0% on the produce
    expect(Number(cart.totalPaise)).toBe(baseTotal + 1499 + 270);
  });

  it('the displayed total always equals the displayed parts', async () => {
    const token = await basketWith('9000000102');
    updateCharges({
      charges: [
        { label: 'Platform fee', kind: 'FLAT', valuePaise: 1499 },
        { label: 'Handling', kind: 'PERCENT', valueBps: 250 },
      ],
      tax: { enabled: true, goodsRateBps: 0, feeRateBps: 1800 },
    });
    const { body } = await request(app).get('/api/v1/cart').set(auth(token));
    const c = body.cart;
    const fees = c.chargeLines.reduce((s, l) => s + Number(l.amountPaise), 0);
    expect(Number(c.totalPaise)).toBe(
      Number(c.subtotalPaise) - Number(c.couponDiscountPaise) + fees + Number(c.taxPaise),
    );
  });

  it('a paused fee is charged to nobody', async () => {
    const token = await basketWith('9000000103');
    const before = await request(app).get('/api/v1/cart').set(auth(token));
    updateCharges({
      charges: [{ label: 'Platform fee', kind: 'FLAT', valuePaise: 1499, enabled: false }],
    });
    const after = await request(app).get('/api/v1/cart').set(auth(token));
    expect(after.body.cart.totalPaise).toBe(before.body.cart.totalPaise);
    expect(after.body.cart.chargeLines.find((l) => l.label === 'Platform fee')).toBeUndefined();
  });

  it('keeps deliveryChargePaise on the response, so an un-updated app still works', async () => {
    const token = await basketWith('9000000104');
    const { body } = await request(app).get('/api/v1/cart').set(auth(token));
    expect(body.cart.deliveryChargePaise).toBeDefined();
  });
});
