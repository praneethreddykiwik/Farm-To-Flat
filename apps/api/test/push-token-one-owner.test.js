/**
 * Review #9 (21 Nov 2026): the door code must reach the order's owner only.
 *
 * Notifications are addressed by customer id (lib/notify.js emitNotification) and WhatsApp goes to
 * the owner's own mobile — there is no household or flat fan-out. The leak was the push token: when
 * a second account signed in on the same phone, the first account kept the token in memory, so its
 * "out for delivery, your code is 1234" push rang on a phone someone else was now using.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const cs = await import('../src/customer-store.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
async function signIn(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return { token: v.body.accessToken, id: v.body.customer?.id };
}

describe('a push token belongs to one account', () => {
  it('moves to the account that registers it last', async () => {
    const a = await signIn('9666090001');
    const b = await signIn('9666090002');
    const phone = 'ExponentPushToken[shared-phone-0001]';
    await request(app).post('/api/v1/devices').set(auth(a.token)).send({ expoPushToken: phone });
    expect(cs.getDevices(a.id)).toContain(phone);

    // Same phone, now signed in as B.
    await request(app).post('/api/v1/devices').set(auth(b.token)).send({ expoPushToken: phone });
    expect(cs.getDevices(b.id)).toContain(phone);
    expect(cs.getDevices(a.id)).not.toContain(phone);
  });

  it('leaves the other account’s own phones alone', async () => {
    const a = await signIn('9666090003');
    const b = await signIn('9666090004');
    await request(app)
      .post('/api/v1/devices')
      .set(auth(a.token))
      .send({ expoPushToken: 'ExponentPushToken[a-own-phone]' });
    await request(app)
      .post('/api/v1/devices')
      .set(auth(b.token))
      .send({ expoPushToken: 'ExponentPushToken[b-own-phone]' });
    expect(cs.getDevices(a.id)).toEqual(['ExponentPushToken[a-own-phone]']);
    expect(cs.getDevices(b.id)).toEqual(['ExponentPushToken[b-own-phone]']);
  });
});
