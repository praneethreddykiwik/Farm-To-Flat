/**
 * The webhook is the only confirmation that survives the customer's phone dying mid-checkout, so
 * the thing it must never do is trust a caller it cannot verify.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const SECRET = 'whsec_for_tests';
const sign = (body, secret = SECRET) =>
  crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');

const event = (name, entity) => JSON.stringify({ event: name, payload: { payment: { entity } } });

async function app() {
  vi.resetModules();
  return (await import('../src/index.js')).app;
}

describe('razorpay webhook', () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it('refuses a call with no signature', async () => {
    const a = await app();
    const body = event('payment.captured', { id: 'pay_x', order_id: 'order_x' });
    const r = await request(a)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('SIGNATURE_INVALID');
  });

  it('refuses a forged signature', async () => {
    const a = await app();
    const body = event('payment.captured', { id: 'pay_x', order_id: 'order_x' });
    const r = await request(a)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'deadbeef')
      .send(body);
    expect(r.status).toBe(401);
  });

  it('refuses a signature minted with the WRONG secret', async () => {
    const a = await app();
    const body = event('payment.captured', { id: 'pay_x', order_id: 'order_x' });
    const r = await request(a)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(body, 'not_the_secret'))
      .send(body);
    expect(r.status).toBe(401);
  });

  it('accepts a correctly signed event', async () => {
    const a = await app();
    const body = event('payment.captured', { id: 'pay_unknown', order_id: 'order_unknown' });
    const r = await request(a)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(body))
      .send(body);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('still answers 2xx for a payment it knows nothing about, so Razorpay stops retrying', async () => {
    const a = await app();
    const body = event('payment.captured', { id: 'pay_ghost', order_id: 'order_ghost' });
    const r = await request(a)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(body))
      .send(body);
    expect(r.status).toBe(200);
  });

  it('answers 2xx on payment.failed rather than making Razorpay retry for hours', async () => {
    const a = await app();
    const body = event('payment.failed', {
      id: 'pay_f',
      order_id: 'order_f',
      error_description: 'card declined',
    });
    const r = await request(a)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(body))
      .send(body);
    expect(r.status).toBe(200);
  });

  it('refuses everything when no webhook secret is configured', async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const a = await app();
    const body = event('payment.captured', { id: 'pay_x', order_id: 'order_x' });
    const r = await request(a)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(body))
      .send(body);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
  });

  it('needs no bearer token — Razorpay has none to give', async () => {
    const a = await app();
    const body = event('payment.captured', { id: 'pay_n', order_id: 'order_n' });
    const r = await request(a)
      .post('/api/v1/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(body))
      .send(body);
    expect(r.status).not.toBe(401);
    expect(r.status).toBe(200);
  });
});
