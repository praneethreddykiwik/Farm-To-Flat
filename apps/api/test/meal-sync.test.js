/**
 * The tracker in sync with the plan calendar (21 Nov 2026): the plan saved on the server, the
 * per-day comparison (plan / everything logged / photos alone), and meal logs kept in the OpsRecord
 * copy so they survive a missing MealLog table.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key-not-used';

vi.mock('../src/lib/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadMealPhoto: async ({ customerId }) => `${customerId}/sync-photo.jpg`,
  deleteMealPhotos: async (keys) => (keys || []).length,
}));
vi.mock('../src/lib/meal-vision.js', () => ({
  analyseMealPhoto: async () => ({
    items: [{ name: 'Cooked rice', grams: 200 }],
    confidence: 'medium',
    note: null,
  }),
}));

const { app } = await import('../src/index.js');
const { addDaysISO, todayISO } = await import('../src/lib/dates.js');
const { listOps } = await import('../src/ops-store.js');
const { rangeSummary, plannedByDate } = await import('../src/lib/meal-analysis.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]).toString(
  'base64',
);

let token;
beforeAll(async () => {
  const mobile = '9700000078';
  await request(app).post('/api/v1/admin/access').send({ mobile, role: 'ADMIN', aiAccess: true });
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  token = v.body.accessToken;
});

const today = todayISO();
const plan = {
  profile: { age: 34, sex: 'male', weightKg: 72, trackingConsentAt: '2026-11-21T08:00:00.000Z' },
  scheduled: [
    {
      id: 'p1',
      title: 'Test plan',
      days: [
        {
          date: today,
          meals: [
            {
              slot: 'breakfast',
              name: 'Idli',
              totals: { kcal: 400, protein: 12, carbs: 70, fat: 6 },
            },
            {
              slot: 'lunch',
              name: 'Rice and dal',
              totals: { kcal: 650, protein: 20, carbs: 110, fat: 12 },
            },
          ],
        },
      ],
    },
  ],
};

describe('the plan on the server', () => {
  it('saves and returns the plan; an older copy cannot overwrite a newer one', async () => {
    const put = await request(app)
      .put('/api/v1/meals/plan')
      .set(auth(token))
      .send({ ...plan, updatedAt: '2026-11-21T09:00:00.000Z' });
    expect(put.status).toBe(200);
    const got = await request(app).get('/api/v1/meals/plan').set(auth(token));
    expect(got.body.plan.scheduled[0].days[0].meals).toHaveLength(2);
    expect(got.body.plan.profile.trackingConsentAt).toBeTruthy();
    const stale = await request(app)
      .put('/api/v1/meals/plan')
      .set(auth(token))
      .send({ ...plan, scheduled: [], updatedAt: '2026-11-20T09:00:00.000Z' });
    expect(stale.status).toBe(409);
    expect(stale.body.plan.scheduled).toHaveLength(1);
  });

  it('is closed to accounts without tracker access', async () => {
    const mobile = '9700000079';
    await request(app).post('/api/v1/auth/otp/request').send({ mobile });
    const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
    const r = await request(app).get('/api/v1/meals/plan').set(auth(v.body.accessToken));
    expect(r.status).toBe(403);
  });
});

describe('plan vs plate, per day', () => {
  it('reports the plan, everything logged, and the photo estimate on its own', async () => {
    const photo = await request(app).post('/api/v1/meals/log').set(auth(token)).send({
      date: today,
      slot: 'lunch',
      mode: 'photo',
      imageBase64: JPEG,
      contentType: 'image/jpeg',
    });
    expect(photo.status).toBe(201);
    expect(photo.body.log.items.every((it) => it.via === 'photo')).toBe(true);
    const pick = await request(app)
      .post('/api/v1/meals/log')
      .set(auth(token))
      .send({
        date: today,
        slot: 'breakfast',
        mode: 'pick',
        picks: [{ foodId: 'idli', servings: 2 }],
      });
    expect(pick.status).toBe(201);

    const r = await request(app)
      .get(`/api/v1/meals/range?from=${addDaysISO(today, -6)}&to=${today}`)
      .set(auth(token));
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(7);
    const d = r.body.days.at(-1);
    expect(d.planned.kcal).toBe(1050);
    expect(d.mealsLogged).toBe(2);
    expect(d.photo.meals).toBe(1);
    expect(d.photo.kcal).toBeGreaterThan(0);
    expect(d.photo.kcal).toBeLessThan(d.eaten.kcal); // the picked breakfast is not a photo
    expect(d.photo.kcalLow).toBeLessThan(d.photo.kcal);
    expect(d.photo.kcalHigh).toBeGreaterThan(d.photo.kcal);
    expect(r.body.days[0].eaten.kcal).toBe(0);

    // every log also lives in the OpsRecord copy
    const ids = [photo.body.log.id, pick.body.log.id];
    expect(listOps('mealLog').filter((m) => ids.includes(m.id))).toHaveLength(2);
    // and leaves it when deleted
    await request(app).delete(`/api/v1/meals/${pick.body.log.id}`).set(auth(token));
    expect(listOps('mealLog').some((m) => m.id === pick.body.log.id)).toBe(false);
  });

  it('refuses a range that is backwards or too long', async () => {
    const back = await request(app)
      .get(`/api/v1/meals/range?from=${today}&to=${addDaysISO(today, -1)}`)
      .set(auth(token));
    expect(back.status).toBe(422);
    const long = await request(app)
      .get(`/api/v1/meals/range?from=${addDaysISO(today, -90)}&to=${today}`)
      .set(auth(token));
    expect(long.status).toBe(422);
  });
});

describe('helpers', () => {
  it('an older log with a photo still counts as a photo after its tag-less save', () => {
    const logs = [
      {
        date: '2026-11-20',
        slot: 'dinner',
        status: 'FOLLOWED',
        photoKey: 'x.jpg',
        confidence: 'low',
        actualKcal: 500,
        items: [{ name: 'Biryani', kcal: 500 }],
      },
    ];
    const [d] = rangeSummary(logs, '2026-11-20', '2026-11-20');
    expect(d.photo.kcal).toBe(500);
    expect(d.planned).toBeNull();
  });

  it('adds up the plan per date across plans', () => {
    const p = plannedByDate({
      scheduled: [
        { days: [{ date: '2026-11-22', meals: [{ totals: { kcal: 300, protein: 10 } }] }] },
        { days: [{ date: '2026-11-22', meals: [{ totals: { kcal: 200, protein: 5 } }] }] },
      ],
    });
    expect(p['2026-11-22']).toMatchObject({ kcal: 500, protein: 15, meals: 2 });
  });
});
