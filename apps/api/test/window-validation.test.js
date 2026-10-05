/**
 * A delivery window has to make sense as a window.
 *
 * The invariant is that ordering closes BEFORE the van sets off — an order was once accepted
 * against a 06:00–12:00 run that had already finished, because the cut-off was read as a time on
 * the delivery day and "17:17" kept the window open all day.
 *
 * That invariant now lives in the time maths rather than in a rule the operator has to satisfy: a
 * cut-off is the last occurrence of its clock time before `start`, so "17:17" means 5:17pm the day
 * BEFORE — which is how a dawn delivery is really scheduled. Any clock time is therefore valid, and
 * the thing to test is that the resulting deadline still lands before the run begins.
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
    // Accepted now, and stored verbatim: it means 5:17pm the day before the run.
    expect(r.status).toBe(200);
    expect(r.body.community.windows[0].cutoff).toBe('17:17');
  });

  it('accepts a cut-off exactly at the start, meaning the same time the day before', async () => {
    const id = await community('Cutoff At Start Towers');
    const r = await admin(request(app).patch(`/api/v1/admin/communities/${id}`)).send({
      windows: [win({ cutoff: '06:00' })],
    });
    expect(r.status).toBe(200);
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

describe('a cut-off later in the day than the run', () => {
  it('is kept exactly as the operator typed it, not rewritten behind their back', async () => {
    const { communityWindows } = await import('../src/lib/windows.js');
    const defs = communityWindows({
      deliveryDays: [0, 1, 2, 3, 4, 5, 6],
      windows: [
        { key: 'MORNING', label: 'Morning', cutoff: '17:17', start: '06:00', end: '12:00' },
      ],
    });
    expect(defs[0].cutoff).toBe('17:17');
  });

  it('still closes ordering BEFORE the run starts — the invariant that matters', async () => {
    const { generateWindows } = await import('../src/lib/windows.js');
    const { istInstantMs } = await import('../src/lib/dates.js');
    for (const [cutoff, start, end] of [
      ['17:17', '06:00', '12:00'], // closes the previous afternoon
      ['23:59', '00:30', '04:00'], // start just after midnight
      ['12:00', '12:00', '15:00'], // cut-off exactly at the start
      ['03:45', '06:00', '12:00'], // the ordinary same-day case
    ]) {
      const rows = generateWindows(
        {
          id: 'c1',
          deliveryDays: [0, 1, 2, 3, 4, 5, 6],
          orderLeadDays: 0,
          windows: [{ key: 'W', label: 'W', cutoff, start, end }],
        },
        '2026-01-05',
        () => 0,
        istInstantMs('2026-01-01', '00:00'),
      );
      for (const r of rows) {
        // The deadline must fall strictly before that day's run begins.
        expect(new Date(r.cutoffAt).getTime()).toBeLessThan(istInstantMs(r.date, start));
      }
    }
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
