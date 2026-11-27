/**
 * The little count on a basket button.
 *
 * The badge hangs off the corner of an icon, absolutely placed. Left to size itself, its width is
 * limited by the icon it sits on, so "13" was drawn into the space of "1" and the second digit was
 * cut off. The width is therefore worked out from the figure and set outright.
 */

/** What the badge says: the count itself, or "99+" beyond two digits. */
export const badgeLabel = (count) => {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n > 99 ? '99+' : String(n);
};

/** Width in points for a badge 18 high with 10pt figures and a 2pt ring. */
export const badgeWidth = (count) => 18 + (badgeLabel(count).length - 1) * 7;
