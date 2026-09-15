/**
 * Access tokens expire; expired OTPs and rate-limit windows are swept; sessions per customer are
 * capped. (ACCESS_TOKEN_TTL_MS is set to 500ms for this file only — vitest isolates module state per
 * file — so the 12-login loop below stays well inside one TTL while the expiry test can wait it out.)
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.ACCESS_TOKEN_TTL_MS = '500';
const { app } = await import('../src/index.js');
const { sweepAuthState } = await import('../src/customer-store.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const me = (t) => request(app).get('/api/v1/me').set('Authorization', `Bearer ${t}`);
async function login(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body;
}

describe('session lifetime', () => {
  it('a customer keeps at most 10 live sessions (oldest dropped)', async () => {
    const tokens = [];
    for (let i = 0; i < 12; i += 1) tokens.push((await login('9555000004')).accessToken);
    expect((await me(tokens[0])).status).toBe(401);
    expect((await me(tokens[1])).status).toBe(401);
    expect((await me(tokens[2])).status).toBe(200);
    expect((await me(tokens[11])).status).toBe(200);
  });

  it('sweep removes expired sessions and abandoned OTPs', async () => {
    await login('9555000002');
    await request(app).post('/api/v1/auth/otp/request').send({ mobile: '9555000003' }); // never verified
    const removed = sweepAuthState(Date.now() + 6 * 60 * 1000); // 6 min later: everything is stale
    expect(removed).toBeGreaterThanOrEqual(2);
  });

  it('an access token stops working after its TTL; refresh issues a fresh one', async () => {
    const { accessToken, refreshToken } = await login('9555000001');
    expect((await me(accessToken)).status).toBe(200);
    await sleep(600);
    expect((await me(accessToken)).status).toBe(401);
    const r = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(r.status).toBe(200);
    expect((await me(r.body.accessToken)).status).toBe(200);
  });
});
