/**
 * The operator's session after a Google sign-in — our own token, not Google's.
 *
 * WHY NOT KEEP GOOGLE'S ID TOKEN: it expires in an hour, it is minted for the browser rather than
 * for us, and re-checking it on every request would mean a network round trip to Google inside each
 * admin API call. We verify Google ONCE, at sign-in, and then issue our own.
 *
 * The token is signed, not encrypted — it is an identity card, not a secret. The payload is
 * readable; what matters is that it cannot be edited, because the HMAC is over the exact bytes and
 * the secret never leaves the server. Change one character of the role and the signature fails.
 *
 * Stateless by design: Render restarts on every deploy, and a server-side session table in memory
 * would sign every operator out each time. The cost of statelessness is that a token cannot be
 * un-issued, so two things bound the damage — a 12-hour expiry, and an in-process revocation list
 * for explicit sign-outs.
 *
 * ADMIN_SESSION_SECRET keeps sessions valid across restarts. Unset, a random secret is generated at
 * boot: sessions then survive until the next deploy, which is a usability cost, never a security
 * one. There is deliberately no default secret to fall back to — a shipped constant would let
 * anyone mint themselves a SUPER_ADMIN session.
 */
import crypto from 'node:crypto';
import { IS_PROD } from './env.js';

const TTL_S = 12 * 60 * 60;

const configured = (process.env.ADMIN_SESSION_SECRET || '').trim();
if (IS_PROD && configured.length < 16) {
  // eslint-disable-next-line no-console
  console.error(
    '[admin-session] ADMIN_SESSION_SECRET is not set (or is too short) — using a random per-boot secret. Operator sessions will end at every deploy.',
  );
}
const SECRET = configured.length >= 16 ? Buffer.from(configured, 'utf8') : crypto.randomBytes(32);

/** Explicitly signed-out token ids. In memory: a deploy clears it, and a deploy also invalidates
 *  every token signed with a per-boot secret, so the window this protects is the configured-secret
 *  case between now and the token's own expiry. */
const revoked = new Set();

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const mac = (body) => crypto.createHmac('sha256', SECRET).update(body).digest();

/** @param {{ email:string, role:string, name?:string|null, picture?:string|null }} who */
export function issueAdminSession({ email, role, name, picture }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    jti: crypto.randomUUID(),
    email,
    role,
    name: name || null,
    picture: picture || null,
    iat: now,
    exp: now + TTL_S,
  };
  const body = `v1.${b64(JSON.stringify(payload))}`;
  return { token: `${body}.${b64(mac(body))}`, expiresAt: payload.exp * 1000, payload };
}

/**
 * @returns {{ email:string, role:string, name:string|null, jti:string } | null}
 *   null for anything that is not a currently valid session — expired, edited, forged, revoked.
 */
export function verifyAdminSession(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;

  const body = `${parts[0]}.${parts[1]}`;
  const expected = mac(body);
  let given;
  try {
    given = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  // Constant-time, and length-checked first because timingSafeEqual throws on a length mismatch.
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload?.v !== 1) return null;
  if (!(Number(payload.exp) > Math.floor(Date.now() / 1000))) return null;
  if (revoked.has(payload.jti)) return null;
  return payload;
}

/** Sign this session out. Idempotent. */
export function revokeAdminSession(token) {
  const payload = verifyAdminSession(token);
  if (payload?.jti) revoked.add(payload.jti);
  return !!payload;
}

/** Exposed for tests. */
export const resetAdminSessions = () => revoked.clear();
