/**
 * "Before you go, what went wrong?" — asked when a customer starts deleting their account
 * (Discussion on Fooducia Strategies, 22 Nov 2026).
 *
 * Always optional. Deleting an account must stay as easy as opening one (DPDP Rules, App Store
 * Review Guideline 5.1.1(v)), so the question can be skipped and an older app that never asks still
 * works. The answer never blocks, delays or changes the deletion.
 *
 * The reason is kept as a plain count with the deletion record. The customer's own words are kept
 * only until the account is erased, then removed: the record that outlives the account names nobody.
 */
import { listOps, putOpsSoft } from '../ops-store.js';

export const EXIT_REASONS = {
  QUALITY: 'Quality of the vegetables',
  DELIVERY: 'Delivery problems',
  PRICE: 'Too expensive',
  RANGE: 'Could not find what I need',
  APP: 'The app is hard to use',
  NOTIFICATIONS: 'Too many messages',
  MOVED: 'Moved, or no delivery to my home',
  PRIVACY: 'Privacy concerns',
  OTHER: 'Something else',
};
export const EXIT_REASON_KEYS = Object.keys(EXIT_REASONS);

/** Take the customer's words off every deletion record of an erased account; keep the reason. */
export function forgetExitNotes(customerId) {
  for (const r of listOps('deletionConsent').filter(
    (x) => x.customerId === customerId && x.exitNote,
  ))
    putOpsSoft('deletionConsent', r.id, { ...r, exitNote: null });
}

/** What leaving customers told us in a date range (IST dates, inclusive), newest first. */
export function exitSummary({ from, to }, istDate) {
  const rows = listOps('deletionConsent')
    .filter((r) => {
      const d = istDate(r.at);
      return (!from || d >= from) && (!to || d <= to);
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const answered = rows.filter((r) => EXIT_REASONS[r.exitReason]);
  return {
    requests: rows.length,
    answered: answered.length,
    skipped: rows.length - answered.length,
    byReason: EXIT_REASON_KEYS.map((key) => ({
      key,
      label: EXIT_REASONS[key],
      count: answered.filter((r) => r.exitReason === key).length,
    })).sort((a, b) => b.count - a.count),
    // No name, number or account reference: the page is about why, not who.
    // (a record's own id contains the account id, so a row number is sent instead)
    recent: rows.slice(0, 100).map((r, i) => ({
      id: i + 1,
      at: r.at,
      via: r.via || null,
      reason: r.exitReason || null,
      reasonLabel: EXIT_REASONS[r.exitReason] || null,
      note: r.exitNote || null,
    })),
  };
}
