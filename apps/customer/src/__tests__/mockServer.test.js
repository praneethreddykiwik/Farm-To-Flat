import { beforeAll, describe, expect, it } from 'vitest';
import { handle, mockState } from '../api/mock/server';
import { todayISO } from '../lib/dates';

const H = { Authorization: 'Bearer test' };
const ok = async (m, p, b) => {
  const r = await handle(m, p, b, H);
  if (r.status >= 400) throw new Error(`${m} ${p} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

describe('mock /api/v1 contract', () => {
  beforeAll(async () => {
    await handle('POST', '/auth/otp/request', { mobile: '9848000000' });
    const v = await handle('POST', '/auth/otp/verify', { mobile: '9848000000', otp: '123456' });
    expect(v.status).toBe(200);
    expect(v.body.customer.hasAddress).toBe(false);
    await ok('POST', '/addresses', {
      communityId: 'com_cyberzon',
      block: 'Tower B',
      flat: '1204',
      recipientName: 'Vivek',
    });
  });

  it('rejects a wrong OTP with a stable code', async () => {
    await handle('POST', '/auth/otp/request', { mobile: '9848000001' });
    const r = await handle('POST', '/auth/otp/verify', { mobile: '9848000001', otp: '000000' });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('OTP_INVALID');
  });

  it('alias search finds the same product by three names', async () => {
    const ids = await Promise.all(
      ['karela', 'kakarakaya', 'bitter gourd'].map(
        async (q) => (await ok('GET', `/catalog/search?q=${q}`)).products[0]?.id,
      ),
    );
    expect(ids).toEqual(['p_karela', 'p_karela', 'p_karela']);
  });

  it('enforces increments and the ₹500 minimum, then places an order through the wallet leg', async () => {
    const bad = await handle('PUT', '/cart/items', { productId: 'p_tomato', quantity: '0.3' }, H);
    expect(bad.status).toBe(422);
    await ok('PUT', '/cart/items', { productId: 'p_tomato', quantity: '1.5' }); // 5400
    let cart = (await ok('GET', '/cart')).cart;
    expect(cart.meetsMinimum).toBe(false);
    const short = await handle(
      'POST',
      '/orders',
      { addressId: mockState.addresses[0].id, deliveryDate: todayISO(), window: 'MORNING' },
      H,
    );
    expect(short.body.error.code).toBe('MIN_ORDER_NOT_MET');
    await ok('PUT', '/cart/items', { productId: 'p_mutton', quantity: '1' }); // 84000
    cart = (await ok('POST', '/cart/coupon', { code: 'farm-welcome' })).cart; // case-insensitive
    expect(cart.coupon.code).toBe('FARM-WELCOME');
    expect(Number(cart.couponDiscountPaise)).toBe(Math.round((5400 + 84000) * 0.1));

    // top up ₹500 and verify -> wallet credited only after "webhook"
    const pi = (await ok('POST', '/wallet/topup', { amountPaise: '50000' })).paymentIntent;
    expect(Number((await ok('GET', '/wallet')).balancePaise)).toBe(0);
    await ok('POST', '/payments/verify', { paymentId: pi.paymentId, success: true });
    expect(Number((await ok('GET', '/wallet')).balancePaise)).toBe(50000);

    const win = (await ok('GET', '/delivery-windows')).windows.find((w) => w.isOpen);
    const res = await ok('POST', '/orders', {
      addressId: mockState.addresses[0].id,
      deliveryDate: win.date,
      window: win.window,
      useWallet: true,
    });
    expect(res.order.status).toBe('PENDING_PAYMENT');
    expect(Number(res.order.walletAppliedPaise)).toBe(50000);
    expect(Number(res.order.gatewayAmountPaise)).toBe(Number(cart.totalPaise) - 50000);
    expect(res.paymentIntent.amountPaise).toBe(res.order.gatewayAmountPaise);
    expect(Number((await ok('GET', '/wallet')).balancePaise)).toBe(0);

    // same coupon twice on this account fails
    await ok('PUT', '/cart/items', { productId: 'p_mutton', quantity: '1' });
    const again = await handle('POST', '/cart/coupon', { code: 'FARM-WELCOME' }, H);
    expect(again.body.error.code).toBe('COUPON_ALREADY_USED');

    // abandoning the payment releases wallet and coupon
    await ok('POST', '/payments/verify', {
      paymentId: res.paymentIntent.paymentId,
      success: false,
    });
    expect(Number((await ok('GET', '/wallet')).balancePaise)).toBe(50000);
    const o = (await ok('GET', `/orders/${res.order.id}`)).order;
    expect(o.status).toBe('PAYMENT_FAILED');
  }, 20000); // every mock call sleeps to mimic the network; this walk-through makes ~15 of them

  it('never returns cost or margin fields to the customer', async () => {
    const body =
      JSON.stringify(await ok('GET', '/catalog')) + JSON.stringify(await ok('GET', '/orders'));
    expect(body).not.toMatch(/margin|procurementCost|consumablesCost|costPaise/);
  });
});
