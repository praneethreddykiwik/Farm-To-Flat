/**
 * Farm-to-Flat design tokens.
 * Single source of truth for the customer app (NativeWind + StyleSheet) and the admin web app.
 * Colours are chosen for "linen and leaf": a warm off-white canvas, deep forest ink,
 * one leaf-green primary and one sprout accent. Nothing else is saturated.
 */

export const colors = {
  // canvas + surfaces
  canvas: '#F3F5EF',
  canvasDeep: '#E7ECE2',
  white: '#FFFFFF',
  night: '#0B1510',
  night2: '#14241B',

  // text
  ink: '#0E1B14',
  ink2: '#3D4B43',
  ink3: '#7C8781',
  inkOnDark: '#F3F5EF',

  // brand
  leaf: '#1E7A4C',
  leafDeep: '#135A37',
  leafSoft: '#DDF0E4',
  sprout: '#CDF56A',
  sproutDeep: '#9FD12C',

  // ambient tints (used only in background blobs and category tiles)
  mint: '#BFE9D0',
  butter: '#F4E9B7',
  sky: '#CFE2F3',
  blush: '#F6D5C8',
  lilac: '#E2D9F3',

  // semantic
  tomato: '#D9532B',
  tomatoSoft: '#FBE4DC',
  amber: '#D89B1A',
  amberSoft: '#FBEFD2',
  success: '#1E7A4C',

  // glass
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(255,255,255,0.80)',
  glassDark: 'rgba(14,27,20,0.72)',
  glassDarkBorder: 'rgba(255,255,255,0.14)',
  hairline: 'rgba(14,27,20,0.08)',
  scrim: 'rgba(14,27,20,0.45)',
};

export const radius = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40, pill: 999 };

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 56,
  10: 72,
};

/** Font family names as registered by expo-google-fonts. */
export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  displayItalic: 'Fraunces_500Medium_Italic',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemi: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
};

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.4 },
  h3: { fontFamily: fonts.bodySemi, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18 },
  price: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, letterSpacing: -0.3 },
};

export const motion = {
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 120, mass: 1 },
  springSnappy: { damping: 16, stiffness: 260, mass: 0.7 },
  dur: { instant: 100, fast: 180, base: 280, slow: 520 },
  stagger: 60,
};

export const shadow = {
  soft: {
    shadowColor: '#0E1B14',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  lift: {
    shadowColor: '#0E1B14',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  glow: {
    shadowColor: '#1E7A4C',
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
};

/** Tailwind theme fragment, consumed by both NativeWind and the admin Tailwind config. */
export const tailwindTheme = {
  colors: {
    canvas: colors.canvas,
    'canvas-deep': colors.canvasDeep,
    night: colors.night,
    night2: colors.night2,
    ink: colors.ink,
    ink2: colors.ink2,
    ink3: colors.ink3,
    leaf: colors.leaf,
    'leaf-deep': colors.leafDeep,
    'leaf-soft': colors.leafSoft,
    sprout: colors.sprout,
    'sprout-deep': colors.sproutDeep,
    mint: colors.mint,
    butter: colors.butter,
    sky: colors.sky,
    blush: colors.blush,
    lilac: colors.lilac,
    tomato: colors.tomato,
    'tomato-soft': colors.tomatoSoft,
    amber: colors.amber,
    'amber-soft': colors.amberSoft,
    white: colors.white,
  },
  borderRadius: {
    xs: `${radius.xs}px`,
    sm: `${radius.sm}px`,
    md: `${radius.md}px`,
    lg: `${radius.lg}px`,
    xl: `${radius.xl}px`,
    '2xl': `${radius.xxl}px`,
    pill: `${radius.pill}px`,
  },
  fontFamily: {
    display: [fonts.display],
    'display-bold': [fonts.displayBold],
    'display-italic': [fonts.displayItalic],
    body: [fonts.body],
    'body-medium': [fonts.bodyMedium],
    'body-semi': [fonts.bodySemi],
    mono: [fonts.mono],
  },
};

export default { colors, radius, space, fonts, type, motion, shadow, tailwindTheme };
