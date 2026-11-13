/**
 * How big the tab bar's parts are, from how wide the phone is.
 *
 * Kept apart from the component, and free of anything React Native, so the arithmetic that decides
 * whether the bar FITS can be tested across phone widths without a phone.
 */

/** Room the labelled tab is assumed to need for its word. The longest are "Orders" and "Wallet". */
const LABEL_W = 52;

/**
 * How big everything is, from how wide the phone is. One labelled tab, the rest as icons, and — for
 * staff who have it — the AI button standing apart on the right, all have to fit on one line with a
 * gutter either side. On a 360-point phone that only works a little tighter than on a 400-point one;
 * narrower still, the word goes and the current tab is marked by its pill alone.
 * @param {number} screenW
 * @param {number} tabs   how many tabs sit in the bar
 * @param {boolean} ai    whether the separate AI button is showing
 */
export function measureTabBar(screenW, tabs, ai) {
  const gutter = 10;
  const compact = screenW < 390;
  const aiSize = compact ? 56 : 60;
  const aiGap = compact ? 8 : 10;
  const barPad = compact ? 5 : 6;
  const padH = compact ? 13 : 16;
  const gap = compact ? 6 : 8;
  const icon = compact ? 21 : 22;
  const room = screenW - gutter * 2 - (ai ? aiSize + aiGap : 0) - barPad * 2;
  const labelled = padH * 2 + icon + gap + LABEL_W;
  const each = Math.floor((room - labelled) / Math.max(1, tabs - 1));
  const showLabel = each >= 40;
  const tabW = showLabel ? Math.min(52, each) : Math.min(56, Math.floor(room / Math.max(1, tabs)));
  // The bar keeps one width whatever is selected. The labelled tab is always `activeW` wide — the
  // word sits centred in it — so going from "Home" to "Orders", or to the AI screen where no tab in
  // the bar is current, never makes the whole bar grow, shrink or shuffle sideways.
  const activeW = showLabel ? labelled : tabW;
  const rowW = activeW + (tabs - 1) * tabW;
  return { compact, aiSize, aiGap, barPad, gap, icon, tabW, activeW, rowW, showLabel };
}
