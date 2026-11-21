/**
 * Consent to the privacy notice, with the "I am 18 or older" confirmation (DPDP Act §6, §9;
 * Rules 3 and 10). Added 21 Nov 2026.
 *
 * Sign-up used to say "By continuing you agree…": consent implied by carrying on, bundled with the
 * terms, and no age check at all. Consent now has to be a clear action — two unticked boxes — and
 * this module keeps the proof: which version of the notice was agreed to, that the person said they
 * are an adult, when, and how (at sign-up, or the one-time prompt shown to existing customers).
 *
 * One OpsRecord row per customer, keyed by customer id. It holds no name, number or address, so it
 * can be kept after the account is erased as proof that consent was given (the policy says so).
 * Raising NOTICE_VERSION makes every customer see the prompt once more.
 */
import { getOps, opsReady, putOps } from '../ops-store.js';

export const NOTICE_VERSION = 'privacy-2026-11-21';

/** @returns {{ version: string, adult: boolean, at: string, via: string, history: any[] } | null} */
export function consentOf(customerId) {
  return getOps('consent', customerId) || null;
}

/** Does this customer still have to agree to the current notice? */
export function consentRequired(customerId) {
  // Fail open: if the OpsRecord table is missing, the answer could never be saved, and asking would
  // trap the customer on a prompt they cannot get past. Ask again once the table is back.
  if (!opsReady()) return false;
  const c = consentOf(customerId);
  return !(c && c.version === NOTICE_VERSION && c.adult === true);
}

/**
 * Record consent. Refuses anything but the current version with the adult box ticked: a stale app
 * agreeing to an older notice is not consent to this one.
 * @param {string} customerId
 * @param {{ version: string, adult: boolean, via: 'signup'|'prompt' }} input
 * @returns {Promise<{ ok: true } | { error: { status: number, code: string, message: string } }>}
 */
export async function recordConsent(customerId, { version, adult, via }) {
  if (version !== NOTICE_VERSION)
    return {
      error: {
        status: 409,
        code: 'NOTICE_CHANGED',
        message: 'Our privacy notice has been updated. Please read it again and agree.',
      },
    };
  if (adult !== true)
    return {
      error: {
        status: 422,
        code: 'ADULT_REQUIRED',
        message: 'Fooducia is for people aged 18 or older.',
      },
    };
  const prev = consentOf(customerId);
  const at = new Date().toISOString();
  const history = [...(prev?.history || []), { version, adult, at, via }].slice(-20);
  await putOps('consent', customerId, { customerId, version, adult, at, via, history });
  return { ok: true };
}
