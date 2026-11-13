/**
 * A working stand-in for the address-editing and "come and deliver here" routes, so both can be
 * exercised against mocks. It keeps the real API's SHAPES and its two rules that the screens depend
 * on — the last address cannot be removed, and removing the default hands it on — and none of its
 * storage. The rules that matter are tested where they live: apps/api/test/address-edit.test.js and
 * apps/api/test/demand.test.js.
 */
import { distanceM } from '../../lib/geo';

/** @type {any[]} */
let SUBSCRIPTIONS = [];
let seq = 1;
/** Area keys already counted this session — the mock's version of the server's dedupe. */
let counted = new Set();

export function resetMockPlaces() {
  SUBSCRIPTIONS = [];
  seq = 1;
  counted = new Set();
}

const json = (b, status = 200) => ({ status, body: JSON.parse(JSON.stringify(b)) });
const bad = (status, code, message) => ({ status, body: { error: { code, message } } });

/** The radius every mock community is given. Real ones are set per community in the admin console. */
export const MOCK_RADIUS_M = 600;

/** What GET /communities adds for the on-phone location match. */
export const mockGeo = (c) =>
  typeof c.lat === 'number' && typeof c.lng === 'number'
    ? { lat: c.lat, lng: c.lng, radiusM: MOCK_RADIUS_M }
    : null;

/** PIN first, else the 2-decimal grid cell — the same clustering the server uses. */
function areaOf({ lat, lng, locality, city, pincode, communityName }) {
  const name = locality || city;
  if (pincode) return { key: `pin:${pincode}`, label: [name, pincode].filter(Boolean).join(' · ') };
  if (typeof lat === 'number' && typeof lng === 'number') {
    const cell = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    return { key: `g:${cell}`, label: name || `Near ${cell.replace(',', ', ')}` };
  }
  const text = (name || communityName || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { key: `t:${text}`, label: name || communityName || 'Your area' };
}

/**
 * @param {string} method
 * @param {string} p
 * @param {any} body
 * @param {{ addresses: any[], customer: any, communities: any[] }} ctx  `addresses` is mutated in place
 * @returns {{ status: number, body: any } | null}  null = not one of ours
 */
export function handlePlaces(method, p, body, ctx) {
  // ── editing / removing a saved address ──────────────────────────────────────
  const one = p.match(/^\/addresses\/([^/]+)$/);
  if (one && method === 'PATCH') {
    const address = ctx.addresses.find((a) => a.id === one[1]);
    if (!address) return bad(404, 'NOT_FOUND', 'That address is not on your account.');
    const patch = body || {};
    const community = ctx.communities.find(
      (c) => c.id === (patch.communityId ?? address.communityId),
    );
    if (!community) return bad(422, 'VALIDATION', 'Choose your community.');
    const block = patch.block ?? address.block;
    if (!community.blocks.includes(block))
      return bad(422, 'VALIDATION', 'Choose your block from the list.');
    Object.assign(address, {
      communityId: community.id,
      communityName: community.name,
      area: community.area,
      block,
    });
    if (patch.flat !== undefined) address.flat = String(patch.flat).trim();
    if (patch.floor !== undefined) address.floor = patch.floor || null;
    if (patch.landmark !== undefined) address.landmark = patch.landmark || null;
    if (patch.recipientName !== undefined) address.recipientName = patch.recipientName;
    if (patch.contactNumber !== undefined) address.contactNumber = patch.contactNumber;
    return json({ address, addresses: ctx.addresses });
  }
  if (one && method === 'DELETE') {
    const i = ctx.addresses.findIndex((a) => a.id === one[1]);
    if (i < 0) return bad(404, 'NOT_FOUND', 'That address is not on your account.');
    if (ctx.addresses.length === 1)
      return bad(
        409,
        'LAST_ADDRESS',
        'This is your only address. Add another one before removing it.',
      );
    const [removed] = ctx.addresses.splice(i, 1);
    if (removed.isDefault) ctx.addresses[0].isDefault = true;
    return json({ addresses: ctx.addresses });
  }

  // ── "come and deliver here" ─────────────────────────────────────────────────
  if (!p.startsWith('/demand')) return null;

  if (method === 'POST' && p === '/demand/checks') {
    const { lat, lng } = body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number')
      return bad(422, 'VALIDATION', 'A location is needed.');
    const inside = ctx.communities.find(
      (c) => mockGeo(c) && distanceM({ lat, lng }, mockGeo(c)) <= MOCK_RADIUS_M,
    );
    if (inside) return json({ served: true, communityId: inside.id });
    const area = areaOf(body);
    counted.add(area.key);
    // `counted` is false on the real API when the count could not be stored.
    return json({ served: false, counted: true, area });
  }

  if (method === 'GET' && p === '/demand/subscriptions')
    return json({ subscriptions: SUBSCRIPTIONS });

  if (method === 'POST' && p === '/demand/subscriptions') {
    const b = body || {};
    const hasPoint = typeof b.lat === 'number' && typeof b.lng === 'number';
    if (!hasPoint && !b.pincode && !b.locality && !b.communityName)
      return bad(422, 'VALIDATION', 'Tell us where: an area or your community name.');
    const area = areaOf(b);
    const existing = SUBSCRIPTIONS.find((s) => s.areaKey === area.key);
    if (existing) {
      if (b.communityName) existing.communityName = b.communityName;
      return json({ subscription: existing });
    }
    const subscription = {
      id: `dsub_${seq++}`,
      areaKey: area.key,
      areaLabel: area.label,
      communityName: b.communityName || null,
      createdAt: new Date().toISOString(),
    };
    SUBSCRIPTIONS.unshift(subscription);
    return json({ subscription }, 201);
  }

  const sub = p.match(/^\/demand\/subscriptions\/([^/]+)$/);
  if (sub && method === 'DELETE') {
    const before = SUBSCRIPTIONS.length;
    SUBSCRIPTIONS = SUBSCRIPTIONS.filter((s) => s.id !== sub[1]);
    if (SUBSCRIPTIONS.length === before)
      return bad(404, 'NOT_FOUND', 'That request is not on your account.');
    return { status: 204, body: null };
  }

  return bad(404, 'NOT_FOUND', 'No such route');
}
