/**
 * Working out which number to ring and how to write it. Deliberately free of any React Native
 * import so it can be tested directly — this is the logic that made the Call button do nothing,
 * and it is worth pinning.
 */

/** The number to actually ring: whoever the customer named for the door, else the account. */
export const numberFor = (order) => order?.address?.contactNumber || order?.mobile || null;

/**
 * "9876543210" → "+919876543210". Already-prefixed numbers pass through. Most Indian dialers cope
 * with a bare ten digits, but one set to another region does not, and neither does a device with
 * no SIM — so always hand the dialer something unambiguous.
 */
export function toDialable(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.startsWith('+')) return s.replace(/[^\d+]/g, '');
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.startsWith('0')) return `+91${digits.replace(/^0+/, '')}`;
  return `+91${digits}`;
}

/** Pretty form for showing on the card, so it can be dialled by hand if all else fails. */
export function prettyNumber(raw) {
  const d = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(-10);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : String(raw ?? '');
}
