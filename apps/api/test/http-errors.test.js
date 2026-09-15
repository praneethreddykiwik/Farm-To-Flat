/**
 * Malformed input gets the right status code and the contract envelope — never a 500.
 */
import { describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/index.js');

describe('HTTP error semantics', () => {
  it('invalid JSON body → 400 BAD_JSON', async () => {
    const r = await request(app)
      .post('/api/v1/auth/otp/request')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('BAD_JSON');
  });

  it('oversized body → 413 PAYLOAD_TOO_LARGE', async () => {
    const big = JSON.stringify({ mobile: 'x'.repeat(9 * 1024 * 1024) });
    const r = await request(app)
      .post('/api/v1/auth/otp/request')
      .set('Content-Type', 'application/json')
      .send(big);
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('unknown route → 404 with the contract envelope', async () => {
    const r = await request(app).get('/api/v1/does-not-exist');
    expect(r.status).toBe(404);
    expect(r.body.error).toBeTruthy();
  });
});
