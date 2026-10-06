/**
 * The operator panel's new front door. The thing it must never do is accept an identity it has not
 * cryptographically verified, or keep honouring one after the person was removed from the list.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';

const CLIENT_ID = '1234567890-test.apps.googleusercontent.com';
const KID = 'test-key-1';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Mint an ID token the way Google would, so only the KEY differs between genuine and forged. */
function idToken(claims = {}, key = privateKey, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', kid: KID, typ: 'JWT', ...header });
  const p = b64({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '10987',
    email: 'owner@fooducia.in',
    email_verified: true,
    name: 'Owner',
    iat: now,
    exp: now + 3600,
    ...claims,
  });
  if (h.includes('"alg":"none"')) return `${h}.${p}.`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url');
  return `${h}.${p}.${sig}`;
}

/** Google's published key set, served to the verifier instead of the real network. */
function stubCerts() {
  const jwk = publicKey.export({ format: 'jwk' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'max-age=3600' },
      json: async () => ({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }),
    })),
  );
}

async function app() {
  vi.resetModules();
  const { resetGoogleKeyCache } = await import('../src/lib/google-auth.js');
  resetGoogleKeyCache();
  return (await import('../src/index.js')).app;
}

const post = (a, body) => request(a).post('/api/v1/admin/auth/google').send(body);

describe('admin Google sign-in', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.ADMIN_GOOGLE_EMAILS = 'owner@fooducia.in:SUPER_ADMIN, ops@fooducia.in';
    process.env.ADMIN_SESSION_SECRET = 'a-stable-test-secret-value';
    stubCerts();
  });
  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.ADMIN_GOOGLE_EMAILS;
    delete process.env.ADMIN_SESSION_SECRET;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('issues a session for a verified, allowlisted account', async () => {
    const r = await post(await app(), { credential: idToken() });
    expect(r.status).toBe(200);
    expect(r.body.operator).toMatchObject({ email: 'owner@fooducia.in', role: 'SUPER_ADMIN' });
    expect(typeof r.body.session).toBe('string');
  });

  it('gives a bare allowlist entry ADMIN, not SUPER_ADMIN — a typo must not grant everything', async () => {
    const r = await post(await app(), { credential: idToken({ email: 'ops@fooducia.in' }) });
    expect(r.status).toBe(200);
    expect(r.body.operator.role).toBe('ADMIN');
  });

  it('refuses a token signed by somebody else', async () => {
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const r = await post(await app(), { credential: idToken({}, other) });
    expect(r.status).toBe(401);
  });

  it('refuses alg:none — the payload alone is not a credential', async () => {
    const r = await post(await app(), { credential: idToken({}, privateKey, { alg: 'none' }) });
    expect(r.status).toBe(401);
  });

  it('refuses a token minted for a different site', async () => {
    const r = await post(await app(), {
      credential: idToken({ aud: 'someone-else.apps.googleusercontent.com' }),
    });
    expect(r.status).toBe(401);
  });

  it('refuses an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const r = await post(await app(), { credential: idToken({ iat: past, exp: past + 600 }) });
    expect(r.status).toBe(401);
  });

  it('refuses an unverified Google email', async () => {
    const r = await post(await app(), { credential: idToken({ email_verified: false }) });
    expect(r.status).toBe(401);
  });

  it('refuses a perfectly valid Google account that is not on the allowlist', async () => {
    const r = await post(await app(), { credential: idToken({ email: 'stranger@gmail.com' }) });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('NOT_AUTHORISED');
  });

  it('opens the admin API with the session it issued', async () => {
    const a = await app();
    const signIn = await post(a, { credential: idToken() });
    const r = await request(a)
      .get('/api/v1/admin/orders?limit=1')
      .set('x-admin-session', signIn.body.session);
    expect(r.status).toBe(200);
  });

  it('refuses a session whose payload has been edited', async () => {
    const a = await app();
    const signIn = await post(a, { credential: idToken() });
    const [v, payload, sig] = signIn.body.session.split('.');
    const edited = JSON.parse(Buffer.from(payload, 'base64url').toString());
    edited.email = 'stranger@gmail.com';
    const r = await request(a)
      .get('/api/v1/admin/orders?limit=1')
      .set('x-admin-session', `${v}.${b64(edited)}.${sig}`);
    expect(r.status).toBe(401);
  });

  it('stops honouring a session the moment the address leaves the allowlist', async () => {
    const a = await app();
    const signIn = await post(a, { credential: idToken() });
    const session = signIn.body.session;
    expect(
      (await request(a).get('/api/v1/admin/orders?limit=1').set('x-admin-session', session)).status,
    ).toBe(200);

    process.env.ADMIN_GOOGLE_EMAILS = 'ops@fooducia.in';
    const after = await request(a)
      .get('/api/v1/admin/orders?limit=1')
      .set('x-admin-session', session);
    expect(after.status).toBe(401);
  });

  it('stops honouring a session after sign-out', async () => {
    const a = await app();
    const signIn = await post(a, { credential: idToken() });
    const session = signIn.body.session;
    await request(a).post('/api/v1/admin/auth/signout').set('x-admin-session', session).expect(200);
    const after = await request(a)
      .get('/api/v1/admin/orders?limit=1')
      .set('x-admin-session', session);
    expect(after.status).toBe(401);
  });

  it('refuses a made-up session', async () => {
    const r = await request(await app())
      .get('/api/v1/admin/orders?limit=1')
      .set('x-admin-session', 'v1.eyJyb2xlIjoiU1VQRVJfQURNSU4ifQ.not-a-signature');
    expect(r.status).toBe(401);
  });

  it('advertises Google only when BOTH the client id and the allowlist are set', async () => {
    const withBoth = await request(await app()).get('/api/v1/admin/auth/config');
    expect(withBoth.body.google).toMatchObject({ enabled: true, clientId: CLIENT_ID });

    delete process.env.ADMIN_GOOGLE_EMAILS;
    const without = await request(await app()).get('/api/v1/admin/auth/config');
    expect(without.body.google.enabled).toBe(false);
    expect(without.body.google.clientId).toBe(null);
    expect(without.body.token.enabled).toBe(true);
  });

  it('refuses every Google sign-in when the server has no client id', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const r = await post(await app(), { credential: idToken() });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('GOOGLE_NOT_CONFIGURED');
  });
});
