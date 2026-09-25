// Supabase Storage — product images, and the photographs customers send when something in the bag
// is wrong. Uses the SERVER-side service-role key (never the app), so uploads are controlled by the
// API rather than exposed to the client. No-op-safe when Storage isn't configured.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'product-images';
// A customer's complaint photo is evidence about a specific order, not catalog art — its own bucket
// keeps the two from being confused, and lets the retention rules differ later.
const ISSUE_BUCKET = 'order-issues';

export const storageEnabled = !!(URL && KEY);
const supabase = storageEnabled
  ? createClient(URL, KEY, { auth: { persistSession: false } })
  : null;

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
export const allowedImageTypes = Object.keys(EXT);

/** Upload one image buffer, return its public URL. */
export async function uploadProductImage({ buffer, contentType }) {
  if (!supabase) throw new Error('Storage not configured');
  const ext = EXT[contentType] || 'jpg';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

/**
 * Upload one photograph attached to an order complaint, and return its OBJECT PATH — not a URL.
 *
 * Complaint photographs are private. They are taken inside someone's home or at their door, and they
 * are attached to a named order with an address on it. They used to land in a PUBLIC bucket and be
 * stored as permanent public URLs, so anyone holding a link could fetch one with no login at all,
 * forever. Storing the path instead means the only way to see a photo is to ask the API for a
 * short-lived signed link, which it hands out only to the customer who sent it and to the operator.
 *
 * Filed under the order so a reviewer can tell at a glance which delivery it belongs to.
 */
export async function uploadIssuePhoto({ buffer, contentType, orderId }) {
  if (!supabase) throw new Error('Storage not configured');
  const ext = EXT[contentType] || 'jpg';
  const name = `${orderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  let { error } = await supabase.storage
    .from(ISSUE_BUCKET)
    .upload(name, buffer, { contentType, upsert: false });
  if (error && /not found/i.test(error.message || '')) {
    // Created private, with the same limits the product bucket gets from storage-setup.mjs. The
    // first version of this created it `public: true` with no limits at all.
    await supabase.storage
      .createBucket(ISSUE_BUCKET, {
        public: false,
        fileSizeLimit: '6MB',
        allowedMimeTypes: allowedImageTypes,
      })
      .catch(() => {});
    ({ error } = await supabase.storage
      .from(ISSUE_BUCKET)
      .upload(name, buffer, { contentType, upsert: false }));
  }
  if (error) throw error;
  return name;
}

/** How long a complaint-photo link lives. Long enough to look at it, short enough to be useless if
 *  it leaks out of the panel into a chat or a screenshot. */
const ISSUE_URL_TTL_SECONDS = 60 * 60;

/**
 * An already-stored photo reference → the object path inside the issues bucket.
 *
 * Photos uploaded before this change were stored as full public URLs. Rather than rewrite those rows
 * (and break every one of them if the rewrite half-ran), the path is recovered from the URL. Anything
 * that is already a bare path is returned untouched.
 */
export function issuePhotoPath(ref) {
  const s = String(ref || '');
  if (!s.startsWith('http')) return s;
  const marker = `/${ISSUE_BUCKET}/`;
  const at = s.indexOf(marker);
  return at === -1 ? '' : decodeURIComponent(s.slice(at + marker.length).split('?')[0]);
}

/**
 * Turn stored photo references into links the caller can actually open, signed and expiring.
 *
 * Returns `[]` rather than throwing when storage is off or signing fails: a complaint whose photos
 * cannot be signed right now must still be readable — the customer's written words are the rest of
 * the report, and losing the whole screen over a storage hiccup helps nobody.
 * @param {string[]} refs
 * @returns {Promise<string[]>}
 */
export async function signIssuePhotos(refs) {
  if (!supabase || !refs?.length) return [];
  const paths = refs.map(issuePhotoPath).filter(Boolean);
  if (!paths.length) return [];
  try {
    const { data, error } = await supabase.storage
      .from(ISSUE_BUCKET)
      .createSignedUrls(paths, ISSUE_URL_TTL_SECONDS);
    if (error) throw error;
    return (data || []).map((d) => d.signedUrl).filter(Boolean);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[storage] could not sign complaint photos:', e?.message || e);
    return [];
  }
}

/**
 * Sign the complaint photos on an already-serialised order, or on a list of them, in place.
 *
 * Serialisers are synchronous and signing is a network call, so this runs in the route after the
 * shape is built. One call per response rather than per photo: a day's orders can carry dozens of
 * photographs and signing them one at a time turned a list into a storm of requests.
 * @template {{ issues?: any[] }} T
 * @param {T|T[]} orders
 * @returns {Promise<T|T[]>} the same object(s), mutated
 */
export async function signOrderIssuePhotos(orders) {
  const list = Array.isArray(orders) ? orders : [orders];
  const issues = list.flatMap((o) => o?.issues || []).filter((i) => i?.photos?.length);
  if (!issues.length) return orders;
  // Flatten every photo across every issue into ONE signing call, then hand the links back out in
  // the order they were collected.
  const counts = issues.map((i) => i.photos.length);
  const refs = issues.flatMap((i) => i.photos);
  const signed = await signIssuePhotos(refs);
  // Signing is all-or-nothing per call, so a short result means it failed; handing back partial,
  // misaligned links would attach one complaint's photograph to another's, which is worse than none.
  if (signed.length !== refs.length) {
    for (const i of issues) i.photos = [];
    return orders;
  }
  // Counts captured BEFORE the loop: reading `i.photos.length` after reassigning it walks the offset.
  let at = 0;
  issues.forEach((i, n) => {
    i.photos = signed.slice(at, at + counts[n]);
    at += counts[n];
  });
  return orders;
}
