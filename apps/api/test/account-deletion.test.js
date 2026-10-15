/**
 * Account deletion (app-store / DPDP right-to-erasure). Deleting an account must: revoke the live
 * session, remove the customer's PII (addresses), free the mobile for a fresh signup, and keep the
 * caller from acting as that account afterwards. Orders/payments are retained de-identified (not
 * exercised here).
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const me = (t) => request(app).get('/api/v1/me').set('Authorization', `Bearer ${t}`);
async function login(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body;
}

describe('account deletion', () => {
  it('erases PII, revokes the session, and frees the mobile', async () => {
    const mobile = '9557000010';
    const { accessToken } = await login(mobile);
    expect((await me(accessToken)).status).toBe(200);

    // delete the account
    const del = await request(app)
      .delete('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    // the old session is dead
    expect((await me(accessToken)).status).toBe(401);

    // the mobile is free again: a fresh signup works and starts with NO addresses
    const fresh = await login(mobile);
    expect(typeof fresh.accessToken).toBe('string');
    const addrs = await request(app)
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${fresh.accessToken}`);
    expect(addrs.status).toBe(200);
    expect(addrs.body.addresses).toEqual([]);
  });

  it('deleting a second time (already-anonymised) does not crash', async () => {
    const { accessToken } = await login('9557000011');
    const first = await request(app)
      .delete('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(first.status).toBe(200);
    // the token is now revoked, so a repeat is simply unauthorized, never a 500
    const second = await request(app)
      .delete('/api/v1/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(second.status).toBe(401);
  });
});
