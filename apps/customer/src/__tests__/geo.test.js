import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RADIUS_M,
  distanceLabel,
  distanceM,
  matchCommunity,
  placeFromGeocode,
  placeLabel,
} from '../lib/geo';

// Two real-ish gates in West Hyderabad, ~6.9 km apart.
const CYBERZON = { lat: 17.4645, lng: 78.3062 };
const AVATAR = { lat: 17.3982, lng: 78.3634 };

const communities = [
  { id: 'a', name: 'Aparna Cyberzon', geo: { ...CYBERZON, radiusM: 500 } },
  { id: 'b', name: 'My Home Avatar', geo: { ...AVATAR, radiusM: 400 } },
  { id: 'c', name: 'No coordinates yet', geo: null },
];

/** Move `m` metres north of a point. */
const north = (p, m) => ({ lat: p.lat + m / 111320, lng: p.lng });

describe('distanceM', () => {
  it('is zero for the same point and symmetric', () => {
    expect(distanceM(CYBERZON, CYBERZON)).toBe(0);
    expect(distanceM(CYBERZON, AVATAR)).toBeCloseTo(distanceM(AVATAR, CYBERZON), 6);
  });

  it('measures metres, not degrees', () => {
    expect(distanceM(CYBERZON, north(CYBERZON, 250))).toBeGreaterThan(245);
    expect(distanceM(CYBERZON, north(CYBERZON, 250))).toBeLessThan(255);
    // A degree of longitude is shorter than a degree of latitude here; treating them alike is the
    // error the old degree-hypot check made.
    const east = { lat: CYBERZON.lat, lng: CYBERZON.lng + 0.01 };
    const up = { lat: CYBERZON.lat + 0.01, lng: CYBERZON.lng };
    expect(distanceM(CYBERZON, east)).toBeLessThan(distanceM(CYBERZON, up) * 0.97);
  });
});

describe('matchCommunity', () => {
  it('recognises a point inside a community', () => {
    const r = matchCommunity(communities, north(CYBERZON, 300));
    expect(r.hit?.id).toBe('a');
    expect(r.nearest.community.id).toBe('a');
    expect(r.located).toBe(2);
  });

  it('says no outside every radius, and still names the nearest', () => {
    const r = matchCommunity(communities, north(CYBERZON, 1800));
    expect(r.hit).toBe(null);
    expect(r.nearest.community.id).toBe('a');
    expect(r.nearest.distanceM).toBeGreaterThan(1700);
  });

  it('gives a vague GPS fix the benefit of its own uncertainty, within reason', () => {
    const justOutside = north(CYBERZON, 560);
    expect(matchCommunity(communities, justOutside).hit).toBe(null);
    expect(matchCommunity(communities, justOutside, { accuracyM: 80 }).hit?.id).toBe('a');
    // …but a fix that claims ±5 km does not get to match a community 1.8 km away.
    expect(matchCommunity(communities, north(CYBERZON, 1800), { accuracyM: 5000 }).hit).toBe(null);
  });

  it('picks the nearer one when two radii overlap', () => {
    const overlapping = [
      { id: 'far', geo: { ...CYBERZON, radiusM: 2000 } },
      { id: 'near', geo: { ...north(CYBERZON, 400), radiusM: 2000 } },
    ];
    expect(matchCommunity(overlapping, north(CYBERZON, 350)).hit.id).toBe('near');
  });

  it('uses the default radius when only coordinates were set', () => {
    const bare = [{ id: 'x', geo: { ...CYBERZON } }];
    expect(matchCommunity(bare, north(CYBERZON, DEFAULT_RADIUS_M - 50)).hit?.id).toBe('x');
    expect(matchCommunity(bare, north(CYBERZON, DEFAULT_RADIUS_M + 100)).hit).toBe(null);
  });

  it('cannot say anything when no community has coordinates — and reports that', () => {
    const r = matchCommunity([{ id: 'c', geo: null }, { id: 'd' }], CYBERZON);
    expect(r).toEqual({ hit: null, nearest: null, located: 0 });
  });

  it('ignores nonsense coordinates rather than matching on them', () => {
    expect(matchCommunity(communities, { lat: NaN, lng: 78 }).hit).toBe(null);
    expect(matchCommunity(communities, null).located).toBe(0);
    const bad = [{ id: 'z', geo: { lat: 'x', lng: 78.3, radiusM: 99999999 } }];
    expect(matchCommunity(bad, CYBERZON)).toEqual({ hit: null, nearest: null, located: 0 });
  });
});

describe('distanceLabel', () => {
  it('reads the way a person would say it', () => {
    expect(distanceLabel(20)).toBe('50 m');
    expect(distanceLabel(420)).toBe('400 m');
    expect(distanceLabel(3180)).toBe('3.2 km');
    expect(distanceLabel(14200)).toBe('14 km');
    expect(distanceLabel(NaN)).toBe('');
  });
});

describe('placeFromGeocode', () => {
  it('takes the neighbourhood, the city and a six-digit PIN', () => {
    const p = placeFromGeocode({
      district: 'Kondapur',
      city: 'Hyderabad',
      region: 'Telangana',
      postalCode: '500084',
    });
    expect(p).toEqual({ locality: 'Kondapur', city: 'Hyderabad', pincode: '500084' });
    expect(placeLabel(p)).toBe('Kondapur · 500084');
  });

  it('falls back through the fields iOS fills instead', () => {
    const p = placeFromGeocode({ subregion: 'Serilingampally', city: 'Hyderabad' });
    expect(p.locality).toBe('Serilingampally');
    expect(placeLabel(p)).toBe('Serilingampally');
  });

  it('drops a PIN that is not one, and a "locality" that is only a code', () => {
    const p = placeFromGeocode({ name: '7J9WF8Q2+XM', city: 'Hyderabad', postalCode: '5000' });
    expect(p).toEqual({ city: 'Hyderabad' });
    expect(placeLabel(p)).toBe('Hyderabad');
  });

  it('has nothing to say about nothing', () => {
    expect(placeFromGeocode(null)).toEqual({});
    expect(placeLabel({})).toBe(null);
  });
});
