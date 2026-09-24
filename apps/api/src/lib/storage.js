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
 * Upload one photograph attached to an order complaint.
 *
 * Filed under the order so a reviewer can see at a glance which delivery it belongs to, and the
 * bucket is created on first use rather than requiring a manual setup step before the feature works.
 */
export async function uploadIssuePhoto({ buffer, contentType, orderId }) {
  if (!supabase) throw new Error('Storage not configured');
  const ext = EXT[contentType] || 'jpg';
  const name = `${orderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  let { error } = await supabase.storage
    .from(ISSUE_BUCKET)
    .upload(name, buffer, { contentType, upsert: false });
  if (error && /not found/i.test(error.message || '')) {
    await supabase.storage.createBucket(ISSUE_BUCKET, { public: true }).catch(() => {});
    ({ error } = await supabase.storage
      .from(ISSUE_BUCKET)
      .upload(name, buffer, { contentType, upsert: false }));
  }
  if (error) throw error;
  return supabase.storage.from(ISSUE_BUCKET).getPublicUrl(name).data.publicUrl;
}
