/**
 * Reviews published about us elsewhere, in one place in the admin (strategy discussion,
 * 22 Nov 2026): the Apple App Store and Google Play fetched automatically, anything else typed in.
 *
 *   Apple   App Store Connect API, customerReviews. Needs ASC_ISSUER_ID, ASC_KEY_ID and
 *           ASC_PRIVATE_KEY (the .p8 text) from a key that may read reviews.
 *   Google  Android Publisher API, reviews.list. Needs GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (the key
 *           file's text) for a service account allowed to reply to reviews. Google returns only
 *           reviews with words from the last seven days, so each is saved when it is seen; star-only
 *           ratings and anything older are not available to us.
 *
 * Without its keys a store is simply "not connected": nothing is called and nothing fails. Read
 * only: replies are written in App Store Connect and Play Console. Keys and tokens are never logged.
 */
import { createPrivateKey, createSign, sign } from 'node:crypto';
import { getOps, listOps, putOps, putOpsSoft, removeOps } from '../ops-store.js';
import { id as newId } from './ids.js';
import { isLeader } from './leader.js';
import { reportError } from './sentry.js';

export const APPLE_APP_ID = process.env.ASC_APP_ID || '6837415422';
export const PLAY_PACKAGE = 'in.fooducia.customer';
export const STORE_LABELS = {
  apple: 'App Store',
  google: 'Google Play',
  maps: 'Google Maps',
  social: 'Social media',
  other: 'Somewhere else',
};
export const MANUAL_STORES = ['maps', 'social', 'other'];
const TIMEOUT_MS = 8000;
const MAX_PAGES = 5;
const ASC = 'https://api.appstoreconnect.apple.com';

const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
/** A key pasted into an environment variable often keeps its line breaks as the two letters \n. */
const pem = (s) => String(s || '').replace(/\\n/g, '\n');

export function storeConfig(env = process.env) {
  let google = null;
  try {
    const j = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || 'null');
    if (j?.client_email && j?.private_key)
      google = { email: j.client_email, key: pem(j.private_key) };
  } catch {
    google = null; // unreadable: shown as not connected
  }
  const apple =
    env.ASC_ISSUER_ID && env.ASC_KEY_ID && env.ASC_PRIVATE_KEY
      ? { issuer: env.ASC_ISSUER_ID, keyId: env.ASC_KEY_ID, key: pem(env.ASC_PRIVATE_KEY) }
      : null;
  return { apple, google };
}

/** The short-lived token App Store Connect asks for (ES256, ten minutes). */
export function appleToken({ issuer, keyId, key }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const body = b64({ iss: issuer, iat, exp: iat + 600, aud: 'appstoreconnect-v1' });
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), {
    key: createPrivateKey(key),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${head}.${body}.${signature}`;
}

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // The body can echo what was sent; only the status goes into an error.
  if (!res.ok) throw new Error(`answered ${res.status}`);
  return res.json();
}

const stars = (n) => (Number(n) >= 1 && Number(n) <= 5 ? Math.round(Number(n)) : null);
const text = (s, max) =>
  String(s ?? '')
    .trim()
    .slice(0, max) || null;

export function fromApple(r, responses = new Map()) {
  const a = r.attributes || {};
  return {
    id: `apple:${r.id}`,
    store: 'apple',
    rating: stars(a.rating),
    title: text(a.title, 200),
    body: text(a.body, 6000),
    author: text(a.reviewerNickname, 80),
    country: text(a.territory, 3),
    at: a.createdDate ? new Date(a.createdDate).toISOString() : null,
    reply: text(responses.get(r.relationships?.response?.data?.id), 6000),
  };
}

export function fromGoogle(r) {
  const u = (r.comments || []).map((c) => c.userComment).find(Boolean) || {};
  const d = (r.comments || []).map((c) => c.developerComment).find(Boolean);
  // Google puts the title and the body in one string, parted by a tab.
  const [title, ...rest] = String(u.text || '').split('\t');
  return {
    id: `google:${r.reviewId}`,
    store: 'google',
    rating: stars(u.starRating),
    title: rest.length ? text(title, 200) : null,
    body: text(rest.length ? rest.join(' ') : title, 6000),
    author: text(r.authorName, 80),
    version: text(u.appVersionName, 20),
    at: u.lastModified?.seconds
      ? new Date(Number(u.lastModified.seconds) * 1000).toISOString()
      : null,
    reply: text(d?.text, 6000),
  };
}

async function fetchApple(cfg) {
  const headers = { authorization: `Bearer ${appleToken(cfg)}` };
  let url = `${ASC}/v1/apps/${APPLE_APP_ID}/customerReviews?sort=-createdDate&limit=200&include=response`;
  const out = [];
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const j = await getJson(url, { headers });
    const responses = new Map(
      (j.included || []).map((x) => [x.id, x.attributes?.responseBody]).filter(([, v]) => v),
    );
    out.push(...(j.data || []).map((r) => fromApple(r, responses)));
    const next = j.links?.next;
    // Our token goes only to Apple, whatever a page link says.
    url = typeof next === 'string' && next.startsWith(`${ASC}/`) ? next : null;
  }
  return out;
}

async function fetchGoogle(cfg) {
  const iat = Math.floor(Date.now() / 1000);
  const aud = 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: cfg.email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud,
    iat,
    exp: iat + 600,
  })}`;
  const assertion = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(cfg.key, 'base64url')}`;
  const tok = await getJson(aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE}/reviews?maxResults=100`;
  const out = [];
  let token = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const j = await getJson(token ? `${base}&token=${encodeURIComponent(token)}` : base, {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    out.push(...(j.reviews || []).map(fromGoogle));
    token = j.tokenPagination?.nextPageToken || null;
    if (!token) break;
  }
  return out;
}

const status = {
  apple: { lastSyncAt: null, error: null },
  google: { lastSyncAt: null, error: null },
};

/** Save what came back. A review its author edited is updated; nothing is ever deleted here. */
function keep(list) {
  let added = 0;
  for (const r of list) {
    if (!r.rating || !r.at || /:undefined$/.test(r.id)) continue;
    const cur = getOps('storeReview', r.id);
    if (!cur) added += 1;
    const next = { ...r, firstSeenAt: cur?.firstSeenAt || new Date().toISOString() };
    if (!cur || JSON.stringify({ ...cur }) !== JSON.stringify({ ...cur, ...next }))
      putOpsSoft('storeReview', r.id, next);
  }
  return added;
}

/** Fetch from every connected store. One store failing never stops the other. */
export async function syncStoreReviews() {
  const cfg = storeConfig();
  const result = {};
  for (const [name, fetcher] of Object.entries({ apple: fetchApple, google: fetchGoogle })) {
    if (!cfg[name]) continue;
    try {
      result[name] = { added: keep(await fetcher(cfg[name])) };
      status[name] = { lastSyncAt: new Date().toISOString(), error: null };
    } catch (e) {
      const why = e?.name === 'TimeoutError' ? 'did not answer in time' : String(e?.message || e);
      // Key-parsing errors come from crypto and describe the key; keep them out of the page.
      const error = /^answered \d+$|did not answer/.test(why)
        ? `${STORE_LABELS[name]} ${why}.`
        : `${STORE_LABELS[name]} could not be reached. Check its key.`;
      status[name] = { ...status[name], error };
      result[name] = { error };
      reportError(new Error(error), { scope: 'store-reviews', store: name });
    }
  }
  return result;
}

export function listStoreReviews({ store = null, rating = null } = {}) {
  const all = listOps('storeReview').sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const cfg = storeConfig();
  const perStore = Object.keys(STORE_LABELS).map((key) => {
    const mine = all.filter((r) => r.store === key);
    return {
      key,
      label: STORE_LABELS[key],
      manual: MANUAL_STORES.includes(key),
      connected: MANUAL_STORES.includes(key) ? null : !!cfg[key],
      lastSyncAt: status[key]?.lastSyncAt || null,
      error: status[key]?.error || null,
      count: mine.length,
      average: mine.length
        ? Math.round((mine.reduce((n, r) => n + r.rating, 0) / mine.length) * 10) / 10
        : null,
    };
  });
  return {
    stores: perStore,
    reviews: all
      .filter((r) => (!store || r.store === store) && (!rating || r.rating === rating))
      .map((r) => ({ ...r, storeLabel: STORE_LABELS[r.store] || r.store })),
  };
}

export async function addManualReview(body, by) {
  const id = `${body.store}:${newId('rv', 10)}`;
  return putOps('storeReview', id, {
    store: body.store,
    rating: body.rating,
    title: null,
    body: body.body,
    author: body.author || null,
    url: body.url || null,
    at: body.at || new Date().toISOString(),
    reply: null,
    by,
    firstSeenAt: new Date().toISOString(),
  });
}

/** Only a typed-in review can be removed; a store's own would come straight back. */
export async function removeManualReview(id) {
  const r = getOps('storeReview', id);
  if (!r || !MANUAL_STORES.includes(r.store)) return false;
  await removeOps('storeReview', id);
  return true;
}

let timer = null;
export function startStoreReviewSync(everyMs = 60 * 60e3) {
  if (timer) return timer;
  const run = () => {
    if (!isLeader()) return;
    syncStoreReviews().catch((e) => reportError(e, { scope: 'store-reviews' }));
  };
  timer = setInterval(run, everyMs);
  timer.unref?.();
  setTimeout(run, 90e3).unref?.();
  return timer;
}
