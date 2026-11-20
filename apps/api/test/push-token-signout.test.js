/**
 * Review #42 (21 Nov 2026): signing out on a phone must stop that account's notifications reaching
 * it, and a second account signing in on the same phone takes the phone over.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { getDevices, getCustomerIdByMobile } = await import('../src/customer-store.js');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function signIn(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body.accessToken;
}

describe('push tokens follow the person signed in on the phone', () => {
  it('sign-out with the phone token unregisters it', async () => {
    const t = await signIn('9555000001');
    const cid = getCustomerIdByMobile('9555000001');
    await request(app)
      .post('/api/v1/devices')
      .set(auth(t))
      .send({ expoPushToken: 'ExponentPushToken[a1]' });
    expect(getDevices(cid)).toContain('ExponentPushToken[a1]');
    const r = await request(app)
      .post('/api/v1/auth/logout')
      .set(auth(t))
      .send({ expoPushToken: 'ExponentPushToken[a1]' });
    expect(r.status).toBe(200);
    expect(getDevices(cid)).not.toContain('ExponentPushToken[a1]');
  });

  it('a second account on the same phone takes the token over', async () => {
    const a = await signIn('9555000002');
    const b = await signIn('9555000003');
    const ca = getCustomerIdByMobile('9555000002');
    const cb = getCustomerIdByMobile('9555000003');
    await request(app)
      .post('/api/v1/devices')
      .set(auth(a))
      .send({ expoPushToken: 'ExponentPushToken[shared]' });
    await request(app)
      .post('/api/v1/devices')
      .set(auth(b))
      .send({ expoPushToken: 'ExponentPushToken[shared]' });
    expect(getDevices(ca)).not.toContain('ExponentPushToken[shared]');
    expect(getDevices(cb)).toContain('ExponentPushToken[shared]');
  });

  it("sign-out cannot unregister another account's phone", async () => {
    const a = await signIn('9555000004');
    const b = await signIn('9555000005');
    const ca = getCustomerIdByMobile('9555000004');
    await request(app)
      .post('/api/v1/devices')
      .set(auth(a))
      .send({ expoPushToken: 'ExponentPushToken[mine]' });
    await request(app)
      .post('/api/v1/auth/logout')
      .set(auth(b))
      .send({ expoPushToken: 'ExponentPushToken[mine]' });
    expect(getDevices(ca)).toContain('ExponentPushToken[mine]');
  });
});
