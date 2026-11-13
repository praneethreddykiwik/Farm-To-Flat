/**
 * Is this a phone to go easy on?
 *
 * Measured on a two-core, 2.5 GB Android emulator with the app's production JavaScript: two things
 * that never stop — the words drifting past at the top of Home and the slow drift of the
 * background — kept the whole screen being redrawn sixty times a second with nobody touching it,
 * and the soft shadow under every card was drawn again on every frame of a scroll. Taking those
 * three away cut the share of slow frames while scrolling from 60% to about 20%, and an idle
 * screen went from 60 redraws a second to none. A good phone does not notice any of them; a cheap
 * one spends on them what it needs for the shopper's thumb.
 *
 * So the app asks once, at start, what it is running on. Android only: every iPhone that can run
 * this app is comfortably past the line.
 *
 * The line, either of:
 *  - 4 GB of memory or less (a "4 GB" phone reports about 3.7);
 *  - a screen 720 pixels wide or narrower — the panel budget phones are built around, whatever
 *    their memory says.
 *
 * Not the "year class" the system offers: its scale stops at 2016, so it calls every phone made
 * since then old. Trying it put a 6 GB phone below the line.
 *
 * Pure, so the line can be tested without a phone. `deviceTier.js` reads the device.
 *
 * @param {{ os?: string, totalMemoryBytes?: number|null, screenWidthPx?: number|null }} d
 */
export function isLowEnd({ os, totalMemoryBytes, screenWidthPx } = {}) {
  if (os !== 'android') return false;
  const gb = Number(totalMemoryBytes) / 2 ** 30;
  if (gb > 0 && gb <= 4.5) return true;
  const w = Number(screenWidthPx);
  if (w > 0 && w <= 720) return true;
  return false;
}
