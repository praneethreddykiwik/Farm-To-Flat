// Supabase Storage — product image uploads. Uses the SERVER-side service-role key (never the app),
// so uploads are controlled by the API, not exposed to the browser. Public bucket: the returned URL
// shows directly in the app + admin. No-op-safe when Storage isn't configured.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'product-images';

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
