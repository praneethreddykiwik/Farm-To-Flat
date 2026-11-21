/**
 * Review #29 (21 Nov 2026): an operator's sign-out was kept in an in-memory Set, so the next deploy
 * brought the signed-out session back to life for the rest of its 12 hours. The revocation now
 * lives in the ops store (kind `adminRevoked`), which is loaded at boot before traffic.
 *
 * Tests run on the in-memory store, so "a restart" is simulated the way the boot path behaves:
 * fresh modules (empty memory), then the rows the database would hand back to loadOps put back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';

async function boot() {
  vi.resetModules();
  const session = await import('../src/lib/admin-session.js');
  const ops = await import('../src/ops-store.js');
  const { app } = await import('../src/index.js');
  return { app, session, ops };
}

describe('admin sign-out survives a restart', () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = 'a-stable-test-secret-value';
  });
  afterEach(() => {
    delete process.env.ADMIN_SESSION_SECRET;
    vi.resetModules();
  });

  it('records the revocation in the ops store with the token expiry', async () => {
    const { app, session, ops } = await boot();
    const { token, payload } = session.issueAdminSession({
      email: 'owner@fooducia.in',
      role: 'SUPER_ADMIN',
    });
    expect(session.verifyAdminSession(token)).toBeTruthy();
    await request(app).post('/api/v1/admin/auth/signout').set('x-admin-session', token).expect(200);
    expect(session.verifyAdminSession(token)).toBeNull();
    expect(ops.getOps('adminRevoked', payload.jti)).toMatchObject({ exp: payload.exp });
  });

  it('a revocation loaded at boot keeps the old session signed out', async () => {
    const first = await boot();
    const { token } = first.session.issueAdminSession({
      email: 'owner@fooducia.in',
      role: 'SUPER_ADMIN',
    });
    first.session.revokeAdminSession(token);
    const persisted = first.ops.listOps('adminRevoked');
    expect(persisted).toHaveLength(1);

    // Restart without the row: the bug — the same secret makes the token valid again.
    const bare = await boot();
    expect(bare.session.verifyAdminSession(token)).toBeTruthy();

    // Restart with the row reloaded, as loadOps does from the database.
    const second = await boot();
    for (const r of persisted) await second.ops.putOps('adminRevoked', r.id, r);
    expect(second.session.verifyAdminSession(token)).toBeNull();
    const r = await request(second.app)
      .get('/api/v1/admin/orders?limit=1')
      .set('x-admin-session', token);
    expect(r.status).toBe(401);
  });

  it('prunes revocations whose token has already expired on its own', async () => {
    const { session, ops } = await boot();
    await ops.putOps('adminRevoked', 'old-jti', { exp: 1 });
    const { token } = session.issueAdminSession({ email: 'ops@fooducia.in', role: 'ADMIN' });
    session.revokeAdminSession(token);
    await new Promise((r) => setTimeout(r, 0));
    expect(ops.getOps('adminRevoked', 'old-jti')).toBeNull();
    expect(ops.listOps('adminRevoked')).toHaveLength(1);
  });
});
