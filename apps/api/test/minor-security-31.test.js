/**
 * Review #31 (21 Nov 2026), three small items:
 *   (a) a refresh token replayed after it was rotated out ends that session family — but the app's
 *       own parallel-refresh race (inside a 30 s grace window) still signs nobody out;
 *   (b) /health keeps status and commit public, and shows payment / webhook / origin-lock details
 *       only to a caller with the HEALTH_TOKEN;
 *   (c) photo links are signed with a key DERIVED from the admin secret, never the secret itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';

describe('(a) refresh-token reuse', () => {
  afterEach(() => vi.restoreAllMocks());

  async function store() {
    vi.resetModules();
    return import('../src/customer-store.js');
  }

  it('a parallel refresh inside the grace window revokes nothing', async () => {
    const cs = await store();
    const first = cs.issueTokens('cus_race');
    const winner = cs.rotateRefresh(first.refreshToken);
    expect(winner).toBeTruthy();
    // The loser of the race presents the same, now-rotated token a moment later.
    expect(cs.rotateRefresh(first.refreshToken)).toBeNull();
    // The winner's new pair is untouched: still signed in, and can rotate again.
    expect(cs.resolveAccess(winner.accessToken)).toBe('cus_race');
    expect(cs.rotateRefresh(winner.refreshToken)).toBeTruthy();
  });

  it('a replay after the grace window ends that family, and only that family', async () => {
    const cs = await store();
    const phone = cs.issueTokens('cus_reuse');
    const tablet = cs.issueTokens('cus_reuse'); // another sign-in = another family
    const next = cs.rotateRefresh(phone.refreshToken);
    expect(next).toBeTruthy();

    const later = Date.now() + cs.REFRESH_REUSE_GRACE_MS + 1000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    expect(cs.rotateRefresh(phone.refreshToken)).toBeNull();

    // The phone's whole chain is gone — the stolen copy and the legitimate successor alike.
    expect(cs.resolveAccess(next.accessToken)).toBeNull();
    expect(cs.rotateRefresh(next.refreshToken)).toBeNull();
    // The tablet is a different family and keeps working.
    expect(cs.resolveAccess(tablet.accessToken)).toBe('cus_reuse');
    expect(cs.rotateRefresh(tablet.refreshToken)).toBeTruthy();
  });

  it('a token nobody ever issued is just refused', async () => {
    const cs = await store();
    const live = cs.issueTokens('cus_unknown');
    expect(cs.rotateRefresh('ref_made_up')).toBeNull();
    expect(cs.resolveAccess(live.accessToken)).toBe('cus_unknown');
  });
});

describe('(b) /health details behind HEALTH_TOKEN', () => {
  afterEach(() => {
    delete process.env.HEALTH_TOKEN;
    vi.resetModules();
  });

  async function app() {
    vi.resetModules();
    return (await import('../src/index.js')).app;
  }

  it('without HEALTH_TOKEN set, shows status and commit only', async () => {
    const r = await request(await app())
      .get('/health')
      .set('x-health-token', 'anything');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, service: 'f2f-api' });
    expect(r.body).toHaveProperty('commit');
    expect(r.body).not.toHaveProperty('payments');
    expect(r.body).not.toHaveProperty('originLock');
    expect(r.body).not.toHaveProperty('sentry');
  });

  it('with HEALTH_TOKEN set, a wrong or missing header gets no details', async () => {
    process.env.HEALTH_TOKEN = 'health-token-for-tests';
    const a = await app();
    const none = await request(a).get('/health');
    expect(none.body).not.toHaveProperty('payments');
    const wrong = await request(a).get('/health').set('x-health-token', 'nope');
    expect(wrong.body).not.toHaveProperty('payments');
  });

  it('with the matching header, the details come back', async () => {
    process.env.HEALTH_TOKEN = 'health-token-for-tests';
    const r = await request(await app())
      .get('/health')
      .set('x-health-token', 'health-token-for-tests');
    expect(r.body.ok).toBe(true);
    expect(r.body.payments).toHaveProperty('mode');
    expect(r.body.payments).toHaveProperty('webhook');
    expect(r.body).toHaveProperty('originLock');
    expect(r.body).toHaveProperty('sentry');
  });
});

describe('(c) media key is derived, not shared', () => {
  afterEach(() => {
    delete process.env.MEDIA_TOKEN_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;
    vi.resetModules();
  });

  it('without MEDIA_TOKEN_SECRET, tokens are NOT signed with the admin secret itself', async () => {
    const admin = 'admin-session-secret-for-tests';
    process.env.ADMIN_SESSION_SECRET = admin;
    vi.resetModules();
    const media = await import('../src/lib/media.js');
    const t = media.mediaToken('ord_1/a.jpg');
    const [payload, sig] = t.split('.');
    const withAdmin = crypto.createHmac('sha256', admin).update(payload).digest('base64url');
    expect(sig).not.toBe(withAdmin);
    expect(media.readMediaToken(t)).toBe('ord_1/a.jpg');

    // Stable across a restart with the same admin secret — links survive a deploy as before.
    vi.resetModules();
    const again = await import('../src/lib/media.js');
    expect(again.readMediaToken(t)).toBe('ord_1/a.jpg');
  });

  it('MEDIA_TOKEN_SECRET, when set, is used as is', async () => {
    const own = 'a-stable-secret-for-the-tests';
    process.env.MEDIA_TOKEN_SECRET = own;
    vi.resetModules();
    const media = await import('../src/lib/media.js');
    const [payload, sig] = media.mediaToken('x.jpg').split('.');
    expect(sig).toBe(crypto.createHmac('sha256', own).update(payload).digest('base64url'));
  });
});
