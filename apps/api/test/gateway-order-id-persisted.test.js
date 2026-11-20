/**
 * Review #1 (21 Nov 2026): the order id Razorpay issues must reach the database, not just memory.
 *
 * createPayment writes a placeholder id first; the routes then set the real id on the in-memory
 * object only, so after a restart the webhook / reconcile could not find the payment.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';

vi.mock('../src/lib/razorpay.js', async (importOriginal) => ({
  ...(await importOriginal()),
  razorpayEnabled: true,
  razorpayKeyId: 'rzp_test_fake',
  createRazorpayOrder: async () => ({ id: 'order_REALFROMGATEWAY' }),
}));

const { app } = await import('../src/index.js');
const { persist } = await import('../src/persistence.js');
const { constants } = await import('../src/store.js');

let token;
beforeAll(async () => {
  const mobile = '9700000081';
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  token = v.body.accessToken;
});

describe('the gateway order id is written to the database', () => {
  it('a wallet top-up persists the real Razorpay order id, not the placeholder', async () => {
    const spy = vi.spyOn(persist, 'paymentUpsert');
    const amount = constants().topupDenominationsPaise[0];
    const r = await request(app)
      .post('/api/v1/wallet/topup')
      .set({ Authorization: `Bearer ${token}` })
      .send({ amountPaise: amount });
    expect(r.status).toBe(201);
    expect(r.body.paymentIntent.razorpayOrderId).toBe('order_REALFROMGATEWAY');
    const last = spy.mock.calls.at(-1)?.[0];
    expect(last?.id).toBe(r.body.paymentIntent.paymentId);
    expect(last?.razorpayOrderId).toBe('order_REALFROMGATEWAY');
    spy.mockRestore();
  });
});
