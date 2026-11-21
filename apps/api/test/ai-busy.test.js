/** 21 Nov 2026: Groq's free-plan limit is reported as "busy, try again", not "bad photo". */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key-not-used';

let failWith = 429;
vi.mock('../src/lib/identify.js', async (orig) => ({
  ...(await orig()),
  callVision: async () => {
    const e = new Error(`groq ${failWith}: rate_limit_exceeded`);
    e.status = failWith;
    throw e;
  },
}));

const { app } = await import('../src/index.js');
const { isRateLimited } = await import('../src/lib/identify.js');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]).toString(
  'base64',
);

let token;
beforeAll(async () => {
  const mobile = '9700000091';
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  token = v.body.accessToken;
});

describe('Groq usage limits', () => {
  it('recognises 429, 413 and rate_limit errors, and nothing else', () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited({ status: 413 })).toBe(true);
    expect(isRateLimited({ message: 'groq 400: rate_limit_exceeded' })).toBe(true);
    expect(isRateLimited({ status: 500 })).toBe(false);
  });

  for (const code of [429, 413]) {
    it(`photo search answers 503 AI_BUSY when Groq says ${code}`, async () => {
      failWith = code;
      const r = await request(app)
        .post('/api/v1/ai/identify')
        .set({ Authorization: `Bearer ${token}` })
        .send({ imageBase64: JPEG, contentType: 'image/jpeg' });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('AI_BUSY');
      expect(r.body.error.message).toMatch(/try again in a minute/);
    });
  }
});
