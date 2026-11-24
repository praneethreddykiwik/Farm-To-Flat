/** Meal planner usage in Weekly insights, and the events behind it. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { track } = await import('../src/lib/events.js');
const { plannerUsage } = await import('../src/lib/planner-usage.js');
const { addDaysISO, istInstantMs, todayISO } = await import('../src/lib/dates.js');

const today = todayISO();
const at = (d, t = '12:00') => new Date(istInstantMs(d, t)).toISOString();
const step = (u, k) => u.steps.find((s) => s.key === k);

describe('planner usage', () => {
  it('the app may send the client events; meal_logged is the server’s own', async () => {
    const mobile = '9337200001';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const send = (name) =>
      request(app)
        .post('/api/v1/events')
        .set({ Authorization: `Bearer ${v.body.accessToken}` })
        .send({ name, props: { from: 'home' } });
    for (const n of [
      'planner_nudge_shown',
      'planner_nudge_tapped',
      'planner_nudge_dismissed',
      'planner_opened',
      'plan_generated',
      'plan_scheduled',
    ])
      expect((await send(n)).status).toBe(202);
    expect((await send('meal_logged')).status).toBe(422);
  });

  it('counts people once, however often they do it, and compares with the period before', () => {
    const from = addDaysISO(today, -40);
    const to = addDaysISO(today, -34); // 7 days
    const prev = addDaysISO(from, -3);
    for (const d of [from, from, to])
      track('planner_opened', {}, { customerId: 'cu_a', at: at(d) });
    track('planner_opened', {}, { customerId: 'cu_b', at: at(to, '23:59') });
    track('planner_opened', {}, { customerId: 'cu_c', at: at(prev) });
    track('planner_opened', {}, { customerId: 'cu_d', at: at(addDaysISO(to, 1), '00:00') }); // outside
    const u = plannerUsage({ from, to });
    expect(step(u, 'planner_opened')).toMatchObject({ people: 2, times: 4, before: 1, change: 1 });
    expect(u.comparedWith).toEqual({ from: addDaysISO(from, -7), to: addDaysISO(from, -1) });
    expect(u.daily.map((d) => d.people)).toEqual([1, 2]);
  });

  it('says how many who tapped Try it went on to make a plan', () => {
    const d = addDaysISO(today, -70);
    for (const c of ['cu_a', 'cu_b', 'cu_c'])
      track('planner_nudge_shown', {}, { customerId: c, at: at(d) });
    for (const c of ['cu_a', 'cu_b'])
      track('planner_nudge_tapped', {}, { customerId: c, at: at(d) });
    track('plan_generated', {}, { customerId: 'cu_a', at: at(d) });
    track('plan_generated', {}, { customerId: 'cu_z', at: at(d) });
    track('planner_nudge_dismissed', {}, { customerId: 'cu_c', at: at(d) });
    expect(plannerUsage({ from: d, to: d }).nudge).toEqual({
      shown: 3,
      tapped: 2,
      dismissed: 1,
      madeAfterTap: 1,
    });
  });

  it('is served with Weekly insights, with no customer in it', async () => {
    const r = await request(app).get('/api/v1/admin/insights');
    expect(r.status).toBe(200);
    expect(r.body.planner.steps).toHaveLength(6);
    expect(JSON.stringify(r.body.planner)).not.toMatch(/cu_/);
  });
});
