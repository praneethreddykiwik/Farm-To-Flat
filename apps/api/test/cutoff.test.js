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

describe('generateWindows — each window closes at its own cut-off', () => {
  it('the morning and evening slots of one day have DIFFERENT deadlines', () => {
    // The tester's report: "each time slot has different timer at different time". Under the old
    // one-day lead both slots closed at midnight before the delivery day, so both counted down to
    // the same instant and the configured cut-off times did nothing.
    const now = istInstantMs('2026-09-22', '14:15');
    const ws = generateWindows(community, '2026-09-22', noBookings, now);
    const m = ws.find((w) => w.date === '2026-09-23' && w.window === 'MORNING');
    const e = ws.find((w) => w.date === '2026-09-23' && w.window === 'EVENING');
    expect(m.cutoffAt).not.toBe(e.cutoffAt);
    expect(Date.parse(m.cutoffAt)).toBe(istInstantMs('2026-09-23', '03:45'));
    expect(Date.parse(e.cutoffAt)).toBe(istInstantMs('2026-09-23', '15:00'));
    expect(m.secondsUntilCutoff).toBe(13 * 3600 + 30 * 60);
    expect(e.secondsUntilCutoff).toBe(24 * 3600 + 45 * 60);
  });

  it("today's window is orderable right up to its own cut-off — the 2:15-for-a-3:00 case", () => {
    // 45 minutes before today's 15:00 evening cut-off: the customer can still take that slot, and
    // sees 45:00 ticking. This is the scenario the countdown exists for.
    const now = istInstantMs('2026-09-22', '14:15');
    const ws = generateWindows(community, '2026-09-22', noBookings, now);
    const todayEvening = ws.find((w) => w.date === '2026-09-22' && w.window === 'EVENING');
    expect(todayEvening.isOpen).toBe(true);
    expect(todayEvening.secondsUntilCutoff).toBe(45 * 60);
    expect(todayEvening.showCountdown).toBe(true);

    // ...while today's morning slot closed at 03:45 and is long gone.
    const todayMorning = ws.find((w) => w.date === '2026-09-22' && w.window === 'MORNING');
    expect(todayMorning.isOpen).toBe(false);
    expect(todayMorning.secondsUntilCutoff).toBe(0);
  });
});

describe('generateWindows — cut-off timing (pure)', () => {
  it('a window well before its cut-off counts down without being urgent', () => {
    const now = istInstantMs('2026-09-19', '01:00'); // 2h45 before the 03:45 morning cut-off
    const morning = generateWindows(community, '2026-09-19', noBookings, now).find(
      (w) => w.date === '2026-09-19' && w.window === 'MORNING',
    );
    expect(morning.isOpen).toBe(true);
    // The countdown runs for the whole time the window is orderable, not only near the deadline.
    expect(morning.showCountdown).toBe(true);
    expect(morning.isUrgent).toBe(false);
    expect(morning.secondsUntilCutoff).toBe(2 * 3600 + 45 * 60);
  });

  it('the countdown turns urgent in the last 15 minutes before the deadline', () => {
    const now = istInstantMs('2026-09-19', '03:30'); // 15 min before the 03:45 cut-off
    const morning = generateWindows(community, '2026-09-19', noBookings, now).find(
      (w) => w.date === '2026-09-19' && w.window === 'MORNING',
    );
    expect(morning.isOpen).toBe(true);
    expect(morning.showCountdown).toBe(true);
    expect(morning.isUrgent).toBe(true);
    expect(morning.secondsUntilCutoff).toBe(15 * 60);
  });

  it('one second after the deadline, the window is closed and the countdown is gone', () => {
    const now = istInstantMs('2026-09-19', '03:45') + 1000;
    const morning = generateWindows(community, '2026-09-19', noBookings, now).find(
      (w) => w.date === '2026-09-19' && w.window === 'MORNING',
    );
    expect(morning.isOpen).toBe(false);
    expect(morning.showCountdown).toBe(false);
    expect(morning.isUrgent).toBe(false);
    expect(morning.secondsUntilCutoff).toBe(0);
  });

  it('the ordering deadline and the reported harvest cut-off are the same instant', () => {
    const now = istInstantMs('2026-09-19', '10:00');
    const ws = generateWindows(community, '2026-09-19', noBookings, now);
    const m = ws.find((w) => w.date === dayAfter('2026-09-19') && w.window === 'MORNING');
    const e = ws.find((w) => w.date === dayAfter('2026-09-19') && w.window === 'EVENING');
    expect(Date.parse(m.harvestCutoffAt)).toBe(istInstantMs(m.date, '03:45'));
    expect(Date.parse(e.harvestCutoffAt)).toBe(istInstantMs(e.date, '15:00'));
    expect(m.cutoffAt).toBe(m.harvestCutoffAt);
    expect(e.cutoffAt).toBe(e.harvestCutoffAt);
  });

  it('a future date is always open regardless of the current clock time', () => {
    const now = istInstantMs('2026-09-19', '23:00'); // well past both cut-offs today
    const windows = generateWindows(community, '2026-09-19', noBookings, now);
    const future = windows.find((w) => w.date === '2026-09-21' && w.window === 'MORNING');
    expect(future.isOpen).toBe(true);
    expect(future.showCountdown).toBe(true);
    expect(future.isUrgent).toBe(false);
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
