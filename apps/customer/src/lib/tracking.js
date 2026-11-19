/**
 * The phone's part of Rapture7's Developer Tracking Brief (19 Nov 2026). Everything else is
 * recorded on our server where it happens; this covers what only the phone can see.
 *
 *   Install referrer (Android): a Fooducia link — a counter QR, a WhatsApp post, an invite — opens
 *     Google Play with `referrer=src=counter&p=PR01&c=aquantis`. Google hands that string to the
 *     app on its first open (the Play Install Referrer API, via expo-application, which Expo already
 *     ships in the binary). It is read ONCE, kept on the phone, sent to the server after sign-in,
 *     and its promoter/invite code pre-fills the code box at the first order. iPhones have no such
 *     thing — there the customer types the code or a neighbour's number.
 *
 *   Client events: checkout_started, referral_link_shared, repeat_basket_used,
 *     cutoff_reminder_opened, voice_order_used. Allowlisted and capped on the server; never personal
 *     data. Fire-and-forget: tracking must never block or break a screen.
 *
 * No third-party analytics SDK. No advertising identifier.
 */
import { Platform } from 'react-native';
import { kv } from './kv';

const K_REF = 'installRef.v1'; // { raw, src, p, c, r }
const K_READ = 'installRef.read';
const K_SENT = 'installRef.sent';

/** Parse a referrer string the way the server does (routes/growth.js parseReferrer). */
export function parseReferrer(raw) {
  const q = {};
  for (const part of String(raw || '').split('&')) {
    const [k, v = ''] = part.split('=');
    if (!k) continue;
    try {
      q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      /* skip a malformed pair */
    }
  }
  const clean = (v) =>
    String(v || '')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 40);
  const tag = {
    src: clean(q.src || q.utm_source).toLowerCase() || null,
    p: clean(q.p || q.promoter).toUpperCase() || null,
    c: clean(q.c || q.community || q.utm_campaign).toLowerCase() || null,
    r: clean(q.r || q.ref).toUpperCase() || null,
  };
  if (tag.src === 'google-play' && !tag.p && !tag.r) return null; // a plain store install
  return tag.src || tag.p || tag.r ? tag : null;
}

let referrerRead = Promise.resolve();

/** Read the Play install referrer once per install (Android only). Never throws. */
export function readInstallReferrerOnce() {
  referrerRead = readReferrer();
  return referrerRead;
}

async function readReferrer() {
  if (Platform.OS !== 'android' || kv.getString(K_READ)) return;
  kv.setString(K_READ, '1');
  try {
    const Application = require('expo-application');
    const raw = await Application.getInstallReferrerAsync();
    const tag = parseReferrer(raw);
    if (tag) kv.setJSON(K_REF, { raw: String(raw).slice(0, 300), ...tag });
  } catch {
    /* not installed from Play, or the Play service is unavailable — nothing to record */
  }
}

/** The stored install tag, or null. */
export const installTag = () => kv.getJSON(K_REF);

/** The code an install link carried (an invite code wins over a promoter code), for the code box. */
export function installCode() {
  const t = installTag();
  return t ? t.r || t.p || null : null;
}

/**
 * Send the install tag to the server once, after sign-in.
 * @param {(referrer: string) => { unwrap: () => Promise<any> }} post  the postInstallSource trigger
 */
export async function sendInstallSourceOnce(post) {
  await referrerRead;
  const t = installTag();
  if (!t || kv.getString(K_SENT)) return;
  try {
    await post(t.raw || '').unwrap();
    kv.setString(K_SENT, '1');
  } catch {
    /* try again next launch */
  }
}

let dispatchRef = null;
let endpointRef = null;
/** Wired once from the root layout so any screen can call track() without hooks. */
export function initTracking(dispatch, trackEndpoint) {
  dispatchRef = dispatch;
  endpointRef = trackEndpoint;
}

/** Record a client event. Fire-and-forget. */
export function track(name, props = {}) {
  try {
    if (!dispatchRef || !endpointRef) return;
    const r = dispatchRef(endpointRef.initiate({ name, props }));
    r?.unwrap?.().catch(() => {});
  } catch {
    /* never let tracking break a screen */
  }
}
