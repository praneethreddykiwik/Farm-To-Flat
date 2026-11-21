/** Review #45 (21 Nov 2026): the server can name the oldest app version still allowed. */
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');
afterEach(() => delete process.env.MIN_APP_VERSION);

describe('GET /app/version', () => {
  it('blocks nobody by default, and needs no sign-in', async () => {
    const r = await request(app).get('/api/v1/app/version');
    expect(r.status).toBe(200);
    expect(r.body.minVersion).toBeNull();
    expect(r.body.storeUrl.android).toContain('in.fooducia.customer');
  });
  it('returns the configured minimum, and ignores a malformed one', async () => {
    process.env.MIN_APP_VERSION = '0.3.0';
    expect((await request(app).get('/api/v1/app/version')).body.minVersion).toBe('0.3.0');
    process.env.MIN_APP_VERSION = 'latest';
    expect((await request(app).get('/api/v1/app/version')).body.minVersion).toBeNull();
  });
});
