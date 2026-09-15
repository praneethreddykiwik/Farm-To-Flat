/**
 * Delivery-window schedule must belong to the community that was asked for. It used to ignore the
 * app's addressId hint and fall back to the FIRST community, so every customer saw the same days.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

describe('delivery windows follow the requested community', () => {
  it('only lists that community’s own delivery weekdays', async () => {
    const { body } = await request(app).get('/api/v1/communities');
    // pick a community whose days differ from the first one, so a wrong fallback is detectable
    const first = body.communities[0];
    const other = body.communities.find(
      (c) =>
        c.id !== first.id && JSON.stringify(c.deliveryDays) !== JSON.stringify(first.deliveryDays),
    );
    expect(other).toBeTruthy();

    const r = await request(app).get(`/api/v1/delivery-windows?communityId=${other.id}`);
    expect(r.status).toBe(200);
    expect(r.body.windows.length).toBeGreaterThan(0);
    for (const w of r.body.windows) expect(other.deliveryDays).toContain(weekdayOf(w.date));
  });

  it('an addressId that cannot be resolved is a 404, never a silent wrong community', async () => {
    const r = await request(app).get('/api/v1/delivery-windows?addressId=addr_does_not_exist');
    expect(r.status).toBe(404);
  });

  it('with no hint at all it still returns a schedule (first community)', async () => {
    const r = await request(app).get('/api/v1/delivery-windows');
    expect(r.status).toBe(200);
    expect(r.body.windows.length).toBeGreaterThan(0);
  });
});
