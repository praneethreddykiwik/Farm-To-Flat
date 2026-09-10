/**
 * Field-validation guards. The app sanitises input, but the server is the real gate — a crafted
 * request must never store an impossible mobile, name, or address.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

const { app } = await import('../src/index.js');

const otpReq = (mobile) => request(app).post('/api/v1/auth/otp/request').send({ mobile });

describe('Indian mobile validation (login)', () => {
  it('accepts a real 10-digit number starting 6-9', async () => {
    const r = await otpReq('9848012345');
    expect(r.status).toBe(200);
  });

  it('strips a +91 / leading-0 prefix and still accepts', async () => {
    expect((await otpReq('+919848012345')).status).toBe(200);
    expect((await otpReq('09848012345')).status).toBe(200);
  });

  it('rejects fewer than 10 digits', async () => {
    expect((await otpReq('98480')).status).toBe(422);
  });

  it('rejects numbers not starting 6-9 (landline/invalid series)', async () => {
    expect((await otpReq('1234567890')).status).toBe(422);
    expect((await otpReq('5000000000')).status).toBe(422);
  });

  it('rejects a single repeated digit (never-issued)', async () => {
    expect((await otpReq('9999999999')).status).toBe(422);
    expect((await otpReq('6666666666')).status).toBe(422);
  });

  it('rejects letters / symbols in the number', async () => {
    expect((await otpReq('98480abcde')).status).toBe(422);
  });
});

describe('OTP shape', () => {
  it('rejects a non-numeric code', async () => {
    await otpReq('9848012345');
    const r = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ mobile: '9848012345', otp: 'abcd' });
    expect(r.status).toBe(422);
  });
});

describe('profile + address field rules', () => {
  const auth = async () => {
    await otpReq('9848011111');
    const r = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ mobile: '9848011111', otp: '123456' });
    return `Bearer ${r.body.accessToken}`;
  };

  it('rejects a name with digits/symbols', async () => {
    const token = await auth();
    const r = await request(app).patch('/api/v1/me').set('Authorization', token).send({
      name: 'Vivek123',
    });
    expect(r.status).toBe(422);
  });

  it('accepts a clean name', async () => {
    const token = await auth();
    const r = await request(app).patch('/api/v1/me').set('Authorization', token).send({
      name: 'Vivek Goud',
    });
    expect(r.status).toBe(200);
  });

  it('rejects a bad email', async () => {
    const token = await auth();
    const r = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', token)
      .send({ email: 'not-an-email' });
    expect(r.status).toBe(422);
  });

  it('rejects an address with an empty flat', async () => {
    const token = await auth();
    const r = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', token)
      .send({ block: 'A', flat: '' });
    expect(r.status).toBe(422);
  });
});
