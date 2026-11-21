/**
 * The security record (DPDP Rules 6(1)(e) and 8(3)). Added 21 Nov 2026.
 *
 * The Rules require keeping logs that let unauthorised access be detected and investigated, for at
 * least one year. The API's request logs live on the hosting provider for days, not a year. This
 * keeps the events that matter — sign-ins and failed codes, number changes, deletion requests and
 * erasures, consents, staff sign-ins — in the OpsRecord table for 366 days, then deletes them.
 *
 * Minimal by design: an event type, a time, the internal customer id, a MASKED number and the
 * network block (IPv6 /64, never a full address for IPv6). No names, flats, codes or tokens. It is
 * kept for its year even after an account is erased — the privacy policy says so — because a
 * record that disappears with the account cannot investigate what happened to that account.
 */
import { randomUUID } from 'node:crypto';
import { listOps, putOpsSoft, removeOps } from '../ops-store.js';
import { clientIp, ipBucket } from './edge.js';
import { IS_TEST } from './env.js';
import { isLeader } from './leader.js';

export const SECURITY_RETENTION_DAYS = 366;

/** 9876543210 -> 98xxxxxx10 */
export function maskNumber(m) {
  const d = String(m || '').replace(/\D/g, '');
  return d.length >= 6 ? `${d.slice(0, 2)}${'x'.repeat(d.length - 4)}${d.slice(-2)}` : null;
}

/**
 * @param {string} type  e.g. SIGN_IN, SIGN_IN_FAILED, OTP_LOCKED, SIGN_OUT, MOBILE_CHANGED,
 *   DELETION_REQUESTED, ACCOUNT_ERASED, CONSENT_GIVEN, STAFF_SIGN_IN
 * @param {{ req?: any, customerId?: string|null, mobile?: string|null, actor?: string|null, details?: any }} [ctx]
 */
export function logSecurityEvent(type, ctx = {}) {
  try {
    const at = new Date().toISOString();
    const id = `${at.slice(0, 10)}_${randomUUID()}`;
    putOpsSoft('securityEvent', id, {
      type,
      at,
      customerId: ctx.customerId || null,
      mobile: ctx.mobile ? maskNumber(ctx.mobile) : null,
      actor: ctx.actor || null,
      net: ctx.req ? ipBucket(clientIp(ctx.req)) : null,
      ...(ctx.details ? { details: ctx.details } : {}),
    });
  } catch (e) {
    // Recording must never break sign-in.
    // eslint-disable-next-line no-console
    console.error('[security-log] not recorded:', e?.message || e);
  }
}

/** Events for one customer (for a rights request or an investigation), newest first. */
export function securityEventsFor(customerId) {
  return listOps('securityEvent')
    .filter((e) => e.customerId === customerId)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Delete events older than the retention period. @returns {Promise<number>} removed */
export async function sweepSecurityLog(now = Date.now()) {
  const cutoff = new Date(now - SECURITY_RETENTION_DAYS * 864e5).toISOString();
  let n = 0;
  for (const e of listOps('securityEvent'))
    if (e.at < cutoff) {
      await removeOps('securityEvent', e.id).catch(() => {});
      n += 1;
    }
  return n;
}

if (!IS_TEST)
  setInterval(
    () => {
      if (isLeader()) sweepSecurityLog().catch(() => {});
    },
    6 * 60 * 60 * 1000,
  ).unref();
