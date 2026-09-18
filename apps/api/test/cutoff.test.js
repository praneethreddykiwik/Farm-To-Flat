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

describe('generateWindows — cut-off timing (pure)', () => {
  it('a window is open well before its cut-off, no countdown yet', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '01:00'); // 2h45 before the 03:45 cut-off
    const [morning] = generateWindows(community, today, noBookings, now);
    expect(morning.isOpen).toBe(true);
    expect(morning.showCountdown).toBe(false);
    expect(morning.secondsUntilCutoff).toBe(165 * 60);
  });

  it('exactly the user-described scenario: 3:30 AM shows a 15-minute countdown to the 3:45 cut-off', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '03:30');
    const [morning] = generateWindows(community, today, noBookings, now);
    expect(morning.isOpen).toBe(true);
    expect(morning.showCountdown).toBe(true);
    expect(morning.secondsUntilCutoff).toBe(15 * 60);
  });

  it('one second after the cut-off, the window is closed and the countdown is gone', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '03:45') + 1000;
    const [morning] = generateWindows(community, today, noBookings, now);
    expect(morning.isOpen).toBe(false);
    expect(morning.showCountdown).toBe(false);
    expect(morning.secondsUntilCutoff).toBe(0);
  });

  it('evening window uses its own cut-off, independent of the morning one', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '14:50'); // 10 min before the 15:00 evening cut-off
    const [morning, evening] = generateWindows(community, today, noBookings, now);
    expect(morning.isOpen).toBe(false); // long past 03:45
    expect(evening.isOpen).toBe(true);
    expect(evening.showCountdown).toBe(true);
    expect(evening.secondsUntilCutoff).toBe(10 * 60);
  });

  it('a future date is always open regardless of the current clock time', () => {
    const today = '2026-09-19';
    const now = istInstantMs(today, '23:00'); // well past both cut-offs today
    const windows = generateWindows(community, today, noBookings, now);
    const tomorrowMorning = windows.find((w) => w.date === '2026-09-20' && w.window === 'MORNING');
    expect(tomorrowMorning.isOpen).toBe(true);
    expect(tomorrowMorning.showCountdown).toBe(false);
  });

  it('there is no capacity field at all — booked is informational only', () => {
    const [morning] = generateWindows(community, '2026-09-19', () => 400, 0);
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
    // schedule reflects the new time immediately — cutoffAt is a UTC ISO instant, so compare it
    // against the same IST->UTC conversion the app uses rather than the IST clock digits directly.
    const sched = await request(app).get(`/api/v1/admin/communities/${c.id}/windows`);
    const someMorning = sched.body.windows.find((w) => w.window === 'MORNING');
    expect(Date.parse(someMorning.cutoffAt)).toBe(istInstantMs(someMorning.date, '04:15'));
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
