/**
 * Complaint photographs are private — taken inside someone's home, attached to an order with an
 * address on it. This route has no session behind it, because an <img> cannot send one, so the
 * token IS the credential and these are the properties that make that safe.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';

async function load() {
  vi.resetModules();
  return {
    app: (await import('../src/index.js')).app,
    media: await import('../src/lib/media.js'),
  };
}

describe('private media links', () => {
  beforeEach(() => {
    process.env.MEDIA_TOKEN_SECRET = 'a-stable-secret-for-the-tests';
  });
  afterEach(() => {
    delete process.env.MEDIA_TOKEN_SECRET;
    vi.resetModules();
  });

  it('round-trips a path through a token', async () => {
    const { media } = await load();
    const t = media.mediaToken('ord_abc/photo.jpg');
    expect(media.readMediaToken(t)).toBe('ord_abc/photo.jpg');
  });

  it('refuses a token whose payload has been edited to point somewhere else', async () => {
    const { media } = await load();
    const [, sig] = media.mediaToken('ord_mine/photo.jpg').split('.');
    const forged = Buffer.from(
      JSON.stringify({ p: 'ord_someone_else/photo.jpg', e: Math.floor(Date.now() / 1000) + 600 }),
    ).toString('base64url');
    expect(media.readMediaToken(`${forged}.${sig}`)).toBe(null);
  });

  it('refuses a token signed with a different secret', async () => {
    const { media } = await load();
    const t = media.mediaToken('ord_abc/photo.jpg');
    process.env.MEDIA_TOKEN_SECRET = 'a-completely-different-secret';
    const { media: other } = await load();
    expect(other.readMediaToken(t)).toBe(null);
  });

  it('refuses an expired token', async () => {
    const { media } = await load();
    const t = media.mediaToken('ord_abc/photo.jpg');
    // nine hours on; the lifetime is eight
    vi.setSystemTime(new Date(Date.now() + 9 * 60 * 60 * 1000));
    expect(media.readMediaToken(t)).toBe(null);
    vi.useRealTimers();
  });

  it('refuses rubbish without throwing', async () => {
    const { media } = await load();
    for (const bad of ['', 'x', 'a.b.c', 'notbase64.notbase64', null, undefined])
      expect(media.readMediaToken(bad)).toBe(null);
  });

  it('answers 404 — not 401 — for a bad token, so a prober learns nothing', async () => {
    const { app } = await load();
    const r = await request(app).get('/api/v1/media/issue/deadbeef.deadbeef');
    expect([404, 503]).toContain(r.status);
  });

  it('needs no bearer token, because an <img> cannot send one', async () => {
    const { app } = await load();
    const r = await request(app).get('/api/v1/media/issue/deadbeef.deadbeef');
    expect(r.status).not.toBe(401);
  });

  it('builds an absolute URL on the origin the request arrived on', async () => {
    const { media } = await load();
    const url = media.mediaUrl('https://api.example.test', 'ord_abc/photo.jpg');
    expect(url.startsWith('https://api.example.test/api/v1/media/issue/')).toBe(true);
    // the path must survive the round trip through the URL
    const token = decodeURIComponent(url.split('/media/issue/')[1]);
    expect(media.readMediaToken(token)).toBe('ord_abc/photo.jpg');
  });

  it('rewrites an order’s photos onto our own origin, not the storage provider’s', async () => {
    vi.resetModules();
    const { linkOrderIssuePhotos } = await import('../src/lib/storage.js');
    const order = { issues: [{ photos: ['ord_1/a.jpg', 'ord_1/b.jpg'] }] };
    linkOrderIssuePhotos(order, 'https://api.example.test');
    expect(order.issues[0].photos).toHaveLength(2);
    for (const u of order.issues[0].photos) {
      expect(u.startsWith('https://api.example.test/api/v1/media/issue/')).toBe(true);
      expect(u).not.toContain('supabase');
    }
  });

  it('recovers the object path from photos stored as old public URLs', async () => {
    vi.resetModules();
    const { linkOrderIssuePhotos } = await import('../src/lib/storage.js');
    const { readMediaToken } = await import('../src/lib/media.js');
    const legacy =
      'https://proj.supabase.co/storage/v1/object/public/order-issues/ord_9/old.jpg?x=1';
    const order = { issues: [{ photos: [legacy] }] };
    linkOrderIssuePhotos(order, 'https://api.example.test');
    const token = decodeURIComponent(order.issues[0].photos[0].split('/media/issue/')[1]);
    expect(readMediaToken(token)).toBe('ord_9/old.jpg');
  });

  it('leaves an order with no photos alone', async () => {
    vi.resetModules();
    const { linkOrderIssuePhotos } = await import('../src/lib/storage.js');
    const order = { id: 'x', issues: [{ photos: [] }, {}] };
    expect(() => linkOrderIssuePhotos(order, 'https://api.example.test')).not.toThrow();
    expect(linkOrderIssuePhotos([order], 'https://api.example.test')).toEqual([order]);
  });
});
