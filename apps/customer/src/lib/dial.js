/**
 * Ring a customer from the delivery round.
 *
 * Three things made the Call button do nothing at all:
 *
 *  • It dialled `order.mobile` — the account number. A customer can name a different person to
 *    call at the door, and that number was being dropped, so the round rang the wrong phone.
 *  • The number had no country code (see lib/phone.js).
 *  • The failure was swallowed by an empty catch. The delivery person tapped, nothing happened,
 *    and there was nothing on screen to explain it or to read out manually.
 */
import { Linking, Platform } from 'react-native';
import { prettyNumber, toDialable } from './phone';

export { numberFor, prettyNumber, toDialable } from './phone';

/**
 * Open the dialer. Returns a reason when it could not, rather than failing silently — the caller
 * shows it, so there is always an explanation and the number stays visible to dial by hand.
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function dial(raw) {
  const num = toDialable(raw);
  if (!num) return { ok: false, reason: 'No phone number on this order.' };
  // `telprompt` asks before dialling on iOS; `tel` dials straight out on Android.
  const url = `${Platform.OS === 'ios' ? 'telprompt' : 'tel'}:${num}`;
  try {
    await Linking.openURL(url);
    return { ok: true };
  } catch {
    // A simulator, a tablet, or a phone with no dialer app. Say so and let them read the number.
    return { ok: false, reason: `Could not open the dialer. Call ${prettyNumber(num)} manually.` };
  }
}
