/** Review #25 (21 Nov 2026): the owner can require Google sign-in for admin power. Off by default. */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function staffToken(mobile, role) {
  await request(app).post('/api/v1/admin/access').send({ mobile, role });
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body.accessToken;
}

let superT;
let driverT;
let customerId;
beforeAll(async () => {
  superT = await staffToken('9777000001', 'SUPER_ADMIN');
  driverT = await staffToken('9777000002', 'FULFILMENT');
  await request(app).post('/api/v1/auth/otp/request').send({ mobile: '9777000003' });
  const v = await request(app)
    .post('/api/v1/auth/otp/verify')
    .send({ mobile: '9777000003', otp: '123456' });
  customerId = v.body.customer?.id;
});
afterEach(() => delete process.env.ADMIN_REQUIRE_GOOGLE);

const credit = (t) =>
  request(app)
    .post(`/api/v1/admin/customers/${customerId}/wallet`)
    .set(auth(t))
    .send({ direction: 'CREDIT', amountPaise: 100, reason: 'test' });

describe('ADMIN_REQUIRE_GOOGLE', () => {
  it('off by default: a phone-signed-in super admin works as before', async () => {
    const r = await credit(superT);
    expect(r.body.error?.code).not.toBe('GOOGLE_SIGNIN_REQUIRED');
  });

  it("'money': the console still opens, moving wallet money needs Google", async () => {
    process.env.ADMIN_REQUIRE_GOOGLE = 'money';
    expect((await request(app).get('/api/v1/admin/orders').set(auth(superT))).status).toBe(200);
    const r = await credit(superT);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('GOOGLE_SIGNIN_REQUIRED');
  });

  it("'all': phone-signed-in admins are refused everywhere; delivery staff are not affected", async () => {
    process.env.ADMIN_REQUIRE_GOOGLE = 'all';
    const r = await request(app).get('/api/v1/admin/orders').set(auth(superT));
    expect(r.body.error.code).toBe('GOOGLE_SIGNIN_REQUIRED');
    expect((await request(app).get('/api/v1/admin/orders').set(auth(driverT))).status).toBe(200);
  });
});
