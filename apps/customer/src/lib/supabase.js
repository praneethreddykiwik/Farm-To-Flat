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
export function resolveStorageImage(value, bucket = DEFAULT_BUCKET) {
  if (!value) return null;
  if (isAbsolute(value)) return value;
  return storagePublicUrl(value, bucket);
}
