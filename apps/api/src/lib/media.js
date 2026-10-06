/**
 * Short-lived, self-authenticating links for private media served BY US.
 *
 * WHY THIS EXISTS: complaint photographs lived on Supabase Storage and were handed to the browser as
 * signed Supabase URLs. That works only if the customer's network can reach Supabase, and on at
 * least one large Indian ISP it cannot — `*.supabase.co` resolves to a provider-owned address
 * (183.82.14.22, netname Beam-Core) from the ISP resolver AND from 8.8.8.8 and 1.1.1.1, so the DNS
 * answer is being rewritten before it leaves the network and the TLS handshake then fails. Every
 * photograph in the complaints queue failed to load in about 55ms, with nothing to say why.
 *
 * The API itself reaches storage perfectly well from its own host, so the fix is to stop sending the
 * browser to a third-party origin: the image now comes from this API, over the same connection the
 * panel already uses for everything else.
 *
 * A token rather than a session, because this has to work in a plain `<img src>`, which cannot send
 * an Authorization header. The token carries the object path and an expiry, signed with HMAC — it is
 * unguessable, it cannot be edited to point at another object, and it stops working on its own.
 */
import crypto from 'node:crypto';
import { IS_PROD } from './env.js';

/** Long enough to work through a shift with the queue open, short enough that a leaked link dies. */
const TTL_SECONDS = 8 * 60 * 60;

const configured = (
  process.env.MEDIA_TOKEN_SECRET ||
  process.env.ADMIN_SESSION_SECRET ||
  ''
).trim();
if (IS_PROD && configured.length < 16) {
  // eslint-disable-next-line no-console
  console.error(
    '[media] MEDIA_TOKEN_SECRET is not set — using a random per-boot secret, so photo links break at every deploy.',
  );
}
const SECRET = configured.length >= 16 ? Buffer.from(configured, 'utf8') : crypto.randomBytes(32);

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const mac = (body) => crypto.createHmac('sha256', SECRET).update(body).digest();

/** @param {string} path object path inside the issues bucket */
export function mediaToken(path) {
  const payload = b64(JSON.stringify({ p: path, e: Math.floor(Date.now() / 1000) + TTL_SECONDS }));
  return `${payload}.${b64(mac(payload))}`;
}

/** @returns {string|null} the object path, or null if the token is forged, edited or expired */
export function readMediaToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const expected = mac(parts[0]);
  let given;
  try {
    given = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.p || !(Number(payload.e) > Math.floor(Date.now() / 1000))) return null;
  return String(payload.p);
}

/**
 * The absolute URL for a stored object. Absolute because the people loading it are on another
 * origin — the operator panel is served from Vercel and the app from a phone — so a relative path
 * would resolve against the wrong host.
 */
export const mediaUrl = (baseUrl, path) =>
  `${baseUrl}/api/v1/media/issue/${encodeURIComponent(mediaToken(path))}`;

/** The origin this request arrived on, so links point back at whatever host is actually serving. */
export const baseUrlOf = (req) =>
  `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`;
