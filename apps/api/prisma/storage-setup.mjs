// Creates the public "product-images" bucket in Supabase Storage (idempotent).
// Run once per project:  pnpm db:storage   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/api/.env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

const BUCKETS = [
  // Product photos are public — they show in the app and on the website.
  { name: 'product-images', public: true, fileSizeLimit: '5MB', allowedMimeTypes: MIME },
  // Complaint photographs are NOT. They are taken inside someone's home or at their door and are
  // attached to a named order with an address on it, so they are reachable only through a
  // short-lived signed link the API issues (see lib/storage.js). This bucket used to be created
  // implicitly at first upload, public and with no limits at all.
  { name: 'order-issues', public: false, fileSizeLimit: '6MB', allowedMimeTypes: MIME },
];

for (const { name, ...opts } of BUCKETS) {
  const { data: existing } = await supabase.storage.getBucket(name);
  if (existing) {
    // Already there: make sure it matches what it is supposed to be. A bucket created by the old
    // implicit path is PUBLIC, and leaving it that way would quietly keep every photo world-readable.
    if (existing.public !== opts.public) {
      const { error } = await supabase.storage.updateBucket(name, opts);
      if (error) {
        console.error(`Could not update bucket "${name}":`, error.message);
        process.exit(1);
      }
      console.log(`Bucket "${name}" → ${opts.public ? 'public' : 'PRIVATE'} ✓`);
    } else {
      console.log(`Bucket "${name}" already correct (${opts.public ? 'public' : 'private'}) ✓`);
    }
    continue;
  }
  const { error } = await supabase.storage.createBucket(name, opts);
  if (error) {
    console.error(`Could not create bucket "${name}":`, error.message);
    process.exit(1);
  }
  console.log(`Created ${opts.public ? 'public' : 'PRIVATE'} bucket "${name}" ✓`);
}
