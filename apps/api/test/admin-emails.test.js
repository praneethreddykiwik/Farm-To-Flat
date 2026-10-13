/**
 * The console-managed Google allowlist. It must: let a SUPER_ADMIN add and remove addresses, make
 * an added address able to sign in (as ADMIN, never more), refuse to delete an env-set owner, and
 * stay shut to anyone below SUPER_ADMIN.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

process.env.NODE_ENV = 'test';

async function app() {
  const mod = await import('../src/index.js');
  return mod.app;
}
let request;
beforeEach(async () => {
  ({ default: request } = await import('supertest'));
  process.env.ADMIN_TOKEN = 'test-super-token';
  process.env.ADMIN_GOOGLE_EMAILS = 'owner@fooducia.in:SUPER_ADMIN';
});
afterEach(() => {
  delete process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_GOOGLE_EMAILS;
});

const auth = (r) => r.set('x-admin-token', 'test-super-token');

describe('admin-emails (who can access admin)', () => {
  it('lists the env owner as read-only and starts with no managed entries', async () => {
    const a = await app();
    const r = await auth(request(a).get('/api/v1/admin/admin-emails'));
    expect(r.status).toBe(200);
    expect(r.body.owners).toContainEqual({ email: 'owner@fooducia.in', role: 'SUPER_ADMIN' });
    expect(r.body.managed).toEqual([]);
  });

  it('adds an address, which then resolves to ADMIN, and removes it again', async () => {
    const a = await app();
    const add = await auth(
      request(a).post('/api/v1/admin/admin-emails').send({ email: 'Buyer@Example.com' }),
    );
    expect(add.status).toBe(200);
    expect(add.body.managed).toContainEqual({ email: 'buyer@example.com', role: 'ADMIN' });

    const { roleForEmail } = await import('../src/lib/admin-directory.js');
    expect(roleForEmail('buyer@example.com')).toBe('ADMIN');

    const del = await auth(request(a).delete('/api/v1/admin/admin-emails/buyer%40example.com'));
    expect(del.status).toBe(200);
    expect(del.body.managed).toEqual([]);
    expect(roleForEmail('buyer@example.com')).toBe(null);
  });

  it('rejects a duplicate and an invalid email', async () => {
    const a = await app();
    await auth(request(a).post('/api/v1/admin/admin-emails').send({ email: 'dup@example.com' }));
    const dup = await auth(
      request(a).post('/api/v1/admin/admin-emails').send({ email: 'dup@example.com' }),
    );
    expect(dup.status).toBe(409);
    const bad = await auth(
      request(a).post('/api/v1/admin/admin-emails').send({ email: 'not-an-email' }),
    );
    expect(bad.status).toBe(422);
    await auth(request(a).delete('/api/v1/admin/admin-emails/dup%40example.com'));
  });

  it('refuses to delete an env-set owner', async () => {
    const a = await app();
    const r = await auth(request(a).delete('/api/v1/admin/admin-emails/owner%40fooducia.in'));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('ENV_PROTECTED');
  });
});
