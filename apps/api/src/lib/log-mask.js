/**
 * What a log line may say about a person (review #37, 21 Nov 2026).
 *
 * Server logs go to Render's log stream and to whatever it is drained into: kept longer and read by
 * more people than the database, with none of its access control. Under the DPDP Act a full phone
 * number there is personal data we hold without a purpose. The first two and last two digits are
 * enough to match a line to a support call ("the number ending 10"), and not enough to dial.
 */

/** "9848012310" → "98xxxxxx10". Anything too short to mask safely is hidden entirely. */
export function maskMobileForLog(mobile) {
  const d = String(mobile || '').replace(/\D/g, '');
  if (d.length < 8) return 'xxxxxxxxxx';
  return `${d.slice(0, 2)}${'x'.repeat(d.length - 4)}${d.slice(-2)}`;
}
