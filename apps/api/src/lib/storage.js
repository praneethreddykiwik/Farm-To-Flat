// Supabase Storage — product images, and the photographs customers send when something in the bag
// is wrong. Uses the SERVER-side service-role key (never the app), so uploads are controlled by the
// API rather than exposed to the client. No-op-safe when Storage isn't configured.
import { createClient } from '@supabase/supabase-js';
import { mediaUrl } from './media.js';
import { s3Enabled, s3Get, s3Put } from './s3.js';

/**
 * Which object store is in use.
 *
 * Everything the platform stores is referenced by PATH, never by a provider URL, and every read now
 * goes out through this API rather than straight to the provider — so moving to S3 changes these
 * three functions and nothing else: no stored row, no client, no deployed app build. Set
 * STORAGE_DRIVER=s3 with the AWS credentials and the objects migrated (scripts/migrate-storage.mjs).
 */
const DRIVER = (process.env.STORAGE_DRIVER || 'supabase').toLowerCase();
const useS3 = () => DRIVER === 's3' && s3Enabled();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'product-images';
// A customer's complaint photo is evidence about a specific order, not catalog art — its own bucket
// keeps the two from being confused, and lets the retention rules differ later.
const ISSUE_BUCKET = 'order-issues';

export const storageEnabled = !!(URL && KEY) || (DRIVER === 's3' && s3Enabled());
const supabase = storageEnabled
  ? createClient(URL, KEY, { auth: { persistSession: false } })
  : null;

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
export const allowedImageTypes = Object.keys(EXT);

/** Upload one image buffer, return its public URL. */
export async function uploadProductImage({ buffer, contentType }) {
  const ext = EXT[contentType] || 'jpg';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  if (useS3()) {
    await s3Put(`${BUCKET}/${name}`, buffer, contentType);
    // Public bucket or CDN in front of it; S3_PUBLIC_BASE is whichever one serves them.
    const base = (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, '');
    if (!base) throw new Error('S3_PUBLIC_BASE is required to serve product images from S3');
    return `${base}/${BUCKET}/${name}`;
  }
  if (!supabase) throw new Error('Storage not configured');
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
  const ext = EXT[contentType] || 'jpg';
  const name = `${orderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  if (useS3()) return s3Put(`${ISSUE_BUCKET}/${name}`, buffer, contentType).then(() => name);
  if (!supabase) throw new Error('Storage not configured');
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

/**
 * How long a complaint-photo link lives. Long enough to look at it, short enough to be useless if
 * it leaks out of the panel into a chat or a screenshot.
 *
 * An hour was too short for the way the panel is actually used. The complaints queue is a screen an
 * operator leaves open while working through the day, and every photograph on it broke silently
 * once the signatures aged out — the rows still listed photos, so the page showed broken thumbnails
 * rather than anything that explained itself. A working day covers a shift without making a leaked
 * link useful tomorrow; the panel also refetches on a broken image, so an aged link repairs itself.
 */
const ISSUE_URL_TTL_SECONDS = 8 * 60 * 60;

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
 * Read one stored object back, so the API can serve it itself.
 *
 * This is the ONE read path for complaint photographs now, which is also what makes moving to S3 a
 * small change rather than a rewrite: the browser never talks to the storage provider, so swapping
 * the provider swaps this function and the upload beside it, and nothing else.
 *
 * @returns {Promise<{ buffer: Buffer, contentType: string } | null>}
 */
export async function downloadIssuePhoto(path) {
  if (!path) return null;
  if (useS3()) return s3Get(`${ISSUE_BUCKET}/${path}`);
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(ISSUE_BUCKET).download(path);
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error(`[storage] could not read ${path}: ${error?.message || 'no body'}`);
    return null;
  }
  return {
    buffer: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || 'application/octet-stream',
  };
}

/**
 * Rewrite the photo references on an already-serialised order — or a list of them — into links the
 * browser can actually load: our own media route, not the storage provider's.
 *
 * This used to mint Supabase signed URLs, which meant every photograph only appeared if the reader's
 * network could reach Supabase. On at least one large Indian ISP it cannot (see lib/media.js), so
 * the whole complaints queue showed broken thumbnails. Pointing at this API instead removes that
 * dependency entirely — and, incidentally, removes a network round trip per response, because
 * minting a token is local work where signing was a call to the provider.
 *
 * Serialisers are synchronous, so this runs in the route once the shape is built.
 *
 * @template {{ issues?: any[] }} T
 * @param {T|T[]} orders
 * @param {string} baseUrl  the origin this request arrived on
 * @returns {T|T[]} the same object(s), mutated
 */
export function linkOrderIssuePhotos(orders, baseUrl) {
  const list = Array.isArray(orders) ? orders : [orders];
  for (const o of list) {
    for (const i of o?.issues || []) {
      if (!i?.photos?.length) continue;
      i.photos = i.photos
        .map(issuePhotoPath)
        .filter(Boolean)
        .map((path) => mediaUrl(baseUrl, path));
    }
  }
  return orders;
}
