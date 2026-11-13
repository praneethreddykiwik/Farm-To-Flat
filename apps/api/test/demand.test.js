/**
 * "Do you deliver here?" — community locations, the anonymous count of people asking from
 * elsewhere, the people who asked to be told, and the operator's view of all three.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

const { app } = await import('../src/index.js');
const { demandDb, SETUP_SQL } = await import('../src/demand-db.js');
const { _resetDemand, MAX_SUBSCRIPTIONS } = await import('../src/demand-store.js');
const { _memoryTrail } = await import('../src/lib/audit.js');
const { roleMayAccess } = await import('../src/routes/admin/auth.js');
const { areaFor, haversineM } = await import('../src/lib/geo.js');

const admin = (method, path) =>
  request(app)[method](`/api/v1/admin${path}`).set('x-admin-token', TOKEN);
const as = (token) => ({ Authorization: `Bearer ${token}` });
const area = (key) => `/demand/${encodeURIComponent(key)}`;

let n = 0;
/** A fresh customer each time, so one test's "already counted" never leaks into the next. */
async function customer(name) {
  n += 1;
  const mobile = `98${String(76500000 + n).padStart(8, '0')}`;
  await request(app).post('/api/v1/auth/otp/request').send({ mobile });
  const v = await request(app).post('/api/v1/auth/otp/verify').send({ mobile, otp: '123456' });
  const token = v.body.accessToken;
  if (name) await request(app).patch('/api/v1/me').set(as(token)).send({ name });
  const me = await request(app).get('/api/v1/me').set(as(token));
  return { token, mobile, id: me.body.customer.id };
}
const check = (c, body) => request(app).post('/api/v1/demand/checks').set(as(c.token)).send(body);
const subscribe = (c, body) =>
  request(app).post('/api/v1/demand/subscriptions').set(as(c.token)).send(body);

/** A missing table, exactly as Prisma reports one. */
const noTable = (name) =>
  Object.assign(new Error(`The table \`public.${name}\` does not exist in the current database.`), {
    code: 'P2021',
  });

// The seed: Aparna Cyberzon, Nallagandla — the pin every "inside / outside" test measures from.
const CYBERZON = { id: 'com_cyberzon', lat: 17.4645, lng: 78.3062 };
// Kondapur and Miyapur: two real places nobody in the seed delivers to.
const KONDAPUR = { lat: 17.4612, lng: 78.3649, locality: 'Kondapur', pincode: '500084' };
const MIYAPUR = { lat: 17.4969, lng: 78.3548, locality: 'Miyapur', pincode: '500049' };
const KOKAPET = { lat: 17.3936, lng: 78.3312, locality: 'Kokapet', pincode: '500075' };

beforeEach(() => {
  _resetDemand();
  _memoryTrail.length = 0;
});
afterEach(async () => {
  vi.restoreAllMocks();
  // Put the seeded pin back, whatever a test did to it.
  await admin('patch', `/communities/${CYBERZON.id}`).send({
    lat: CYBERZON.lat,
    lng: CYBERZON.lng,
    radiusM: 600,
    isActive: true,
  });
});

describe('where a community is', () => {
  it('is sent to the app with every community, so the phone can do the matching itself', async () => {
    const r = await request(app).get('/api/v1/communities');
    const c = r.body.communities.find((x) => x.id === CYBERZON.id);
    expect(c.geo).toEqual({ lat: 17.4645, lng: 78.3062, radiusM: 600 });
    expect(r.body.communities.every((x) => x.geo && typeof x.geo.radiusM === 'number')).toBe(true);
  });

  it('is set by an operator, and the app is served the new pin at once', async () => {
    const r = await admin('patch', `/communities/${CYBERZON.id}`).send({
      lat: 17.4651,
      lng: 78.307,
      radiusM: 900,
    });
    expect(r.status).toBe(200);
    expect(r.body.community).toMatchObject({
      lat: 17.4651,
      lng: 78.307,
      radiusM: 900,
      canSaveLocation: true,
    });
    const pub = await request(app).get('/api/v1/communities');
    expect(pub.body.communities.find((x) => x.id === CYBERZON.id).geo).toEqual({
      lat: 17.4651,
      lng: 78.307,
      radiusM: 900,
    });
    const audit = _memoryTrail.find((a) => a.action === 'COMMUNITY_LOCATION_UPDATED');
    expect(audit.target).toBe(CYBERZON.id);
    expect(audit.details.after).toEqual({ lat: 17.4651, lng: 78.307, radiusM: 900 });
    expect(audit.details.before).toEqual({ lat: 17.4645, lng: 78.3062, radiusM: 600 });
  });

  it('lets the radius be widened without retyping the pin', async () => {
    const r = await admin('patch', `/communities/${CYBERZON.id}`).send({ radiusM: 1500 });
    expect(r.status).toBe(200);
    expect(r.body.community).toMatchObject({ lat: 17.4645, lng: 78.3062, radiusM: 1500 });
  });

  it('can be cleared — and the app then cannot recognise the community by location', async () => {
    const r = await admin('patch', `/communities/${CYBERZON.id}`).send({ geo: null });
    expect(r.status).toBe(200);
    expect(r.body.community.lat).toBeNull();
    const pub = await request(app).get('/api/v1/communities');
    expect(pub.body.communities.find((x) => x.id === CYBERZON.id).geo).toBeNull();
    expect(_memoryTrail.some((a) => a.action === 'COMMUNITY_LOCATION_CLEARED')).toBe(true);

    const c = await customer();
    const out = await check(c, { lat: CYBERZON.lat, lng: CYBERZON.lng });
    expect(out.body.served).toBe(false);
  });

  it('refuses half a pin, a radius with no pin, and values off the map', async () => {
    await admin('patch', `/communities/${CYBERZON.id}`).send({ geo: null });
    const half = await admin('patch', `/communities/${CYBERZON.id}`).send({ lat: 17.46 });
    expect(half.status).toBe(422);
    expect(half.body.error.message).toMatch(/both the latitude and the longitude/);
    const radiusOnly = await admin('patch', `/communities/${CYBERZON.id}`).send({ radiusM: 800 });
    expect(radiusOnly.status).toBe(422);
    expect(radiusOnly.body.error.message).toMatch(/coordinates before the radius/);
    for (const body of [
      { lat: 91, lng: 78 },
      { lat: 17, lng: 181 },
      { lat: 17, lng: 78, radiusM: 50 },
      { lat: 17, lng: 78, radiusM: 5001 },
      { lat: 17, lng: 78, radiusM: 600.5 },
    ])
      expect((await admin('patch', `/communities/${CYBERZON.id}`).send(body)).status).toBe(422);
  });

  it('says exactly what to run when the table is missing, and saves nothing — not even the rest of the request', async () => {
    vi.spyOn(demandDb, 'saveCommunityGeo').mockRejectedValueOnce(noTable('CommunityGeo'));
    const r = await admin('patch', `/communities/${CYBERZON.id}`).send({
      lat: 17.5,
      lng: 78.4,
      area: 'Somewhere else',
    });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('NOT_READY');
    expect(r.body.error.message).toContain('CREATE TABLE IF NOT EXISTS "CommunityGeo"');
    expect(r.body.error.message).toContain(SETUP_SQL.geo);

    const now = await admin('get', '/communities');
    const c = now.body.communities.find((x) => x.id === CYBERZON.id);
    expect(c).toMatchObject({ lat: 17.4645, lng: 78.3062, area: 'Nallagandla' });
    expect(_memoryTrail).toHaveLength(0);
  });

  it('says so, in words, when the database is down', async () => {
    vi.spyOn(demandDb, 'saveCommunityGeo').mockRejectedValueOnce(
      Object.assign(new Error('The database is unreachable.'), { code: 'DB_UNAVAILABLE' }),
    );
    const r = await admin('patch', `/communities/${CYBERZON.id}`).send({ lat: 17.5, lng: 78.4 });
    expect(r.status).toBe(503);
    expect(r.body.error.message).toMatch(/cannot be reached/);
  });

  it('a new community can be created with its location', async () => {
    const r = await admin('post', '/communities').send({
      name: 'Test Meadows',
      area: 'Tellapur',
      blocks: ['A'],
      lat: 17.47,
      lng: 78.28,
    });
    expect(r.status).toBe(201);
    expect(r.body.community).toMatchObject({ lat: 17.47, lng: 78.28, radiusM: 600 });
    expect(r.body.locationNotSaved).toBeUndefined();
  });

  it('a new community is still created when its location cannot be saved — and says so, rather than inviting a second press', async () => {
    vi.spyOn(demandDb, 'saveCommunityGeo').mockRejectedValueOnce(noTable('CommunityGeo'));
    const r = await admin('post', '/communities').send({
      name: 'Test Orchard',
      area: 'Kollur',
      blocks: ['A'],
      lat: 17.48,
      lng: 78.27,
    });
    expect(r.status).toBe(201);
    expect(r.body.community.lat).toBeNull();
    expect(r.body.locationNotSaved).toContain('CREATE TABLE IF NOT EXISTS "CommunityGeo"');
  });
});

describe('use my location', () => {
  it('needs a signed-in customer', async () => {
    const r = await request(app).post('/api/v1/demand/checks').send({ lat: 17.4, lng: 78.3 });
    expect(r.status).toBe(401);
  });

  it('inside a served community: says which, and records nothing', async () => {
    const c = await customer();
    const r = await check(c, { lat: CYBERZON.lat, lng: CYBERZON.lng });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ served: true, communityId: CYBERZON.id });
    const d = await admin('get', '/demand');
    expect(d.body.totals).toEqual({ subscribers: 0, checks: 0, areas: 0 });
  });

  it('measures in metres from the pin: 500 m is in, 700 m is out', async () => {
    const c = await customer();
    // 0.0045° of latitude is 500 m; 0.0063° is 700 m. The radius is 600.
    const north = (deg) => ({ lat: CYBERZON.lat + deg, lng: CYBERZON.lng });
    expect(
      Math.round(haversineM(CYBERZON.lat, CYBERZON.lng, CYBERZON.lat + 0.0045, CYBERZON.lng)),
    ).toBe(500);
    expect((await check(c, north(0.0045))).body.served).toBe(true);
    expect((await check(c, north(0.0063))).body.served).toBe(false);
    // The same 700 m is inside once the operator widens the circle.
    await admin('patch', `/communities/${CYBERZON.id}`).send({ radiusM: 800 });
    expect((await check(c, north(0.0063))).body.served).toBe(true);
  });

  it('a paused community is not somewhere we deliver', async () => {
    await admin('patch', `/communities/${CYBERZON.id}`).send({ isActive: false });
    const c = await customer();
    expect((await check(c, { lat: CYBERZON.lat, lng: CYBERZON.lng })).body.served).toBe(false);
  });

  it('outside: counts the area once per person, by PIN code', async () => {
    const a = await customer();
    const first = await check(a, KONDAPUR);
    expect(first.body).toEqual({
      served: false,
      area: { key: 'pin:500084', label: 'Kondapur · 500084' },
      counted: true,
    });
    // pressing it again is not a second request
    expect((await check(a, KONDAPUR)).body.counted).toBe(true);
    let d = await admin('get', '/demand');
    expect(d.body.areas).toHaveLength(1);
    expect(d.body.areas[0]).toMatchObject({
      key: 'pin:500084',
      checks: 1,
      subscribers: 0,
      last7: 1,
    });

    // someone else in the same PIN is
    const b = await customer();
    await check(b, { ...KONDAPUR, lat: 17.4598, lng: 78.3671 });
    d = await admin('get', '/demand');
    expect(d.body.areas[0].checks).toBe(2);
    expect(d.body.totals).toEqual({ subscribers: 0, checks: 2, areas: 1 });
  });

  it('with no PIN, groups by the kilometre square the point falls in', async () => {
    const c = await customer();
    const r = await check(c, { lat: 17.4612, lng: 78.3649 });
    expect(r.body.area).toEqual({ key: 'g:17.46,78.36', label: 'Near 17.46, 78.36' });
    // a PIN that is not an Indian one is dropped, not refused
    const abroad = await check(await customer(), { lat: 17.4612, lng: 78.3649, pincode: '94043' });
    expect(abroad.status).toBe(200);
    expect(abroad.body.area.key).toBe('g:17.46,78.36');
    // and one written with a space is read
    const spaced = await check(await customer(), { ...KONDAPUR, pincode: '500 084' });
    expect(spaced.body.area.key).toBe('pin:500084');
  });

  it('a PIN-only area takes its name from the first phone that knows it', async () => {
    await check(await customer(), { lat: KONDAPUR.lat, lng: KONDAPUR.lng, pincode: '500084' });
    let d = await admin('get', '/demand');
    expect(d.body.areas[0].label).toBe('500084');
    await check(await customer(), KONDAPUR);
    d = await admin('get', '/demand');
    expect(d.body.areas[0]).toMatchObject({ label: 'Kondapur · 500084', locality: 'Kondapur' });
  });

  it('is anonymous: nothing that identifies the person is stored, and the location is coarse', async () => {
    const save = vi.spyOn(demandDb, 'saveArea');
    const c = await customer('Lakshmi Rao');
    await check(c, KONDAPUR);

    expect(save).toHaveBeenCalledTimes(1);
    const stored = save.mock.calls[0][0];
    const text = JSON.stringify(stored);
    expect(text).not.toContain(c.id);
    expect(text).not.toContain(c.mobile);
    expect(text).not.toContain('Lakshmi');
    expect(Object.keys(stored)).not.toContain('customerId');
    // two decimals — about a kilometre — not the phone's own fix
    expect(stored).toMatchObject({ lat: 17.46, lng: 78.36, checks: 1 });

    const seen = JSON.stringify((await admin('get', '/demand')).body);
    expect(seen).not.toContain(c.id);
    expect(seen).not.toContain(c.mobile);
    const detail = await admin('get', area('pin:500084'));
    expect(detail.body.subscribers).toEqual([]);
  });

  it('never says "counted" when the count could not be stored', async () => {
    vi.spyOn(demandDb, 'saveArea').mockRejectedValueOnce(noTable('DemandArea'));
    const c = await customer();
    const r = await check(c, KONDAPUR);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ served: false, counted: false });
    expect((await admin('get', '/demand')).body.totals.checks).toBe(0);
    // and once it can be stored, the same person IS counted
    expect((await check(c, KONDAPUR)).body.counted).toBe(true);
    expect((await admin('get', '/demand')).body.totals.checks).toBe(1);
  });

  it('refuses a point that is not a location', async () => {
    const c = await customer();
    for (const body of [{ lat: 0, lng: 0 }, { lat: 17.4 }, { lat: '17.4', lng: 78.3 }, {}])
      expect((await check(c, body)).status).toBe(422);
  });
});

describe('tell me when you deliver here', () => {
  it('needs a signed-in customer', async () => {
    expect((await request(app).post('/api/v1/demand/subscriptions').send(KONDAPUR)).status).toBe(
      401,
    );
    expect((await request(app).get('/api/v1/demand/subscriptions')).status).toBe(401);
  });

  it('stores one per person per area, and asking again updates it', async () => {
    const c = await customer('Anita Reddy');
    const first = await subscribe(c, { ...KONDAPUR, communityName: '  Aparna   Serene Park ' });
    expect(first.status).toBe(201);
    expect(Object.keys(first.body.subscription).sort()).toEqual(
      ['areaKey', 'areaLabel', 'communityName', 'createdAt', 'id', 'notifiedAt'].sort(),
    );
    expect(first.body.subscription).toMatchObject({
      areaKey: 'pin:500084',
      areaLabel: 'Kondapur · 500084',
      communityName: 'Aparna Serene Park',
      notifiedAt: null,
    });

    const again = await subscribe(c, { ...KONDAPUR, communityName: 'Aparna Serene Park Phase 2' });
    expect(again.status).toBe(200);
    expect(again.body.subscription.id).toBe(first.body.subscription.id);
    expect(again.body.subscription.createdAt).toBe(first.body.subscription.createdAt);
    expect(again.body.subscription.communityName).toBe('Aparna Serene Park Phase 2');

    const mine = await request(app).get('/api/v1/demand/subscriptions').set(as(c.token));
    expect(mine.body.subscriptions).toHaveLength(1);
    expect((await admin('get', '/demand')).body.totals.subscribers).toBe(1);
  });

  it('keeps the name and number, and a location no closer than a hundred metres', async () => {
    const save = vi.spyOn(demandDb, 'saveSubscription');
    const c = await customer('Anita Reddy');
    await subscribe(c, { lat: 17.461234, lng: 78.364987, pincode: '500084' });
    expect(save.mock.calls[0][0]).toMatchObject({
      customerId: c.id,
      name: 'Anita Reddy',
      mobile: c.mobile,
      lat: 17.461,
      lng: 78.365,
      source: 'location',
    });
  });

  it('works without a location, for someone whose community is not in the list', async () => {
    const c = await customer();
    const byName = await subscribe(c, { communityName: 'My Home Bhooja', source: 'not_listed' });
    expect(byName.status).toBe(201);
    expect(byName.body.subscription.areaKey).toBe('name:my-home-bhooja');
    const byArea = await subscribe(c, {
      locality: 'Tellapur',
      communityName: 'Honer Vivantis',
      source: 'not_listed',
    });
    expect(byArea.body.subscription).toMatchObject({
      areaKey: 'loc:tellapur',
      areaLabel: 'Tellapur',
    });
    expect(areaFor({ locality: 'Tellapur' }).key).toBe('loc:tellapur');
  });

  it('needs something to go on', async () => {
    const c = await customer();
    for (const body of [
      {},
      { lat: 17.4 },
      { lng: 78.3 },
      { lat: 0, lng: 0 },
      { communityName: '  ' },
    ])
      expect((await subscribe(c, body)).status).toBe(422);
    expect((await subscribe(c, { ...KONDAPUR, source: 'elsewhere' })).status).toBe(422);
    expect((await subscribe(c, { ...KONDAPUR, communityName: 'x'.repeat(81) })).status).toBe(422);
  });

  it('shows a customer only their own, and lets them remove only their own', async () => {
    const a = await customer();
    const b = await customer();
    const sub = (await subscribe(a, KONDAPUR)).body.subscription;
    await subscribe(b, MIYAPUR);

    const mine = await request(app).get('/api/v1/demand/subscriptions').set(as(b.token));
    expect(mine.body.subscriptions.map((s) => s.areaKey)).toEqual(['pin:500049']);

    const theirs = await request(app)
      .delete(`/api/v1/demand/subscriptions/${sub.id}`)
      .set(as(b.token));
    expect(theirs.status).toBe(404);
    const own = await request(app)
      .delete(`/api/v1/demand/subscriptions/${sub.id}`)
      .set(as(a.token));
    expect(own.status).toBe(204);
    const after = await request(app).get('/api/v1/demand/subscriptions').set(as(a.token));
    expect(after.body.subscriptions).toEqual([]);
    // gone means gone: a second delete is a 404, not a 500
    const twice = await request(app)
      .delete(`/api/v1/demand/subscriptions/${sub.id}`)
      .set(as(a.token));
    expect(twice.status).toBe(404);
  });

  it('caps how many areas one person can follow', async () => {
    const c = await customer();
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i += 1)
      expect((await subscribe(c, { pincode: String(500100 + i) })).status).toBe(201);
    const over = await subscribe(c, { pincode: '500199' });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('TOO_MANY');
    // updating one they already have is still allowed
    expect((await subscribe(c, { pincode: '500100', communityName: 'Still here' })).status).toBe(
      200,
    );
  });

  it('tells the customer plainly when it could not be saved — and never shows them SQL', async () => {
    vi.spyOn(demandDb, 'saveSubscription').mockRejectedValueOnce(noTable('DemandSubscription'));
    const c = await customer();
    const r = await subscribe(c, KONDAPUR);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('NOT_READY');
    expect(r.body.error.message).not.toMatch(/CREATE TABLE|DemandSubscription|database/i);
    const mine = await request(app).get('/api/v1/demand/subscriptions').set(as(c.token));
    expect(mine.body.subscriptions).toEqual([]);
    expect((await admin('get', '/demand')).body.totals.subscribers).toBe(0);
  });

  it('is erased with the account', async () => {
    const erase = vi.spyOn(demandDb, 'deleteSubscriptionsForCustomer');
    const c = await customer('Going Away');
    await subscribe(c, KONDAPUR);
    await subscribe(c, MIYAPUR);
    expect((await admin('get', '/demand')).body.totals.subscribers).toBe(2);

    const del = await request(app).delete('/api/v1/me').set(as(c.token));
    expect(del.status).toBe(200);
    expect(erase).toHaveBeenCalledWith(c.id);
    const d = await admin('get', '/demand');
    expect(d.body.totals.subscribers).toBe(0);
    expect(JSON.stringify((await admin('get', area('pin:500084'))).body)).not.toContain(c.mobile);
  });

  it('a failure to erase them does not strand the rest of the account deletion', async () => {
    vi.spyOn(demandDb, 'deleteSubscriptionsForCustomer').mockRejectedValueOnce(
      new Error('connection reset'),
    );
    const c = await customer();
    await subscribe(c, KONDAPUR);
    const del = await request(app).delete('/api/v1/me').set(as(c.token));
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/v1/me').set(as(c.token))).status).toBe(401);
    // out of memory regardless, so the operator's list stops showing them at once
    expect((await admin('get', '/demand')).body.totals.subscribers).toBe(0);
  });
});

describe('the operator’s view: where to deliver next', () => {
  it('ranks by people waiting, then by anonymous checks', async () => {
    // Kondapur: 2 waiting. Miyapur: 1 waiting, 3 checks. Kokapet: nobody waiting, 4 checks.
    await subscribe(await customer(), KONDAPUR);
    await subscribe(await customer(), KONDAPUR);
    await subscribe(await customer(), MIYAPUR);
    for (let i = 0; i < 3; i += 1) await check(await customer(), MIYAPUR);
    for (let i = 0; i < 4; i += 1) await check(await customer(), KOKAPET);
    // a second area with one person waiting but no checks: ranks below Miyapur
    await subscribe(await customer(), { pincode: '500032', locality: 'Gachibowli' });

    const r = await admin('get', '/demand');
    expect(r.status).toBe(200);
    expect(r.body.ready).toBe(true);
    expect(r.body.setupSql).toBeUndefined();
    expect(r.body.areas.map((a) => a.key)).toEqual([
      'pin:500084',
      'pin:500049',
      'pin:500032',
      'pin:500075',
    ]);
    expect(r.body.areas.map((a) => [a.subscribers, a.checks])).toEqual([
      [2, 0],
      [1, 3],
      [1, 0],
      [0, 4],
    ]);
    expect(r.body.totals).toEqual({ subscribers: 4, checks: 7, areas: 4 });
  });

  it('describes each area: what was asked for, how far it is from where we already go', async () => {
    await subscribe(await customer(), { ...KONDAPUR, communityName: 'Aparna Serene Park' });
    await subscribe(await customer(), { ...KONDAPUR, communityName: 'aparna serene park' });
    await subscribe(await customer(), { ...KONDAPUR, communityName: 'SMR Vinay Iconia' });
    await check(await customer(), KONDAPUR);

    const a = (await admin('get', '/demand')).body.areas[0];
    expect(a).toMatchObject({
      key: 'pin:500084',
      label: 'Kondapur · 500084',
      pincode: '500084',
      locality: 'Kondapur',
      lat: 17.46,
      lng: 78.36,
      subscribers: 3,
      checks: 1,
      last7: 4,
      status: 'OPEN',
      note: null,
      notifiedAt: null,
    });
    // "aparna serene park" twice, however it was typed
    expect(a.communities).toEqual([
      { name: 'Aparna Serene Park', count: 2 },
      { name: 'SMR Vinay Iconia', count: 1 },
    ]);
    // Prestige High Fields, Gachibowli is the nearest seeded community to Kondapur
    expect(a.nearest.communityId).toBe('com_highfields');
    expect(a.nearest.name).toBe('Prestige High Fields');
    expect(a.nearest.distanceKm).toBeGreaterThan(3);
    expect(a.nearest.distanceKm).toBeLessThan(5);
    expect(Date.parse(a.firstAt)).toBeLessThanOrEqual(Date.parse(a.lastAt));
  });

  it('lists who is waiting, with the number to call', async () => {
    const c = await customer('Anita Reddy');
    await subscribe(c, { ...KONDAPUR, communityName: 'Aparna Serene Park' });
    const r = await admin('get', area('pin:500084'));
    expect(r.status).toBe(200);
    expect(r.body.area.key).toBe('pin:500084');
    expect(r.body.subscribers).toHaveLength(1);
    expect(r.body.subscribers[0]).toMatchObject({
      name: 'Anita Reddy',
      mobile: c.mobile,
      communityName: 'Aparna Serene Park',
      source: 'location',
      notifiedAt: null,
    });
    expect((await admin('get', area('pin:999999'))).status).toBe(404);
  });

  it('keeps the operator’s status and note, and records who changed them', async () => {
    await check(await customer(), KONDAPUR);
    const r = await admin('patch', area('pin:500084')).send({
      status: 'PLANNED',
      note: '  Spoke to the association;   starting in January. ',
    });
    expect(r.status).toBe(200);
    expect(r.body.area).toMatchObject({
      status: 'PLANNED',
      note: 'Spoke to the association; starting in January.',
    });
    expect((await admin('get', '/demand')).body.areas[0].status).toBe('PLANNED');
    const audit = _memoryTrail.find((a) => a.action === 'DEMAND_AREA_UPDATED');
    expect(audit.target).toBe('pin:500084');
    expect(audit.details.before.status).toBe('OPEN');
    expect(audit.details.after.status).toBe('PLANNED');

    expect((await admin('patch', area('pin:500084')).send({ status: 'MAYBE' })).status).toBe(422);
    expect((await admin('patch', area('pin:500084')).send({})).status).toBe(422);
    expect((await admin('patch', area('pin:500084')).send({ note: 'x'.repeat(301) })).status).toBe(
      422,
    );
    expect((await admin('patch', area('pin:000000')).send({ status: 'OPEN' })).status).toBe(404);
  });

  it('says what to run when the tables are missing', async () => {
    await check(await customer(), KONDAPUR);
    vi.spyOn(demandDb, 'saveArea').mockRejectedValueOnce(noTable('DemandArea'));
    const r = await admin('patch', area('pin:500084')).send({ status: 'PLANNED' });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('NOT_READY');
    expect(r.body.error.message).toContain('CREATE TABLE IF NOT EXISTS "DemandArea"');
    expect(r.body.error.message).toContain('CREATE TABLE IF NOT EXISTS "DemandSubscription"');
    expect(_memoryTrail).toHaveLength(0);
  });
});

describe('telling the people who asked', () => {
  const feed = async (c) =>
    (await request(app).get('/api/v1/notifications').set(as(c.token))).body.notifications;

  it('tells each of them once, in the app, and names the community', async () => {
    const a = await customer('First Asker');
    const b = await customer('Second Asker');
    const elsewhere = await customer();
    await subscribe(a, KONDAPUR);
    await subscribe(b, KONDAPUR);
    await subscribe(elsewhere, MIYAPUR);

    const r = await admin('post', `${area('pin:500084')}/notify`).send({
      communityId: 'com_highfields',
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ notified: 2 });

    for (const c of [a, b]) {
      const items = (await feed(c)).filter((x) => x.type === 'AREA_LAUNCHED');
      expect(items).toHaveLength(1);
      expect(items[0].body).toBe(
        'We now deliver to Prestige High Fields. Open the app to add your address.',
      );
      expect(items[0].data).toMatchObject({ areaKey: 'pin:500084', communityId: 'com_highfields' });
    }
    // someone waiting on a different area hears nothing
    expect((await feed(elsewhere)).filter((x) => x.type === 'AREA_LAUNCHED')).toEqual([]);

    const detail = await admin('get', area('pin:500084'));
    expect(detail.body.subscribers.every((s) => s.notifiedAt)).toBe(true);
    expect(detail.body.area.notifiedAt).toBeTruthy();
    const audit = _memoryTrail.find((x) => x.action === 'DEMAND_AREA_NOTIFIED');
    expect(audit.details).toMatchObject({ subscribers: 2, communityId: 'com_highfields' });

    // pressing it again tells nobody twice
    const again = await admin('post', `${area('pin:500084')}/notify`).send({});
    expect(again.body).toEqual({ notified: 0 });
    expect((await feed(a)).filter((x) => x.type === 'AREA_LAUNCHED')).toHaveLength(1);
    expect(_memoryTrail.filter((x) => x.action === 'DEMAND_AREA_NOTIFIED')).toHaveLength(1);
  });

  it('someone who asks afterwards is the only one told next time', async () => {
    const early = await customer();
    await subscribe(early, KONDAPUR);
    await admin('post', `${area('pin:500084')}/notify`).send({});
    const late = await customer();
    await subscribe(late, KONDAPUR);
    const r = await admin('post', `${area('pin:500084')}/notify`).send({});
    expect(r.body).toEqual({ notified: 1 });
    expect((await feed(early)).filter((x) => x.type === 'AREA_LAUNCHED')).toHaveLength(1);
    expect((await feed(late)).filter((x) => x.type === 'AREA_LAUNCHED')).toHaveLength(1);
  });

  it('uses the area’s own name when no community is given, and the operator’s words when they write some', async () => {
    const a = await customer();
    await subscribe(a, KONDAPUR);
    await admin('post', `${area('pin:500084')}/notify`).send({});
    expect((await feed(a))[0].body).toBe(
      'We now deliver to Kondapur. Open the app to add your address.',
    );

    const b = await customer();
    await subscribe(b, MIYAPUR);
    await admin('post', `${area('pin:500049')}/notify`).send({
      message: 'We start in Miyapur on 1 December.',
    });
    const item = (await feed(b))[0];
    expect(item.body).toBe('We start in Miyapur on 1 December.');
    expect(item.title).toBe('An update for your area');
  });

  it('sends nothing if it cannot first record who is being told', async () => {
    const a = await customer();
    await subscribe(a, KONDAPUR);
    vi.spyOn(demandDb, 'saveSubscription').mockRejectedValueOnce(noTable('DemandSubscription'));
    const r = await admin('post', `${area('pin:500084')}/notify`).send({});
    expect(r.status).toBe(503);
    expect((await feed(a)).filter((x) => x.type === 'AREA_LAUNCHED')).toEqual([]);
    // and the retry tells them — once
    expect((await admin('post', `${area('pin:500084')}/notify`).send({})).body).toEqual({
      notified: 1,
    });
    expect((await feed(a)).filter((x) => x.type === 'AREA_LAUNCHED')).toHaveLength(1);
  });

  it('refuses a community that does not exist, an empty or over-long message, an unknown area', async () => {
    await subscribe(await customer(), KONDAPUR);
    const to = (body) => admin('post', `${area('pin:500084')}/notify`).send(body);
    expect((await to({ communityId: 'com_nope' })).status).toBe(422);
    expect((await to({ message: '   ' })).status).toBe(422);
    expect((await to({ message: 'x'.repeat(241) })).status).toBe(422);
    expect((await admin('post', `${area('pin:000000')}/notify`).send({})).status).toBe(404);
  });
});

describe('who may see it', () => {
  it('is for roles that manage communities — not delivery, not purchasing', () => {
    for (const [path, method] of [
      ['/demand', 'GET'],
      ['/demand/pin:500084', 'GET'],
      ['/demand/pin:500084', 'PATCH'],
      ['/demand/pin:500084/notify', 'POST'],
      ['/Demand/', 'GET'],
    ]) {
      expect(roleMayAccess('SUPER_ADMIN', path, method)).toBe(true);
      expect(roleMayAccess('ADMIN', path, method)).toBe(true);
      expect(roleMayAccess('FULFILMENT', path, method)).toBe(false);
      expect(roleMayAccess('PROCUREMENT', path, method)).toBe(false);
    }
  });

  it('is enforced on the live routes', async () => {
    await subscribe(await customer('Private Person'), KONDAPUR);

    expect((await request(app).get('/api/v1/admin/demand')).status).toBe(401);
    const shopper = await customer();
    expect((await request(app).get('/api/v1/admin/demand').set(as(shopper.token))).status).toBe(
      401,
    );

    const driver = await customer();
    const grant = await admin('post', '/access').send({
      mobile: driver.mobile,
      role: 'FULFILMENT',
      name: 'Driver',
    });
    expect(grant.status).toBe(201);
    for (const [method, path] of [
      ['get', '/demand'],
      ['get', area('pin:500084')],
      ['patch', area('pin:500084')],
      ['post', `${area('pin:500084')}/notify`],
    ]) {
      const r = await request(app)[method](`/api/v1/admin${path}`).set(as(driver.token)).send({});
      expect(r.status).toBe(403);
    }
    // a driver cannot move a community's pin either
    const move = await request(app)
      .patch(`/api/v1/admin/communities/${CYBERZON.id}`)
      .set(as(driver.token))
      .send({ lat: 17.5, lng: 78.4 });
    expect(move.status).toBe(403);

    const manager = await customer();
    await admin('post', '/access').send({ mobile: manager.mobile, role: 'ADMIN', name: 'Manager' });
    const ok = await request(app).get('/api/v1/admin/demand').set(as(manager.token));
    expect(ok.status).toBe(200);
    expect(ok.body.totals.subscribers).toBe(1);
  });
});

describe('opening the people waiting in an area', () => {
  it('is written to the audit trail, and an area with nobody in it is not', async () => {
    const who = await customer('Audit Reader');
    expect(
      (
        await subscribe(who, {
          locality: 'Audit Nagar',
          pincode: '500091',
          communityName: 'Trail View',
        })
      ).status,
    ).toBe(201);
    const before = _memoryTrail.length;
    const r = await admin('get', area('pin:500091'));
    expect(r.status).toBe(200);
    expect(r.body.subscribers).toHaveLength(1);
    expect(_memoryTrail.length).toBe(before + 1);
    const row = _memoryTrail[_memoryTrail.length - 1];
    expect(row).toMatchObject({
      action: 'DEMAND_SUBSCRIBERS_VIEWED',
      target: 'pin:500091',
      details: { subscribers: 1 },
    });
    // The trail says that it was opened and by whom — it does not become a copy of the list.
    expect(JSON.stringify(row)).not.toContain(who.mobile);

    // Anonymous checks only: there is nobody's number to have seen, so nothing is recorded.
    const passerBy = await customer('Passing By');
    await check(passerBy, { lat: 17.6, lng: 78.6, locality: 'Nobody Waiting', pincode: '500092' });
    const quiet = _memoryTrail.length;
    const empty = await admin('get', area('pin:500092'));
    expect(empty.status).toBe(200);
    expect(empty.body.subscribers).toEqual([]);
    expect(_memoryTrail.length).toBe(quiet);
  });
});
