import tokens, { colors, fonts, motion, radius, shadow, space, type } from '@f2f/tokens';

export { colors, fonts, motion, radius, shadow, space, type };
export default tokens;

/** Tint name from the catalog → ambient colour pair used on tiles and chips */
export const TINTS = {
  mint: { bg: colors.mint, fg: colors.leafDeep, accent: '#8ED3AC' },
  butter: { bg: colors.butter, fg: '#7A5A00', accent: '#E9D27A' },
  sky: { bg: colors.sky, fg: '#1E4E7A', accent: '#A9CBEA' },
  blush: { bg: colors.blush, fg: '#8A3B1F', accent: '#EDB7A2' },
  lilac: { bg: colors.lilac, fg: '#4A3A7A', accent: '#C9BAEB' },
};

export const tintOf = (name) => TINTS[name] || TINTS.mint;
