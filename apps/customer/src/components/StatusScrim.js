import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/**
 * A fading veil the height of the top safe-area inset.
 *
 * The app draws edge-to-edge, and every scrolling screen starts its content at `insets.top` — so
 * as soon as you scroll, cards and headings travel UP through the transparent status bar and
 * collide with the clock, wifi and battery icons. This gives that content something to disappear
 * behind.
 *
 * It used to be a SOLID band in the canvas colour. Over the soft green and yellow light at the top
 * of the home screen that read as a white bar cut across the top of the phone (owner, 21 Nov 2026:
 * "why don't you make it into the same continuation"). A frosted blur still left a line where it
 * stopped, so it is now a fade: a veil behind the clock that thins to nothing at its bottom edge.
 *
 * Place it as the LAST child of a screen root, before only the floating/sticky overlays. Screens
 * with a full-bleed dark header (onboarding) deliberately scroll under the status bar and should
 * not use this.
 *
 * @param {{ color?: string }} props  `color` tints the veil (defaults to the canvas)
 */
export function StatusScrim({ color = colors.canvas }) {
  const insets = useSafeAreaInsets();
  if (!insets.top) return null;
  const box = {
    position: /** @type {'absolute'} */ ('absolute'),
    top: 0,
    left: 0,
    right: 0,
    height: insets.top,
  };
  // A fade, not a band: near-solid behind the clock and icons (scrolled text must not show through
  // them), then clear by the bottom edge. A solid or blurred band always leaves a visible line
  // where it stops; a fade has no edge to see.
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[withAlpha(color, 0.97), withAlpha(color, 0.92), withAlpha(color, 0)]}
      locations={[0, 0.62, 1]}
      style={box}
    />
  );
}

/** '#F3F5EF' + 0.3 → 'rgba(243,245,239,0.3)'; anything that is not a 6-digit hex passes through. */
function withAlpha(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
