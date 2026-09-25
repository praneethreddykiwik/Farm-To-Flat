/**
 * A delivery window has to make sense as a window.
 *
 * An operator set a 06:00–12:00 morning run to close orders at 17:17. Because the cut-off belongs to
 * the DELIVERY day, that window then stayed orderable all day — including the hours after the van
 * had already been and gone — and an order was accepted against a run that had finished. The
 * countdown was not wrong either; it was faithfully counting toward a deadline that came after the
 * delivery.
 *
 * So: a window ends after it starts, and ordering closes before it starts.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const admin = (r) => r.set('x-admin-token', process.env.ADMIN_TOKEN || '123456');

async function community(name) {
  const r = await admin(request(app).post('/api/v1/admin/communities')).send({
    name,
    area: 'Testville',
    blocks: ['A'],
  });
  return r.body.community.id;
}

const win = (o = {}) => ({
  label: 'Morning',
  cutoff: '03:45',
  start: '06:00',
  end: '12:00',
  ...o,
});

describe('a window must close before it delivers', () => {
  it('refuses a cut-off after the run has started — the reported bug, exactly', async () => {
    const id = await community('Cutoff After Start Towers');
    const r = await admin(request(app).patch(`/api/v1/admin/communities/${id}`)).send({
      windows: [win({ cutoff: '17:17' })], // delivers 06:00–12:00
    });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toMatch(/close before/i);
  });

  it('refuses a cut-off exactly at the start — that is already too late to pack', async () => {
    const id = await community('Cutoff At Start Towers');
    const r = await admin(request(app).patch(`/api/v1/admin/communities/${id}`)).send({
      windows: [win({ cutoff: '06:00' })],
    });
    expect(r.status).toBe(422);
  });

  it('refuses a window that ends before it begins', async () => {
    const id = await community('Backwards Window Towers');
    const r = await admin(request(app).patch(`/api/v1/admin/communities/${id}`)).send({
      windows: [win({ start: '12:00', end: '06:00', cutoff: '03:45' })],
    });
    expect(r.status).toBe(422);
  });

  it('accepts a sane window, so the rule does not block ordinary editing', async () => {
    const id = await community('Sane Window Towers');
    const r = await admin(request(app).patch(`/api/v1/admin/communities/${id}`)).send({
      windows: [win(), win({ label: 'Evening', cutoff: '15:00', start: '17:00', end: '21:00' })],
    });
    expect(r.status).toBe(200);
    expect(r.body.community.windows.map((w) => w.label)).toEqual(['Morning', 'Evening']);
  });
});

describe('a window already saved with a nonsense cut-off', () => {
  it('closes when the run begins rather than staying open all day', async () => {
    const { communityWindows } = await import('../src/lib/windows.js');
    // Exactly the shape found in production: morning run, cut-off in the late afternoon.
    const defs = communityWindows({
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      windows: [
        { key: 'MORNING', label: 'Morning', cutoff: '17:17', start: '06:00', end: '12:00' },
      ],
    });
    expect(defs[0].cutoff).toBe('06:00');
  });

  it('leaves a sane cut-off exactly as the operator set it', async () => {
    const { communityWindows } = await import('../src/lib/windows.js');
    const defs = communityWindows({
      deliveryDays: [1],
      windows: [
        { key: 'MORNING', label: 'Morning', cutoff: '03:45', start: '06:00', end: '12:00' },
      ],
    });
    expect(defs[0].cutoff).toBe('03:45');
  });
});
