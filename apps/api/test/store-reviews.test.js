/** App Store and Google Play reviews in the admin. The stores are faked; nothing leaves the machine. */
import { generateKeyPairSync, createPublicKey, verify } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
const { listOps, removeOps } = await import('../src/ops-store.js');
const S = await import('../src/lib/store-reviews.js');

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const P8 = ec.privateKey.export({ type: 'pkcs8', format: 'pem' });
const RSA = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' });
const A = '/api/v1/admin/feedback/store-reviews';
const KEYS = ['ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_PRIVATE_KEY', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'];
let calls;
let answers;
const connect = () => {
  process.env.ASC_ISSUER_ID = 'iss';
  process.env.ASC_KEY_ID = 'KEY1';
  process.env.ASC_PRIVATE_KEY = P8.replace(/\n/g, '\\n'); // how a key looks pasted into one line
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'a@b.c',
    private_key: RSA,
  });
};
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const appleReview = (id, over = {}) => ({
  id,
  attributes: {
    rating: 4,
    title: 'Fresh',
    body: 'Good greens',
    reviewerNickname: 'Asha',
    createdDate: '2026-11-20T10:00:00-07:00',
    territory: 'IND',
    ...over,
  },
  relationships: { response: { data: { id: 'resp1' } } },
});
const googleReview = (id, t = 'Nice\tVery fresh') => ({
  reviewId: id,
  authorName: 'Ravi',
  comments: [
    {
      userComment: {
        text: t,
        starRating: 5,
        lastModified: { seconds: '1795000000' },
        appVersionName: '0.2.0',
      },
    },
    { developerComment: { text: 'Thank you' } },
  ],
});

beforeEach(async () => {
  calls = [];
  for (const r of listOps('storeReview')) await removeOps('storeReview', r.id);
  answers = {
    apple: () =>
      json({
        data: [appleReview('1')],
        included: [{ id: 'resp1', attributes: { responseBody: 'Thanks' } }],
      }),
    token: () => json({ access_token: 'tok' }),
    google: () => json({ reviews: [googleReview('g1')] }),
  };
  vi.stubGlobal('fetch', async (url, init) => {
    const u = String(url);
    calls.push({ u, init });
    if (u.includes('appstoreconnect')) return answers.apple(u);
    if (u.includes('oauth2')) return answers.token(u);
    if (u.includes('androidpublisher')) return answers.google(u);
    throw new Error(`unexpected ${u}`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) delete process.env[k];
});

describe('store reviews', () => {
  it('does nothing and calls nobody until a store is connected', async () => {
    expect(await S.syncStoreReviews()).toEqual({});
    expect(calls).toHaveLength(0);
    const r = await request(app).get(A);
    expect(r.body.stores.find((s) => s.key === 'apple').connected).toBe(false);
    expect(r.body.reviews).toEqual([]);
  });

  it('a half-filled or unreadable key counts as not connected', () => {
    expect(S.storeConfig({ ASC_KEY_ID: 'x', GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: '{bad' })).toEqual({
      apple: null,
      google: null,
    });
  });

  it('signs Apple’s token properly and keeps it under 20 minutes', () => {
    const [h, b, s] = S.appleToken({ issuer: 'iss', keyId: 'KEY1', key: P8 }).split('.');
    const body = JSON.parse(Buffer.from(b, 'base64url'));
    expect(JSON.parse(Buffer.from(h, 'base64url'))).toEqual({
      alg: 'ES256',
      kid: 'KEY1',
      typ: 'JWT',
    });
    expect(body.aud).toBe('appstoreconnect-v1');
    expect(body.exp - body.iat).toBeLessThanOrEqual(1200);
    expect(
      verify(
        'sha256',
        Buffer.from(`${h}.${b}`),
        { key: createPublicKey(ec.privateKey), dsaEncoding: 'ieee-p1363' },
        Buffer.from(s, 'base64url'),
      ),
    ).toBe(true);
  });

  it('brings in both stores, with words, stars and our reply', async () => {
    connect();
    expect(await S.syncStoreReviews()).toEqual({ apple: { added: 1 }, google: { added: 1 } });
    const { body } = await request(app).get(A);
    expect(body.reviews.find((r) => r.store === 'apple')).toMatchObject({
      rating: 4,
      title: 'Fresh',
      author: 'Asha',
      country: 'IND',
      reply: 'Thanks',
    });
    expect(body.reviews.find((r) => r.store === 'google')).toMatchObject({
      rating: 5,
      title: 'Nice',
      body: 'Very fresh',
      reply: 'Thank you',
    });
    expect(body.stores.find((s) => s.key === 'apple')).toMatchObject({
      count: 1,
      average: 4,
      connected: true,
    });
    expect((await request(app).get(`${A}?store=google&rating=5`)).body.reviews).toHaveLength(1);
    expect((await request(app).get(`${A}?rating=1`)).body.reviews).toHaveLength(0);
    for (const c of calls) expect(c.init.signal).toBeDefined();
  });

  it('checking again adds nothing; an edited review is updated; one that drops out of Google’s week stays', async () => {
    connect();
    await S.syncStoreReviews();
    answers.apple = () =>
      json({ data: [appleReview('1', { rating: 1, body: 'Changed my mind' })] });
    answers.google = () => json({});
    expect(await S.syncStoreReviews()).toEqual({ apple: { added: 0 }, google: { added: 0 } });
    const { body } = await request(app).get(A);
    expect(body.reviews).toHaveLength(2);
    expect(body.reviews.find((r) => r.store === 'apple')).toMatchObject({
      rating: 1,
      body: 'Changed my mind',
    });
  });

  it('follows Apple’s next page, but never sends the token to another site', async () => {
    connect();
    answers.apple = (u) =>
      u.includes('cursor=2')
        ? json({ data: [appleReview('2')], links: { next: 'https://evil.example/v1?x' } })
        : json({
            data: [appleReview('1')],
            links: {
              next: 'https://api.appstoreconnect.apple.com/v1/apps/1/customerReviews?cursor=2',
            },
          });
    expect((await S.syncStoreReviews()).apple).toEqual({ added: 2 });
    expect(calls.some((c) => c.u.includes('evil'))).toBe(false);
  });

  it('one store failing does not stop the other, and no key or token appears in the error', async () => {
    connect();
    answers.apple = () => json({ errors: [{ detail: 'secret' }] }, 401);
    const r = await S.syncStoreReviews();
    expect(r.apple.error).toBe('App Store answered 401.');
    expect(r.google).toEqual({ added: 1 });
    process.env.ASC_PRIVATE_KEY = 'not a key SECRETVALUE';
    const bad = await S.syncStoreReviews();
    expect(bad.apple.error).toBe('App Store could not be reached. Check its key.');
    const page = JSON.stringify((await request(app).get(A)).body);
    expect(page).not.toMatch(/SECRETVALUE|PRIVATE KEY|a@b\.c/);
  });

  it('a review with no stars or date is ignored rather than shown broken', async () => {
    connect();
    answers.apple = () =>
      json({ data: [appleReview('x', { rating: 9 }), appleReview('y', { createdDate: null })] });
    expect((await S.syncStoreReviews()).apple).toEqual({ added: 0 });
  });

  it('others are typed in and can be removed; a store’s own cannot', async () => {
    connect();
    await S.syncStoreReviews();
    const add = await request(app).post(A).send({ store: 'maps', rating: 3, body: 'Late once' });
    expect(add.status).toBe(201);
    expect((await request(app).post(A).send({ store: 'apple', rating: 5, body: 'x' })).status).toBe(
      422,
    );
    expect(
      (
        await request(app)
          .post(A)
          .send({ store: 'maps', rating: 5, body: 'x', url: 'javascript:alert(1)' })
      ).status,
    ).toBe(422);
    expect(
      (await request(app).delete(`${A}/${encodeURIComponent(add.body.review.id)}`)).status,
    ).toBe(200);
    expect((await request(app).delete(`${A}/${encodeURIComponent('apple:1')}`)).status).toBe(404);
  });
});
