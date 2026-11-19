/**
 * The app-store listings, in one place so the landing page, /join and /go (a promoter's QR, a
 * WhatsApp post, a neighbour's invite) always point at the same listing. Empty means "not live
 * yet" and the badges say "launching shortly" instead of linking.
 */
export const APP_STORE_URL = '';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=in.fooducia.customer';

/**
 * The tag on a /go link, cleaned to what the API accepts: letters, digits, _ and -.
 *   src  where the link was shared: counter, whatsapp, referral, resident_group…
 *   p    promoter code (counter QR)     c  community slug     r  a neighbour's invite code
 */
export function readTag(search) {
  const q = new URLSearchParams(search);
  const part = (k) =>
    String(q.get(k) || '')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 40);
  const tag = {
    src: part('src').toLowerCase(),
    p: part('p').toUpperCase(),
    c: part('c').toLowerCase(),
    r: part('r').toUpperCase(),
  };
  // An old /join?code=… link: the code is a promoter or an invite — the API tells them apart.
  const code = part('code').toUpperCase();
  if (code && !tag.p && !tag.r) tag[code.startsWith('NB') ? 'r' : 'p'] = code;
  return tag;
}

/**
 * The Play Store link that carries the tag through the install: Google hands `referrer` to the app
 * on its first open (the Play Install Referrer API), so a scan at the counter is credited without
 * anyone typing a code.
 */
export function playUrlFor(tag) {
  if (!PLAY_STORE_URL) return '';
  const ref = new URLSearchParams();
  for (const k of ['src', 'p', 'c', 'r']) if (tag[k]) ref.set(k, tag[k]);
  const s = ref.toString();
  return s ? `${PLAY_STORE_URL}&referrer=${encodeURIComponent(s)}` : PLAY_STORE_URL;
}

/** The public link a counter QR or a WhatsApp post uses. */
export const goUrl = (tag) => {
  const q = new URLSearchParams();
  for (const k of ['src', 'p', 'c', 'r']) if (tag[k]) q.set(k, tag[k]);
  return `https://fooducia.health/go?${q.toString()}`;
};
