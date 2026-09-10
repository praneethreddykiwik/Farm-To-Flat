// Creates the public "product-images" bucket in Supabase Storage (idempotent).
// Run once per project:  pnpm db:storage   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env');
  process.exit(1);
}

const BUCKET = 'product-images';
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await supabase.storage.getBucket(BUCKET);
if (existing) {
  console.log(`Bucket "${BUCKET}" already exists ✓`);
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true, // product photos are public — they show in the app + website
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  });
  if (error) {
    console.error('Could not create bucket:', error.message);
    process.exit(1);
  }
  console.log(`Created public bucket "${BUCKET}" ✓`);
}
