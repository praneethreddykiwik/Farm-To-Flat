/**
 * Keep the Supabase host out of customer-facing responses.
 *
 * Product images live in a public Supabase Storage bucket, and the stored `image` field is the raw
 * `https://<ref>.supabase.co/storage/v1/object/public/product-images/<file>` URL. Serving that to the
 * app advertises the Supabase project on an unauthenticated endpoint (`GET /catalog`), and it is also
 * the URL some Indian ISPs hijack (see routes/img.js). Both problems go away if the client never sees
 * the Supabase host: we rewrite every customer-facing product image to our own Cloudflare-fronted
 * proxy at `/api/v1/img/<key>`, which fetches from Supabase server-side.
 *
 * This mirrors the rewrite the apps used to do client-side (customer supabase.js, admin ui.jsx) —
 * moving it here means the host stays on the server. The admin serializer is deliberately NOT routed
 * through this: the operator console needs the real storage URL to manage images.
 *
 * PUBLIC_API_URL defaults to the production origin; override it per environment if the public API
 * host ever changes. Anything that is not a Supabase product-image URL (a stock photo, a data URI, an
 * already-proxied `/api/v1/img` URL) is returned untouched.
 */
export const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || 'https://api.fooducia.in').replace(
  /\/$/,
  '',
);

const OBJECT_MARKER = '/storage/v1/object/public/product-images/';
const RENDER_MARKER = '/storage/v1/render/image/public/product-images/';

/**
 * Rewrite a Supabase product-image URL to our own image proxy.
 * @param {string|null|undefined} url the stored image URL
 * @param {number} [width] render width; the proxy snaps to its own ladder (default 480)
 * @returns {string|null} the proxied URL, the input unchanged if it is not a Supabase product image,
 *   or null for an empty input (so callers keep their existing null-fallback behaviour)
 */
export function proxyImageUrl(url, width = 480) {
  if (!url || typeof url !== 'string') return url ?? null;
  let i = url.indexOf(OBJECT_MARKER);
  let markerLen = OBJECT_MARKER.length;
  if (i === -1) {
    i = url.indexOf(RENDER_MARKER);
    markerLen = RENDER_MARKER.length;
  }
  if (i === -1) return url; // not a Supabase product image — leave it exactly as-is
  // The key is the bare filename after the bucket; drop any query string and stray path segments so
  // it matches the proxy's strict KEY_RE (no slashes, no traversal).
  const key = url
    .slice(i + markerLen)
    .split('?')[0]
    .split('/')[0];
  return `${PUBLIC_API_URL}/api/v1/img/${key}?w=${width}&v=2`;
}
