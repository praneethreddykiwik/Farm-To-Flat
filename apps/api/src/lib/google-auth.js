/**
 * Verifying a Google sign-in, ourselves, from first principles.
 *
 * WHY NOT JUST TRUST THE EMAIL THE BROWSER SENDS: Google Identity Services hands the browser a
 * signed ID token (a JWT). The browser can read it, and so can anyone who wants to forge one — the
 * payload is plain base64. The ONLY thing that makes it a credential is the RS256 signature over
 * Google's published keys. A backend that parses the payload and believes the `email` field is a
 * backend where any attacker signs in as the owner by typing one line of JavaScript.
 *
 * So every one of these is checked, and a failure on any of them is a rejection:
 *   - the signature verifies against the Google key named by the token's `kid`
 *   - `iss` is Google
 *   - `aud` is OUR client id — a token minted for a different site must not open this one
 *   - `exp` has not passed and `iat` is not in the future (60s of clock skew allowed)
 *   - `email_verified` is true — an unverified Google address proves nothing about who holds it
 *
 * No dependency: Node's crypto imports a JWK directly, so this is the whole of it.
 */
import crypto from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const SKEW_S = 60;

/** kid -> KeyObject, cached for as long as Google's own cache-control says. */
let keyCache = { keys: new Map(), until: 0 };

export const googleClientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim();
export const googleEnabled = () => !!googleClientId();

function reject(message, code = 'GOOGLE_REJECTED', status = 401) {
  return Object.assign(new Error(message), { status, code });
}

const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

async function signingKey(kid) {
  if (keyCache.until > Date.now() && keyCache.keys.has(kid)) return keyCache.keys.get(kid);
  const r = await fetch(CERTS_URL);
  if (!r.ok)
    throw reject('Could not reach Google to check the sign-in.', 'GOOGLE_UNREACHABLE', 502);
  const body = await r.json();
  const keys = new Map();
  for (const jwk of body?.keys || []) {
    try {
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
    } catch {
      /* a key we cannot import is a key we will not accept — skip it */
    }
  }
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') || '')?.[1]);
  keyCache = { keys, until: Date.now() + (maxAge > 0 ? maxAge : 3600) * 1000 };
  return keys.get(kid) || null;
}

/** Exposed for tests: forget the cached Google keys. */
export const resetGoogleKeyCache = () => {
  keyCache = { keys: new Map(), until: 0 };
};

/**
 * @param {string} credential the ID token from Google Identity Services
 * @returns {Promise<{ email: string, name?: string, picture?: string, sub: string }>}
 */
export async function verifyGoogleIdToken(credential) {
  const clientId = googleClientId();
  if (!clientId)
    throw reject('Google sign-in is not configured on this server.', 'GOOGLE_NOT_CONFIGURED', 503);

  const parts = String(credential || '').split('.');
  if (parts.length !== 3) throw reject('That sign-in was malformed.');

  let header;
  let payload;
  try {
    header = decode(parts[0]);
    payload = decode(parts[1]);
  } catch {
    throw reject('That sign-in was malformed.');
  }

  // Pin the algorithm. Accepting whatever the token names is the classic JWT break — an attacker
  // sets alg to "none", or to HS256 using the public key as the HMAC secret, and signs their own.
  if (header?.alg !== 'RS256') throw reject('Unsupported sign-in algorithm.');

  const key = await signingKey(header.kid);
  if (!key) throw reject('That sign-in was signed with a key Google does not publish.');

  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], 'base64url'),
  );
  if (!ok) throw reject('That sign-in did not verify.');

  if (!ISSUERS.has(payload?.iss)) throw reject('That sign-in did not come from Google.');
  if (payload?.aud !== clientId) throw reject('That sign-in was issued for a different site.');

  const now = Math.floor(Date.now() / 1000);
  if (!(Number(payload?.exp) > now - SKEW_S)) throw reject('That sign-in has expired. Try again.');
  if (Number(payload?.iat) > now + SKEW_S) throw reject('That sign-in is dated in the future.');
  if (payload?.email_verified !== true)
    throw reject('That Google account has no verified email address.');

  const email = String(payload.email || '')
    .trim()
    .toLowerCase();
  if (!email) throw reject('That sign-in carried no email address.');

  return { email, name: payload.name || null, picture: payload.picture || null, sub: payload.sub };
}
