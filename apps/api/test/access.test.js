/**
 * Role-based access: assigning roles to numbers, and the app-facing resolve seam.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

describe('access & roles', () => {
  it('lists the four roles with their sections', async () => {
    const r = await request(app).get('/api/v1/admin/access');
    expect(r.body.roles.map((x) => x.code)).toEqual([
      'SUPER_ADMIN',
      'ADMIN',
      'PROCUREMENT',
      'FULFILMENT',
    ]);
    const proc = r.body.roles.find((x) => x.code === 'PROCUREMENT');
    expect(proc.sections).toEqual(['procurement']);
  });

  it('assigns a number a role and resolves it for the app', async () => {
    const add = await request(app)
      .post('/api/v1/admin/access')
      .send({ mobile: '9848022222', role: 'FULFILMENT', name: 'Driver' });
    expect(add.status).toBe(201);
    expect(add.body.staff.sections).toEqual(['fulfilment']);

    const resolve = await request(app).get('/api/v1/access/resolve?mobile=9848022222');
    expect(resolve.body).toMatchObject({ isStaff: true, role: 'FULFILMENT', aiAccess: false });
    expect(resolve.body.sections).toEqual(['fulfilment']);
  });

  it('a normal customer number resolves to no role and no AI', async () => {
    const r = await request(app).get('/api/v1/access/resolve?mobile=9012345678');
    expect(r.body).toMatchObject({ isStaff: false, role: null, aiAccess: false });
    expect(r.body.sections).toEqual([]);
  });

  it('super admin always gets AI; others can be toggled', async () => {
    const add = await request(app)
      .post('/api/v1/admin/access')
      .send({ mobile: '9848033333', role: 'ADMIN' });
    expect(add.body.staff.aiAccess).toBe(false);
    const on = await request(app)
      .patch(`/api/v1/admin/access/${add.body.staff.id}`)
      .send({ aiAccess: true });
    expect(on.body.staff.aiAccess).toBe(true);
  });

  it('rejects a duplicate number and a bad mobile', async () => {
    await request(app).post('/api/v1/admin/access').send({ mobile: '9848044444', role: 'ADMIN' });
    const dup = await request(app)
      .post('/api/v1/admin/access')
      .send({ mobile: '9848044444', role: 'PROCUREMENT' });
    expect(dup.status).toBe(409);
    const bad = await request(app)
      .post('/api/v1/admin/access')
      .send({ mobile: '123', role: 'ADMIN' });
    expect(bad.status).toBe(422);
  });
});
