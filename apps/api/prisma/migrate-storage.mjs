#!/usr/bin/env node
/**
 * Copy every stored object from Supabase Storage to S3.
 *
 * Run this BEFORE flipping STORAGE_DRIVER=s3. It only ever reads from Supabase and writes to S3 —
 * it deletes nothing, so the old copy stays as the rollback, and running it twice is harmless
 * (the second pass overwrites each object with the same bytes).
 *
 * Nothing in the database has to change. Objects are referenced by PATH everywhere, and the API
 * serves them from its own origin, so after the copy the only change is which store the API reads
 * from — no row, no app build, no deployed client.
 *
 *   DRY RUN (default, lists what would move):
 *     node prisma/migrate-storage.mjs
 *   FOR REAL:
 *     node prisma/migrate-storage.mjs --go
 *
 * Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, S3_BUCKET, AWS_REGION,
 *        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { s3Enabled, s3Put } from '../src/lib/s3.js';

const GO = process.argv.includes('--go');
const BUCKETS = ['product-images', 'order-issues'];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}
if (GO && !s3Enabled()) {
  console.error('S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for --go.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Walk a bucket, including the per-order folders inside order-issues. */
async function* walk(bucket, prefix = '') {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
  for (const entry of data || []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Supabase reports folders as rows with no id.
    if (entry.id === null || entry.id === undefined) yield* walk(bucket, path);
    else yield path;
  }
}

let moved = 0;
let failed = 0;
let bytes = 0;

for (const bucket of BUCKETS) {
  console.log(`\n── ${bucket} ───────────────────────────────`);
  let n = 0;
  try {
    for await (const path of walk(bucket)) {
      n += 1;
      if (!GO) {
        console.log(`  would copy  ${bucket}/${path}`);
        continue;
      }
      try {
        const { data, error } = await supabase.storage.from(bucket).download(path);
        if (error || !data) throw new Error(error?.message || 'empty body');
        const buf = Buffer.from(await data.arrayBuffer());
        await s3Put(`${bucket}/${path}`, buf, data.type || 'application/octet-stream');
        moved += 1;
        bytes += buf.length;
        console.log(`  copied      ${bucket}/${path}  (${(buf.length / 1024).toFixed(0)} KB)`);
      } catch (e) {
        failed += 1;
        console.error(`  FAILED      ${bucket}/${path}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error(`  could not list ${bucket}: ${e.message}`);
  }
  console.log(`  ${n} object(s) found`);
}

console.log(
  GO
    ? `\nCopied ${moved} object(s), ${(bytes / 1024 / 1024).toFixed(1)} MB. ${failed} failed.`
    : '\nDry run — nothing was written. Re-run with --go to copy.',
);
if (GO && failed) {
  console.error('Some objects did not copy. Fix those before switching STORAGE_DRIVER.');
  process.exit(1);
}
if (GO)
  console.log('Now set STORAGE_DRIVER=s3 on the API and redeploy. Supabase stays as rollback.');
