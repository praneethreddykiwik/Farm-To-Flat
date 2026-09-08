/**
 * New community reflects in the public (app-facing) catalog, and batch-advancing a community's
 * orders moves them together in one action.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

describe('add community', () => {
  it('creates a community that appears in the app-facing /communities', async () => {
    const create = await request(app)
      .post('/api/v1/admin/communities')
      .send({
        name: 'Test Enclave',
        area: 'Kokapet',
        blocks: ['Block 1', 'Block 2'],
        deliveryDays: [1, 3, 5],
        windowCapacity: 30,
      });
    expect(create.status).toBe(201);
    const pub = await request(app).get('/api/v1/communities');
    const found = pub.body.communities.find((c) => c.name === 'Test Enclave');
    expect(found).toBeTruthy();
    expect(found.blocks).toContain('Block 1');
  });
});

describe('batch-advance a community', () => {
  it('moves every listed order to the same status and reports notified count', async () => {
    const confirmed = (await request(app).get('/api/v1/admin/orders?status=CONFIRMED')).body.orders;
    const comm = confirmed[0].address.communityName;
    const group = confirmed.filter((o) => o.address.communityName === comm);
    const r = await request(app)
      .post('/api/v1/admin/orders/advance')
      .send({ orderIds: group.map((o) => o.id), status: 'PACKING' });
    expect(r.status).toBe(200);
    expect(r.body.count).toBe(group.length);
    expect(r.body.notified).toBe(group.length);
    expect([...new Set(r.body.updated.map((o) => o.status))]).toEqual(['PACKING']);
  });

  it('skips illegal transitions rather than failing the batch', async () => {
    const delivered = (await request(app).get('/api/v1/admin/orders?status=DELIVERED')).body.orders;
    if (delivered.length === 0) return;
    const r = await request(app)
      .post('/api/v1/admin/orders/advance')
      .send({ orderIds: [delivered[0].id], status: 'PACKING' });
    expect(r.body.count).toBe(0);
    expect(r.body.skipped[0].reason).toBe('INVALID_TRANSITION');
  });
});
