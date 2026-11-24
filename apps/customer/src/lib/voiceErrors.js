/**
 * Turn the speech engine's own wording into something a shopper can act on (24 Nov 2026). iOS
 * says "Session activation failed" when the microphone is held by a phone call or another app.
 * @param {string|null|undefined} raw
 */
export function friendlyVoiceError(raw) {
  const m = String(raw || '').toLowerCase();
  if (/session activation|audio session|audio-capture|busy|interrupt/.test(m))
    return 'The microphone is busy, perhaps with a call. Try again once it is free, or type instead.';
  if (/network/.test(m))
    return 'Voice search needs the internet. Check your connection, or type instead.';
  if (/not-allowed|permission|denied/.test(m))
    return 'Microphone access is off. Turn it on in Settings to search by voice.';
  return 'Could not hear that. Try again, or type instead.';
}
