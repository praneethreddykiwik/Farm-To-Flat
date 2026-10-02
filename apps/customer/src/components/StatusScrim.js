import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/**
 * An opaque band the height of the top safe-area inset.
 *
 * The app draws edge-to-edge, and every scrolling screen starts its content at `insets.top` — so
 * as soon as you scroll, cards and headings travel UP through the transparent status bar and
 * collide with the clock, wifi and battery icons. Product names rendered straight over the system
 * clock, which reads as a broken screen rather than a deliberate one.
 *
 * This gives that content something to disappear behind. It is painted in the screen's own
 * background colour so the band is invisible at rest, and sits above the scroll view but below any
 * floating header (the home search pill keeps reading as floating over the content).
 *
 * Place it as the LAST child of a screen root, before only the floating/sticky overlays. Screens
 * with a full-bleed dark header (onboarding) deliberately scroll under the status bar and should
 * not use this.
 *
 * @param {{ color?: string }} props
 */
export function StatusScrim({ color = colors.canvas }) {
  const insets = useSafeAreaInsets();
  if (!insets.top) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: color,
      }}
    />
  );
}
