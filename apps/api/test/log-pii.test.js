/**
 * Review #37 (21 Nov 2026): phone numbers and operator emails were written to the server log.
 * Numbers are masked to 98xxxxxx10; an admin sign-in logs the role, not the address (the audit row
 * keeps who it was).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { maskMobileForLog } from '../src/lib/log-mask.js';

process.env.NODE_ENV = 'test';

describe('maskMobileForLog', () => {
  it('keeps the first two and last two digits', () => {
    expect(maskMobileForLog('9848012310')).toBe('98xxxxxx10');
    expect(maskMobileForLog('+91 98480 12310')).toBe('91xxxxxxxx10');
  });
  it('hides anything too short to mask safely', () => {
    expect(maskMobileForLog('12345')).toBe('xxxxxxxxxx');
    expect(maskMobileForLog(undefined)).toBe('xxxxxxxxxx');
  });
});

describe('admin sign-in log line', () => {
  const CLIENT_ID = '1234567890-test.apps.googleusercontent.com';
  const KID = 'test-key-1';
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.ADMIN_GOOGLE_EMAILS;
    delete process.env.ADMIN_SESSION_SECRET;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('names the role, never the email', async () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.ADMIN_GOOGLE_EMAILS = 'owner@fooducia.in:SUPER_ADMIN';
    process.env.ADMIN_SESSION_SECRET = 'a-stable-test-secret-value';
    const jwk = publicKey.export({ format: 'jwk' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'max-age=3600' },
        json: async () => ({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] }),
      })),
    );
    const now = Math.floor(Date.now() / 1000);
    const h = b64({ alg: 'RS256', kid: KID, typ: 'JWT' });
    const p = b64({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: '10987',
      email: 'owner@fooducia.in',
      email_verified: true,
      iat: now,
      exp: now + 3600,
    });
    const sig = crypto
      .sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey)
      .toString('base64url');

    vi.resetModules();
    const { resetGoogleKeyCache } = await import('../src/lib/google-auth.js');
    resetGoogleKeyCache();
    const { app } = await import('../src/index.js');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await request(app)
      .post('/api/v1/admin/auth/google')
      .send({ credential: `${h}.${p}.${sig}` });
    expect(r.status).toBe(200);
    const lines = spy.mock.calls.map((c) => c.join(' '));
    expect(lines.some((l) => l.includes('[admin-auth]') && l.includes('SUPER_ADMIN'))).toBe(true);
    expect(lines.some((l) => l.includes('owner@fooducia.in'))).toBe(false);
  });
});
