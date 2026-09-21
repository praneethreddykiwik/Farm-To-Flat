/**
 * Order cut-off timer: windows close on a same-day IST clock time (not a capacity count), the last
 * `cutoffWarningMinutes` carry a live countdown, and the order route re-checks the cut-off at commit
 * time so a stale client read can never place an order into a closed window.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { generateWindows } from '../src/lib/windows.js';
import { istInstantMs, todayISO } from '../src/lib/dates.js';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

const community = {
  id: 'com_test',
  deliveryDays: [0, 1, 2, 3, 4, 5, 6],
  morningCutoff: '03:45',
  eveningCutoff: '15:00',
  cutoffWarningMinutes: 15,
};
const noBookings = () => 0;

const dayAfter = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

describe('generateWindows — next-day lead time', () => {
  it("today is never orderable, however early it is and however far off the day's cut-off", () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '01:00'); // 2h45 before the 03:45 harvest cut-off
    const sameDay = generateWindows(community, today, noBookings, now).filter(
      (w) => w.date === today,
    );
    expect(sameDay.length).toBe(2);
    for (const w of sameDay) {
      expect(w.isOpen).toBe(false);
      expect(w.tooSoon).toBe(true); // shut because it is too close, not because time ran out
    }
  });

  it('the earliest orderable delivery is tomorrow — the bug the tester reported', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '12:55'); // midday, as in the report
    const open = generateWindows(community, today, noBookings, now).filter((w) => w.isOpen);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((w) => w.date > today)).toBe(true);
    expect(open[0].date).toBe(dayAfter(today));
  });
});

describe('generateWindows — cut-off timing (pure)', () => {
  it('ordering for tomorrow stays open through today, with no countdown yet', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '01:00');
    const morning = generateWindows(community, today, noBookings, now).find(
      (w) => w.date === dayAfter(today) && w.window === 'MORNING',
    );
    expect(morning.isOpen).toBe(true);
    expect(morning.showCountdown).toBe(false);
    // The deadline is midnight tonight — 23h, not the 03:45 harvest time on the delivery day.
    expect(morning.secondsUntilCutoff).toBe(23 * 60 * 60);
  });

  it('the countdown appears in the last 15 minutes before the deadline', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '23:45'); // 15 min before midnight closes tomorrow's windows
    const morning = generateWindows(community, today, noBookings, now).find(
      (w) => w.date === dayAfter(today) && w.window === 'MORNING',
    );
    expect(morning.isOpen).toBe(true);
    expect(morning.showCountdown).toBe(true);
    expect(morning.secondsUntilCutoff).toBe(15 * 60);
  });

  it('one second after the deadline, the window is closed and the countdown is gone', () => {
    const today = '2026-09-19';
    const now = istInstantMs(dayAfter(today), '00:00') + 1000;
    const morning = generateWindows(community, today, noBookings, now).find(
      (w) => w.date === dayAfter(today) && w.window === 'MORNING',
    );
    expect(morning.isOpen).toBe(false);
    expect(morning.showCountdown).toBe(false);
    expect(morning.secondsUntilCutoff).toBe(0);
  });

  it('the community harvest cut-off is still reported, separately from the ordering deadline', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '10:00');
    const ws = generateWindows(community, today, noBookings, now);
    const m = ws.find((w) => w.date === dayAfter(today) && w.window === 'MORNING');
    const e = ws.find((w) => w.date === dayAfter(today) && w.window === 'EVENING');
    expect(m.harvestCutoffAt).toBe(new Date(istInstantMs(dayAfter(today), '03:45')).toISOString());
    expect(e.harvestCutoffAt).toBe(new Date(istInstantMs(dayAfter(today), '15:00')).toISOString());
    // Both still close at the same moment: midnight tonight.
    expect(m.cutoffAt).toBe(e.cutoffAt);
  });

  it('a future date is always open regardless of the current clock time', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '23:00'); // well past both cut-offs today
    const windows = generateWindows(community, today, noBookings, now);
    const dayAfterTomorrow = windows.find((w) => w.date === '2026-09-21' && w.window === 'MORNING');
    expect(dayAfterTomorrow.isOpen).toBe(true);
    expect(dayAfterTomorrow.showCountdown).toBe(false);
  });

  it('there is no capacity field at all — booked is informational only', () => {
    const ws = generateWindows(community, '2026-09-19', () => 400, 0);
    const morning = ws.find((w) => w.date === '2026-09-20' && w.window === 'MORNING');
    expect(morning.booked).toBe(400);
    expect(morning.isOpen).toBe(true); // 400 "bookings" never closes it — only the clock does
    expect(morning).not.toHaveProperty('capacity');
    expect(morning).not.toHaveProperty('remaining');
  });
});

describe('admin can configure cut-off times end to end', () => {
  it('PATCH updates morning/evening cut-off and warning minutes, GET reflects it', async () => {
    const list = await request(app).get('/api/v1/admin/communities');
    const c = list.body.communities[0];
    const r = await request(app)
      .patch(`/api/v1/admin/communities/${c.id}`)
      .send({ morningCutoff: '04:15', eveningCutoff: '16:30', cutoffWarningMinutes: 20 });
    expect(r.status).toBe(200);
    expect(r.body.community.morningCutoff).toBe('04:15');
    expect(r.body.community.eveningCutoff).toBe('16:30');
    expect(r.body.community.cutoffWarningMinutes).toBe(20);
    // The schedule reflects the new harvest time immediately. `harvestCutoffAt` is that configured
    // time; `cutoffAt` is the ordering deadline, which the one-day lead pulls earlier still.
    const sched = await request(app).get(`/api/v1/admin/communities/${c.id}/windows`);
    const someMorning = sched.body.windows.find((w) => w.window === 'MORNING');
    expect(Date.parse(someMorning.harvestCutoffAt)).toBe(istInstantMs(someMorning.date, '04:15'));
    expect(Date.parse(someMorning.cutoffAt)).toBeLessThanOrEqual(
      Date.parse(someMorning.harvestCutoffAt),
    );
    // restore
    await request(app)
      .patch(`/api/v1/admin/communities/${c.id}`)
      .send({ morningCutoff: '03:45', eveningCutoff: '15:00', cutoffWarningMinutes: 15 });
  });

  it('rejects a malformed clock time', async () => {
    const list = await request(app).get('/api/v1/admin/communities');
    const c = list.body.communities[0];
    const r = await request(app)
      .patch(`/api/v1/admin/communities/${c.id}`)
      .send({ morningCutoff: '25:99' });
    expect(r.status).toBe(422);
  });
});

describe('order placement re-checks the cut-off at commit time (never trusts a stale client read)', () => {
  async function customerReady(mobile, communityId) {
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const token = v.body.accessToken;
    const { body: c } = await request(app).get('/api/v1/communities');
    const community = communityId
      ? c.communities.find((x) => x.id === communityId)
      : c.communities[0];
    const a = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({ communityId: community.id, block: community.blocks[0], flat: '606', floor: '6' });
    const { body } = await request(app).get('/api/v1/admin/products');
    for (const p of body.products
      .filter((x) => (x.availability || 'AVAILABLE') === 'AVAILABLE')
      .slice(0, 6)) {
      await request(app)
        .put('/api/v1/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: p.id, quantity: 6 });
    }
    return { token, addressId: a.body.address.id, community };
  }

  it('a window whose cut-off has already passed today is not orderable, and the API says so', async () => {
    const list = await request(app).get('/api/v1/admin/communities');
    const c = list.body.communities[0];
    // Guarantee today is actually a delivery day for this community (otherwise the 14-day schedule
    // may skip straight to a future date, whose midnight cut-off hasn't happened yet), then push the
    // morning cut-off to a time that has already passed today.
    await request(app)
      .patch(`/api/v1/admin/communities/${c.id}`)
      .send({ deliveryDays: [0, 1, 2, 3, 4, 5, 6], morningCutoff: '00:00' });

    const ctx = await customerReady('9299000001', c.id);
    const sched = await request(app)
      .get(`/api/v1/delivery-windows?addressId=${ctx.addressId}`)
      .set('Authorization', `Bearer ${ctx.token}`);
    const todayMorning = sched.body.windows.find((w) => w.window === 'MORNING');
    expect(todayMorning.date).toBe(todayISO()); // confirm this really is today's window, not a future one
    expect(todayMorning.isOpen).toBe(false);

    const order = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ addressId: ctx.addressId, deliveryDate: todayMorning.date, window: 'MORNING' });
    expect(order.status).toBe(409);
    expect(order.body.error.code).toBe('ORDER_CUTOFF_PASSED');

    await request(app)
      .patch(`/api/v1/admin/communities/${c.id}`)
      .send({ deliveryDays: c.deliveryDays, morningCutoff: '03:45' });
  });

  it('an open window with no bookings at all still accepts unlimited real orders (no capacity ceiling)', async () => {
    const list = await request(app).get('/api/v1/admin/communities');
    const c = list.body.communities[0];
    // push the evening cut-off far into the future so it's guaranteed open all test long
    await request(app).patch(`/api/v1/admin/communities/${c.id}`).send({ eveningCutoff: '23:59' });
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      const ctx = await customerReady(`929900001${i}`, c.id);
      const sched = await request(app)
        .get(`/api/v1/delivery-windows?addressId=${ctx.addressId}`)
        .set('Authorization', `Bearer ${ctx.token}`);
      const evening = sched.body.windows.find((w) => w.window === 'EVENING' && w.isOpen);
      const order = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${ctx.token}`)
        .send({ addressId: ctx.addressId, deliveryDate: evening.date, window: 'EVENING' });
      results.push(order.status);
    }
    expect(results).toEqual([201, 201, 201, 201, 201]); // no WINDOW_FULL / capacity rejection at any point
    await request(app).patch(`/api/v1/admin/communities/${c.id}`).send({ eveningCutoff: '15:00' });
  });
});
