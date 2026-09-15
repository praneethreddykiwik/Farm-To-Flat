/**
 * Staff roles are enforced on every admin route: a FULFILMENT driver can run the board but not edit
 * prices or grant roles; PROCUREMENT can buy but not approve; ADMIN manages everything except
 * SUPER_ADMIN grants; a plain customer gets 401.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { roleMayAccess } = await import('../src/routes/admin/auth.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
async function login(mobile) {
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  return v.body.accessToken;
}
// test env has no ADMIN_TOKEN → tokenless requests are the dev SUPER_ADMIN (used only to set up)
async function grant(mobile, role) {
  const r = await request(app).post('/api/v1/admin/access').send({ mobile, role, name: role });
  expect(r.status).toBe(201);
  return r.body.staff.id;
}

describe('roleMayAccess (pure)', () => {
  it('maps roles to route families', () => {
    expect(roleMayAccess('FULFILMENT', '/orders', 'GET')).toBe(true);
    expect(roleMayAccess('FULFILMENT', '/orders/x/status', 'PATCH')).toBe(true);
    expect(roleMayAccess('FULFILMENT', '/metrics', 'GET')).toBe(true);
    expect(roleMayAccess('FULFILMENT', '/products', 'GET')).toBe(false);
    expect(roleMayAccess('FULFILMENT', '/access', 'POST')).toBe(false);
    expect(roleMayAccess('PROCUREMENT', '/procurement', 'GET')).toBe(true);
    expect(roleMayAccess('PROCUREMENT', '/procurement/cost', 'POST')).toBe(true);
    expect(roleMayAccess('PROCUREMENT', '/procurement/settings', 'GET')).toBe(true);
    expect(roleMayAccess('PROCUREMENT', '/procurement/settings', 'PATCH')).toBe(false);
    expect(roleMayAccess('PROCUREMENT', '/procurement/approve', 'POST')).toBe(false);
    expect(roleMayAccess('PROCUREMENT', '/orders', 'GET')).toBe(false);
    expect(roleMayAccess('ADMIN', '/procurement/approve', 'POST')).toBe(true);
    expect(roleMayAccess('ADMIN', '/some/new/route', 'GET')).toBe(true);
    expect(roleMayAccess('FULFILMENT', '/some/new/route', 'GET')).toBe(false); // deny by default
    expect(roleMayAccess('SUPER_ADMIN', '/anything', 'DELETE')).toBe(true);
    expect(roleMayAccess(undefined, '/orders', 'GET')).toBe(false);
  });
});

describe('admin routes enforce roles', () => {
  it('FULFILMENT: board yes, catalog/access no', async () => {
    await grant('9800000001', 'FULFILMENT');
    const t = await login('9800000001');
    expect((await request(app).get('/api/v1/admin/orders').set(auth(t))).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/metrics').set(auth(t))).status).toBe(200);
    const p = await request(app).get('/api/v1/admin/products').set(auth(t));
    expect(p.status).toBe(403);
    expect(p.body.error.code).toBe('FORBIDDEN');
    const esc = await request(app)
      .post('/api/v1/admin/access')
      .set(auth(t))
      .send({ mobile: '9800000099', role: 'SUPER_ADMIN' });
    expect(esc.status).toBe(403);
    expect((await request(app).get('/api/v1/admin/analytics').set(auth(t))).status).toBe(403);
  });

  it('PROCUREMENT: buy list yes, approvals/settings no, orders no', async () => {
    await grant('9800000002', 'PROCUREMENT');
    const t = await login('9800000002');
    expect((await request(app).get('/api/v1/admin/procurement').set(auth(t))).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/procurement/settings').set(auth(t))).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .patch('/api/v1/admin/procurement/settings')
          .set(auth(t))
          .send({ costBufferPct: 50 })
      ).status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/v1/admin/procurement/approvals').set(auth(t))).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/admin/orders').set(auth(t))).status).toBe(403);
  });

  it('ADMIN: everything except granting SUPER_ADMIN', async () => {
    await grant('9800000003', 'ADMIN');
    const t = await login('9800000003');
    expect((await request(app).get('/api/v1/admin/products').set(auth(t))).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/analytics').set(auth(t))).status).toBe(200);
    const ok = await request(app)
      .post('/api/v1/admin/access')
      .set(auth(t))
      .send({ mobile: '9800000004', role: 'ADMIN' });
    expect(ok.status).toBe(201);
    const no = await request(app)
      .post('/api/v1/admin/access')
      .set(auth(t))
      .send({ mobile: '9800000005', role: 'SUPER_ADMIN' });
    expect(no.status).toBe(403);
    const superId = await grant('9800000006', 'SUPER_ADMIN'); // via dev super admin
    const demote = await request(app)
      .patch(`/api/v1/admin/access/${superId}`)
      .set(auth(t))
      .send({ role: 'ADMIN' });
    expect(demote.status).toBe(403);
    const del = await request(app).delete(`/api/v1/admin/access/${superId}`).set(auth(t));
    expect(del.status).toBe(403);
  });

  it('a plain customer is 401 on every admin route', async () => {
    const t = await login('9800000010');
    expect((await request(app).get('/api/v1/admin/orders').set(auth(t))).status).toBe(401);
    expect((await request(app).get('/api/v1/admin/metrics').set(auth(t))).status).toBe(401);
  });
});
