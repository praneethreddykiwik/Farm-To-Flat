/**
 * Meal photos are deleted when they should be (security audit 2026-11-14, storage limitation).
 *
 * Three ways a photo of someone's kitchen used to outlive its purpose:
 *  1. Adding to a meal with a second photo replaced the log's photo key without deleting the old
 *     file, so it was left in storage with nothing pointing at it — beyond the retention sweep and
 *     beyond account deletion.
 *  2. The sweep deletes by the meal's date, and any date was accepted — a log dated 2099 kept its
 *     photo for ever.
 *  3. With the S3 driver, deleting did nothing at all.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key-not-used';

// Storage and the vision call are the two things a test cannot reach. Everything else is real.
const stored = [];
const deleted = [];
vi.mock('../src/lib/storage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadMealPhoto: async ({ customerId }) => {
    const key = `${customerId}/photo-${stored.length + 1}.jpg`;
    stored.push(key);
    return key;
  },
  deleteMealPhotos: async (keys) => {
    deleted.push(...(keys || []).filter(Boolean));
    return keys.length;
  },
}));
vi.mock('../src/lib/meal-vision.js', () => ({
  analyseMealPhoto: async () => ({
    items: [{ name: 'Cooked rice', grams: 150 }],
    confidence: 'high',
    note: null,
  }),
}));

const { app } = await import('../src/index.js');
const { addDaysISO, todayISO } = await import('../src/lib/dates.js');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
// A JPEG by its signature, which is all the type check reads.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]).toString(
  'base64',
);

let token;
beforeAll(async () => {
  const mobile = '9700000077';
  await request(app).post('/api/v1/admin/access').send({ mobile, role: 'ADMIN', aiAccess: true });
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  token = v.body.accessToken;
});
beforeEach(() => {
  stored.length = 0;
  deleted.length = 0;
});

const log = (body) => request(app).post('/api/v1/meals/log').set(auth(token)).send(body);

describe('a meal photo', () => {
  it('is deleted when a second photo is ADDED to the same meal, not just when it replaces it', async () => {
    const date = todayISO();
    const first = await log({
      date,
      slot: 'lunch',
      mode: 'photo',
      imageBase64: JPEG,
      contentType: 'image/jpeg',
    });
    expect(first.status).toBe(201);
    const second = await log({
      date,
      slot: 'lunch',
      mode: 'photo',
      imageBase64: JPEG,
      contentType: 'image/jpeg',
      append: true,
    });
    expect(second.status).toBe(201);
    // the log now points at the second photo, and the first one is gone from storage
    expect(stored).toHaveLength(2);
    expect(deleted).toEqual([stored[0]]);
  });

  it('cannot be logged on a day that has not happened, so the retention sweep always reaches it', async () => {
    const r = await log({ date: addDaysISO(todayISO(), 30), slot: 'dinner', mode: 'skipped' });
    expect(r.status).toBe(422);
    // tomorrow is allowed: a phone in another timezone can be a day ahead of IST
    const ok = await log({ date: addDaysISO(todayISO(), 1), slot: 'dinner', mode: 'skipped' });
    expect(ok.status).toBe(201);
  });
});

describe('deleting meal photos from S3', () => {
  it('sends a signed DELETE for each photo instead of doing nothing', async () => {
    vi.resetModules();
    vi.doUnmock('../src/lib/storage.js');
    Object.assign(process.env, {
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'f2f-test-bucket',
      AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'test-secret-not-real',
    });
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method, auth: init?.headers?.Authorization });
      return new Response(null, { status: 204 });
    };
    try {
      const storage = await import('../src/lib/storage.js');
      const n = await storage.deleteMealPhotos(['cus_1/a.jpg', 'cus_1/b.jpg']);
      expect(n).toBe(2);
      expect(calls.map((c) => c.method)).toEqual(['DELETE', 'DELETE']);
      expect(calls[0].url).toContain('/meal-photos/cus_1/a.jpg');
      expect(calls[0].auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//);
    } finally {
      globalThis.fetch = realFetch;
      for (const k of ['STORAGE_DRIVER', 'S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])
        delete process.env[k];
    }
  });
});
