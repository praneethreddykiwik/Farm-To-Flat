/**
 * DPDP (21 Nov 2026): consent to the privacy notice with an 18+ confirmation is recorded at sign-up
 * or asked once afterwards; sign-ins and account changes go to a one-year security record.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { NOTICE_VERSION } = await import('../src/lib/consent.js');
const { listOps, putOpsSoft } = await import('../src/ops-store.js');
const { sweepSecurityLog, securityEventsFor } = await import('../src/lib/security-log.js');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function signIn(mobile, consent) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  return request(app)
    .post('/api/v1/auth/otp/verify')
    .send({ mobile, otp: '123456', ...(consent ? { consent } : {}) });
}

describe('consent at sign-up', () => {
  it('ticking both boxes records consent; the app is told nothing more is needed', async () => {
    const v = await signIn('9888000001', { version: NOTICE_VERSION, adult: true });
    expect(v.status).toBe(200);
    expect(v.body.consentRequired).toBe(false);
    const c = await request(app).get('/api/v1/me/consent').set(auth(v.body.accessToken));
    expect(c.body.required).toBe(false);
    expect(c.body.accepted.adult).toBe(true);
  });

  it('an older app that sends no consent still signs in, and is asked once', async () => {
    const v = await signIn('9888000002');
    expect(v.status).toBe(200);
    expect(v.body.consentRequired).toBe(true);
    const t = v.body.accessToken;
    const notAdult = await request(app)
      .post('/api/v1/me/consent')
      .set(auth(t))
      .send({ version: NOTICE_VERSION, adult: false });
    expect(notAdult.status).toBe(422);
    const stale = await request(app)
      .post('/api/v1/me/consent')
      .set(auth(t))
      .send({ version: 'privacy-2020-01-01', adult: true });
    expect(stale.body.error.code).toBe('NOTICE_CHANGED');
    const ok = await request(app)
      .post('/api/v1/me/consent')
      .set(auth(t))
      .send({ version: NOTICE_VERSION, adult: true });
    expect(ok.status).toBe(200);
    expect((await request(app).get('/api/v1/me/consent').set(auth(t))).body.required).toBe(false);
  });

  it('the consent record holds no name, number or address', () => {
    for (const c of listOps('consent')) {
      expect(JSON.stringify(c)).not.toMatch(/98880000/);
      expect(c.history.length).toBeGreaterThan(0);
    }
  });
});

describe('security record', () => {
  it('records sign-ins and failed codes with a masked number', async () => {
    await request(app).post('/api/v1/auth/otp/request').send({ mobile: '9888000003' });
    await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ mobile: '9888000003', otp: '000000' });
    const v = await signIn('9888000003');
    const events = listOps('securityEvent').filter((e) => e.mobile === '98xxxxxx03');
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['SIGN_IN_FAILED', 'SIGN_IN']),
    );
    expect(JSON.stringify(events)).not.toContain('9888000003');
    const mine = securityEventsFor(v.body.customer.id);
    expect(mine.some((e) => e.type === 'SIGN_IN')).toBe(true);
  });

  it('keeps events for a year, then deletes them', async () => {
    const old = new Date(Date.now() - 400 * 864e5).toISOString();
    putOpsSoft('securityEvent', 'old-one', { type: 'SIGN_IN', at: old });
    const recent = new Date(Date.now() - 300 * 864e5).toISOString();
    putOpsSoft('securityEvent', 'recent-one', { type: 'SIGN_IN', at: recent });
    await sweepSecurityLog();
    const ids = listOps('securityEvent').map((e) => e.id);
    expect(ids).not.toContain('old-one');
    expect(ids).toContain('recent-one');
  });
});

describe('consent never locks anyone out', () => {
  it('is not required while the ops table is unavailable', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('../src/ops-store.js', async (orig) => ({
      ...(await orig()),
      opsReady: () => false,
    }));
    const { consentRequired } = await import('../src/lib/consent.js');
    expect(consentRequired('cus_any')).toBe(false);
    vi.doUnmock('../src/ops-store.js');
  });
});
