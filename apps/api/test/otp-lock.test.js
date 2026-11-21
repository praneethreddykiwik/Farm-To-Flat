/**
 * Review #22 / #23 (21 Nov 2026): the "3 wrong guesses" lock must actually lock, and the change-number
 * step must not be a way to guess codes freely or to take over a staff number.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';

const { app } = await import('../src/index.js');
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const RIGHT = '123456'; // the fixed test-mode code

async function signIn(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: RIGHT });
  return v.body.accessToken;
}
const verify = (mobile, otp) => request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp });

describe('sign-in code lock', () => {
  it('after three wrong codes the RIGHT code is refused too', async () => {
    const mobile = '9444000001';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    expect((await verify(mobile, '000001')).status).toBe(401);
    expect((await verify(mobile, '000002')).status).toBe(401);
    const third = await verify(mobile, '000003');
    expect(third.status).toBe(423);
    expect(third.body.error.code).toBe('OTP_LOCKED');
    // the old bug: this signed in
    const right = await verify(mobile, RIGHT);
    expect(right.status).not.toBe(200);
    expect(right.body.accessToken).toBeUndefined();
  });

  it('a fresh code works again after a lock (the honest user is not stuck)', async () => {
    const mobile = '9444000002';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    for (const c of ['000001', '000002', '000003']) await verify(mobile, c);
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const ok = await verify(mobile, RIGHT);
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
  });

  it('requesting new codes does not reset the guessing budget: 10 wrong in an hour locks the number', async () => {
    const mobile = '9444000003';
    for (let round = 0; round < 4; round += 1) {
      await request(app).post('/api/v1/auth/otp/request').send({ mobile });
      for (let i = 0; i < 3; i += 1) await verify(mobile, `00000${i}`);
    }
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const r = await verify(mobile, RIGHT);
    expect(r.status).toBe(423);
  });
});

describe('change-number step', () => {
  it('cannot move an account onto a staff number', async () => {
    const staffMobile = '9444000010';
    await request(app).post('/api/v1/admin/access').send({ mobile: staffMobile, role: 'ADMIN' });
    const token = await signIn('9444000011');
    const req = await request(app)
      .post('/api/v1/me/mobile/request')
      .set(auth(token))
      .send({ mobile: staffMobile });
    expect(req.status).toBe(200); // same reply as any number...
    const v = await request(app)
      .post('/api/v1/me/mobile/verify')
      .set(auth(token))
      .send({ mobile: staffMobile, otp: RIGHT });
    expect(v.status).toBe(401); // ...but the move is refused
    const me = await request(app).get('/api/v1/me').set(auth(token));
    expect(me.body.customer.mobile).toBe('9444000011');
  });

  it('the change-number code locks after three wrong guesses as well', async () => {
    const token = await signIn('9444000012');
    const next = '9444000013';
    await request(app).post('/api/v1/me/mobile/request').set(auth(token)).send({ mobile: next });
    const send = (otp) =>
      request(app).post('/api/v1/me/mobile/verify').set(auth(token)).send({ mobile: next, otp });
    await send('000001');
    await send('000002');
    await send('000003');
    const right = await send(RIGHT);
    expect(right.status).not.toBe(200);
  });
});
