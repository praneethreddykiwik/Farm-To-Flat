/**
 * Changing your mobile number must move the ACCOUNT, not start a new one. The reported bug was that
 * the app signed you out, so you returned through normal sign-in as a fresh customer and were asked
 * for your community and address again while your orders stayed on the old number.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function signIn(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return { token: v.body.accessToken, customerId: v.body.customer.id };
}

async function withAddress(mobile, flat) {
  const { token, customerId } = await signIn(mobile);
  const { body: c } = await request(app).get('/api/v1/communities');
  const community = c.communities[0];
  await request(app)
    .post('/api/v1/addresses')
    .set(auth(token))
    .send({ communityId: community.id, block: community.blocks[0], flat, floor: '4' });
  return { token, customerId };
}

async function changeTo(token, next) {
  const r1 = await request(app)
    .post('/api/v1/me/mobile/request')
    .set(auth(token))
    .send({ mobile: next });
  const r2 = await request(app)
    .post('/api/v1/me/mobile/verify')
    .set(auth(token))
    .send({ mobile: next, otp: '123456' });
  return { r1, r2 };
}

describe('changing your mobile number keeps your account', () => {
  it('keeps the same customer, the same addresses, and the existing session', async () => {
    const { token, customerId } = await withAddress('9333000001', '401');
    const before = await request(app).get('/api/v1/me').set(auth(token));
    expect(before.body.customer.hasAddress).toBe(true);

    const { r1, r2 } = await changeTo(token, '9333000099');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.customer.mobile).toBe('9333000099');
    // Same account — not a new one.
    expect(r2.body.customer.id).toBe(customerId);
    expect(r2.body.customer.hasAddress).toBe(true);

    // The token issued against the old number still works, and the addresses are still there.
    const after = await request(app).get('/api/v1/addresses').set(auth(token));
    expect(after.status).toBe(200);
    expect(after.body.addresses.length).toBeGreaterThan(0);
  });

  it('signing in with the NEW number lands on the same account, not a fresh one', async () => {
    const { token, customerId } = await withAddress('9333000002', '402');
    await changeTo(token, '9333000098');
    const again = await signIn('9333000098');
    expect(again.customerId).toBe(customerId);
    const me = await request(app).get('/api/v1/me').set(auth(again.token));
    expect(me.body.customer.hasAddress).toBe(true);
  });

  it('the old number is released — signing in with it starts a genuinely new account', async () => {
    const { token, customerId } = await withAddress('9333000003', '403');
    await changeTo(token, '9333000097');
    const old = await signIn('9333000003');
    expect(old.customerId).not.toBe(customerId);
  });

  it('refuses a number another account already holds, and sends no code for it', async () => {
    await signIn('9333000004');
    const { token } = await withAddress('9333000005', '405');
    const r = await request(app)
      .post('/api/v1/me/mobile/request')
      .set(auth(token))
      .send({ mobile: '9333000004' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('MOBILE_TAKEN');
  });

  it('refuses a wrong code, and leaves the number untouched', async () => {
    const { token, customerId } = await withAddress('9333000006', '406');
    await request(app)
      .post('/api/v1/me/mobile/request')
      .set(auth(token))
      .send({ mobile: '9333000096' });
    const bad = await request(app)
      .post('/api/v1/me/mobile/verify')
      .set(auth(token))
      .send({ mobile: '9333000096', otp: '000000' });
    expect(bad.status).toBe(401);
    const me = await request(app).get('/api/v1/me').set(auth(token));
    expect(me.body.customer.mobile).toBe('9333000006');
    expect(me.body.customer.id).toBe(customerId);
  });

  it("the address's contact number follows, so the driver does not ring a dead number", async () => {
    const { token } = await withAddress('9333000007', '407');
    const before = await request(app).get('/api/v1/addresses').set(auth(token));
    expect(before.body.addresses[0].contactNumber).toBe('9333000007');
    await changeTo(token, '9333000094');
    const after = await request(app).get('/api/v1/addresses').set(auth(token));
    expect(after.body.addresses[0].contactNumber).toBe('9333000094');
  });

  it('an address given a different contact on purpose is left alone', async () => {
    const { token } = await withAddress('9333000008', '408');
    const { body: c } = await request(app).get('/api/v1/communities');
    const community = c.communities[0];
    await request(app).post('/api/v1/addresses').set(auth(token)).send({
      communityId: community.id,
      block: community.blocks[0],
      flat: '409',
      floor: '4',
      contactNumber: '9333000500', // someone else entirely
    });
    await changeTo(token, '9333000093');
    const after = await request(app).get('/api/v1/addresses').set(auth(token));
    const other = after.body.addresses.find((a) => a.flat === '409');
    expect(other.contactNumber).toBe('9333000500');
  });

  it('cannot be called without being signed in', async () => {
    const r = await request(app).post('/api/v1/me/mobile/request').send({ mobile: '9333000095' });
    expect(r.status).toBe(401);
  });
});
