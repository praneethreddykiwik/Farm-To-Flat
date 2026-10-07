/**
 * Supabase, client side — read-only Storage only.
 *
 * Per the technical design the customer app talks to the /api/v1 server for everything stateful;
 * authentication and user management live there, not here. The one thing the client does directly
 * with Supabase is turn a Storage object path into a public image URL. No SDK, no auth token, no
 * writes — so there is no dependency to install and nothing secret in the bundle.
 *
 * The API already returns absolute image URLs today (Unsplash/Pexels in the mock, or a full
 * Storage URL in production), so resolveStorageImage is a no-op for those. It only does work when
 * the API hands back a bucket-relative path such as "product-images/p_palak.jpg".
 */
import { env } from './env';

/** Default bucket for product photography; overridable per call. */
const DEFAULT_BUCKET = 'product-images';

/**
 * The widths we ever ask Storage for. A short ladder on purpose: every distinct width is a separate
 * object for the CDN to cache and a separate transform for Storage to perform, so a handful of sizes
 * that many screens share beats a pixel-perfect width per device.
 *
 * Mirrors the ladder the API uses for complaint photos (apps/api/src/routes/media.js).
 */
const WIDTHS = [120, 240, 480, 960];

/** The smallest ladder width that still covers `px`. */
export function snapWidth(px) {
  const want = Math.ceil(Number(px) || 0);
  return WIDTHS.find((w) => w >= want) || WIDTHS[WIDTHS.length - 1];
}

const OBJECT_MARKER = '/storage/v1/object/public/';

/**
 * Ask Storage to render an image at a given width instead of serving the original.
 *
 * Why this exists: the API stores what `getPublicUrl()` returns, which is an absolute
 * `/object/public/` URL pointing at the file exactly as uploaded — originals up to 5 MB. Every
 * catalogue scroll was pulling those at full resolution to paint them into tiles a couple of
 * hundred pixels wide. That is the customer's mobile data, their battery, and our bandwidth bill,
 * for pixels nobody can see.
 *
 * Only our own Storage URLs are rewritten. Anything else — a stock photo in the mock catalogue, a
 * CDN URL once product images move to S3 — is returned untouched, because we cannot know that an
 * arbitrary host understands these parameters.
 *
 * @param {string|null|undefined} url
 * @param {number} width target width in device pixels; snapped to the ladder
 * @returns {string|null|undefined} the rendering URL, or the input unchanged
 */
export function renderedUrl(url, width) {
  if (!url || !env.supabaseUrl || !String(url).startsWith(env.supabaseUrl)) return url;
  const i = String(url).indexOf(OBJECT_MARKER);
  if (i === -1) return url; // already a render URL, or a private object path
  const objectPath = String(url).slice(i + OBJECT_MARKER.length);
  const w = snapWidth(width);
  return `${env.supabaseUrl}/storage/v1/render/image/public/${objectPath}?width=${w}&quality=70&resize=contain`;
}

/** True for values the client should use as-is (already a full URL, or a data/blob URI). */
function isAbsolute(value) {
  return /^(https?:|data:|blob:|file:)/i.test(value);
}

/**
 * Public URL for an object in a public Storage bucket.
 * @param {string} path object path, optionally prefixed with the bucket (e.g. "product-images/x.jpg")
 * @param {string} [bucket] bucket name when `path` is not already prefixed
 * @returns {string|null} the public URL, or null if Supabase is not configured
 */
export function storagePublicUrl(path, bucket = DEFAULT_BUCKET) {
  if (!path || !env.supabaseUrl) return null;
  const clean = String(path).replace(/^\/+/, '');
  // Allow either "bucket/key" or a bare "key" with the bucket passed separately.
  const full = clean.includes('/') ? clean : `${bucket}/${clean}`;
  return `${env.supabaseUrl}/storage/v1/object/public/${full}`;
}

/**
 * Resolve whatever the API put in a product's `image` field to something <Image> can load.
 * Absolute URLs pass through unchanged; a Storage path becomes a public URL; anything unusable
 * (empty, or a path with Supabase unconfigured) returns null so the caller shows its fallback.
 * @param {string|null|undefined} value
 * @param {string} [bucket]
 * @returns {string|null}
 */
export function resolveStorageImage(value, bucket = DEFAULT_BUCKET, width) {
  if (!value) return null;
  const url = isAbsolute(value) ? value : storagePublicUrl(value, bucket);
  // A width is optional so existing callers keep working; without one the original is served.
  return width ? renderedUrl(url, width) : url;
}
