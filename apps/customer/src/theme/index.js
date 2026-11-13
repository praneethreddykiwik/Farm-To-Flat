import { Platform } from 'react-native';
import { lowEnd } from '../lib/deviceTier';
import tokens, {
  colors,
  fonts,
  motion,
  radius,
  shadow as shadowTokens,
  space,
  type,
} from '@f2f/tokens';

export { colors, fonts, motion, radius, space, type };
export default tokens;

/**
 * Shadows, drawn the way each platform draws them well.
 *
 * iOS keeps the layer shadow (`shadowColor` and friends): it is cast by whatever the view actually
 * paints, so a frosted, see-through card gets a soft shadow and nothing else.
 *
 * Android must NOT use `elevation` here. An elevation shadow is painted UNDER the whole view, and
 * every card in this app is translucent (a 94% white fill with a sheen over it), so the shadow
 * showed straight through the card as a darker frame around a lighter, square-cornered box — on
 * every card, on every screen, and at its worst while a card was fading in, when the card is more
 * transparent still. `boxShadow` is drawn outside the view's own outline only (React Native clips
 * the box itself out before painting it), so there is nothing underneath to show through, and it
 * fades with the view like any other paint. It needs Android 9; older phones get a flat card, which
 * is the right trade against the boxes.
 *
 * @param {{ shadowColor: string, shadowOpacity: number, shadowRadius: number, shadowOffset: { width: number, height: number } }} s
 * @param {{ y: number, blur: number, alpha: number }} android  tuned by eye on a phone, not derived:
 *   the two platforms blur differently enough that a formula gets one of them wrong.
 */
function platformShadow(s, android) {
  if (Platform.OS !== 'android') {
    return {
      shadowColor: s.shadowColor,
      shadowOpacity: s.shadowOpacity,
      shadowRadius: s.shadowRadius,
      shadowOffset: s.shadowOffset,
    };
  }
  return {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: android.y,
        blurRadius: android.blur,
        spreadDistance: 0,
        color: withAlpha(s.shadowColor, android.alpha),
      },
    ],
  };
}

/** '#0E1B14' + 0.1 → 'rgba(14,27,20,0.1)' */
function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * The shadows that sit under things there are MANY of — every card in a list, every stepper.
 *
 * On a phone to go easy on (lib/deviceTier) they are left off. A blurred shadow is worked out again
 * on every frame the thing above it is drawn, and a scrolling grid of cards is dozens of them a
 * frame: on a low-spec emulator they were half of the slow frames in a scroll. A card there keeps
 * its hairline edge, which is what separates it from the page. The shadows under the few things that
 * float — the tab bar, the basket bar, the main button — stay everywhere.
 */
const many = (s, android) => (lowEnd ? {} : platformShadow(s, android));

export const shadow = {
  /** Cards, chips, the stepper. */
  soft: many(shadowTokens.soft, { y: 6, blur: 16, alpha: 0.1 }),
  /** Dark chrome and the primary button. */
  lift: platformShadow(shadowTokens.lift, { y: 10, blur: 24, alpha: 0.2 }),
  /** The green accent button. */
  glow: platformShadow(shadowTokens.glow, { y: 8, blur: 20, alpha: 0.3 }),
  /** The selected segment inside a segmented control: a hairline of lift, no more. */
  seg: many(
    {
      shadowColor: '#0E1B14',
      shadowOpacity: 0.09,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    { y: 2, blur: 6, alpha: 0.12 },
  ),
};

/**
 * For an overlay that needs `elevation` on Android only to be PAINTED above its siblings (Android
 * orders overlapping siblings by elevation, not by which is written last). Elevation always brings a
 * shadow with it, and under a see-through overlay that shadow is the same box artefact described
 * above — so the stacking is kept and the shadow is made invisible. No effect on iOS.
 * @param {number} [level]
 */
export const stackAbove = (level = 2) =>
  Platform.OS === 'android'
    ? { zIndex: level, elevation: level, shadowColor: 'transparent' }
    : { zIndex: level };

/** Tint name from the catalog → ambient colour pair used on tiles and chips */
export const TINTS = {
  mint: { bg: colors.mint, fg: colors.leafDeep, accent: '#8ED3AC' },
  butter: { bg: colors.butter, fg: '#7A5A00', accent: '#E9D27A' },
  sky: { bg: colors.sky, fg: '#1E4E7A', accent: '#A9CBEA' },
  blush: { bg: colors.blush, fg: '#8A3B1F', accent: '#EDB7A2' },
  lilac: { bg: colors.lilac, fg: '#4A3A7A', accent: '#C9BAEB' },
};

export const tintOf = (name) => TINTS[name] || TINTS.mint;
