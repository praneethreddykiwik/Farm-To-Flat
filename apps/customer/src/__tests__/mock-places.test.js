import { beforeEach, describe, expect, it } from 'vitest';
import { handlePlaces, mockGeo, resetMockPlaces } from '../api/mock/places';
import { matchCommunity } from '../lib/geo';

/**
 * The mock for editing/removing an address and for "come and deliver here". The screens are built
 * against it, so it is held to the real API's shapes and to the two rules the screens rely on.
 */
const communities = [
  {
    id: 'com_a',
    name: 'Aparna Cyberzon',
    area: 'Nallagandla',
    lat: 17.4645,
    lng: 78.3062,
    blocks: ['Tower A', 'Tower B'],
  },
  {
    id: 'com_b',
    name: 'My Home Avatar',
    area: 'Narsingi',
    lat: 17.3982,
    lng: 78.3634,
    blocks: ['Block 1'],
  },
];
const address = (over = {}) => ({
  id: 'adr_1',
  communityId: 'com_a',
  communityName: 'Aparna Cyberzon',
  area: 'Nallagandla',
  block: 'Tower A',
  flat: '1204',
  floor: '12',
  landmark: null,
  recipientName: 'Asha',
  contactNumber: '9848012345',
  isDefault: true,
  ...over,
});
let ctx;
const call = (method, p, body) => handlePlaces(method, p, body, ctx);

beforeEach(() => {
  resetMockPlaces();
  ctx = { addresses: [address()], customer: { name: 'Asha', mobile: '9848012345' }, communities };
});

describe('mock: routes that are not ours', () => {
  it('are left for the rest of the mock server', () => {
    expect(call('GET', '/catalog')).toBeNull();
    expect(call('POST', '/addresses', {})).toBeNull();
    expect(call('POST', '/addresses/adr_1/default', {})).toBeNull();
  });
});

describe('mock: editing an address', () => {
  it('changes what was sent and keeps the rest', () => {
    const r = call('PATCH', '/addresses/adr_1', {
      flat: '1402',
      floor: '0',
      landmark: 'By the lift',
    });
    expect(r.status).toBe(200);
    expect(r.body.address).toMatchObject({
      flat: '1402',
      floor: '0',
      landmark: 'By the lift',
      block: 'Tower A',
    });
    expect(ctx.addresses[0].flat).toBe('1402');
  });

  it('moves community and refreshes its name', () => {
    const r = call('PATCH', '/addresses/adr_1', { communityId: 'com_b', block: 'Block 1' });
    expect(r.body.address).toMatchObject({
      communityName: 'My Home Avatar',
      area: 'Narsingi',
      block: 'Block 1',
    });
  });

  it('refuses a block the community does not have, and an address that is not there', () => {
    expect(call('PATCH', '/addresses/adr_1', { block: 'Tower Z' }).status).toBe(422);
    expect(call('PATCH', '/addresses/nope', { flat: '1' }).status).toBe(404);
  });
});

describe('mock: removing an address', () => {
  it('will not remove the only one', () => {
    const r = call('DELETE', '/addresses/adr_1');
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LAST_ADDRESS');
    expect(ctx.addresses).toHaveLength(1);
  });

  it('hands the default on when the default goes', () => {
    ctx.addresses.push(address({ id: 'adr_2', flat: '305', isDefault: false }));
    const r = call('DELETE', '/addresses/adr_1');
    expect(r.status).toBe(200);
    expect(r.body.addresses).toHaveLength(1);
    expect(r.body.addresses[0]).toMatchObject({ id: 'adr_2', isDefault: true });
  });
});

describe('mock: come and deliver here', () => {
  it('gives every mock community coordinates the on-phone check can use', () => {
    const withGeo = communities.map((c) => ({ ...c, geo: mockGeo(c) }));
    expect(matchCommunity(withGeo, { lat: 17.4645, lng: 78.3062 }).hit.id).toBe('com_a');
    expect(mockGeo({ id: 'x' })).toBeNull();
  });

  it('says "served" inside a community and counts nothing', () => {
    const r = call('POST', '/demand/checks', { lat: 17.4646, lng: 78.3063 });
    expect(r.body).toEqual({ served: true, communityId: 'com_a' });
  });

  it('names the area outside every community, by PIN when there is one', () => {
    const r = call('POST', '/demand/checks', {
      lat: 17.46,
      lng: 78.36,
      locality: 'Kondapur',
      pincode: '500084',
    });
    expect(r.body.served).toBe(false);
    expect(r.body.counted).toBe(true);
    expect(r.body.area).toEqual({ key: 'pin:500084', label: 'Kondapur · 500084' });
  });

  it('subscribes once per area, lists it, and lets it be removed', () => {
    const where = { lat: 17.46, lng: 78.36, locality: 'Kondapur', pincode: '500084' };
    const first = call('POST', '/demand/subscriptions', { ...where, source: 'location' });
    expect(first.status).toBe(201);
    expect(first.body.subscription).toMatchObject({
      areaKey: 'pin:500084',
      areaLabel: 'Kondapur · 500084',
    });

    const again = call('POST', '/demand/subscriptions', {
      ...where,
      communityName: 'Lakeview Residency',
    });
    expect(again.status).toBe(200);
    expect(again.body.subscription.id).toBe(first.body.subscription.id);
    expect(again.body.subscription.communityName).toBe('Lakeview Residency');

    expect(call('GET', '/demand/subscriptions').body.subscriptions).toHaveLength(1);
    expect(call('DELETE', `/demand/subscriptions/${first.body.subscription.id}`).status).toBe(204);
    expect(call('GET', '/demand/subscriptions').body.subscriptions).toEqual([]);
    expect(call('DELETE', `/demand/subscriptions/${first.body.subscription.id}`).status).toBe(404);
  });

  it('takes a request with no location at all, and refuses one with nothing in it', () => {
    const r = call('POST', '/demand/subscriptions', {
      communityName: 'Lakeview Residency',
      locality: 'Kondapur',
      source: 'not_listed',
    });
    expect(r.status).toBe(201);
    expect(r.body.subscription.areaLabel).toBe('Kondapur');
    expect(call('POST', '/demand/subscriptions', {}).status).toBe(422);
  });
});
