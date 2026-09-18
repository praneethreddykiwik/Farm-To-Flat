#!/usr/bin/env node
/**
 * Validates an EAS build profile BEFORE a build is spent on it.
 *
 * Why this exists: `apps/customer/.env` is gitignored, so EAS never uploads it. Anything the app
 * reads from `process.env.EXPO_PUBLIC_*` that is not declared in eas.json is simply absent in a
 * build. That is not a loud failure — `env.js` falls back to a placeholder Razorpay key, the
 * `keyLooksReal` test in lib/razorpay.js then reports the SDK as unavailable, and checkout ends on
 * "Payment unavailable" with the order stranded in PENDING_PAYMENT. Everything else about the app
 * looks fine, so it is easy to ship and only discover from customer complaints.
 *
 * Usage:  node scripts/preflight-env.mjs <profile>      (e.g. production, preview-live)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const profile = process.argv[2];

if (!profile) {
  console.error('Usage: node scripts/preflight-env.mjs <eas-build-profile>');
  process.exit(2);
}

const eas = JSON.parse(readFileSync(join(here, '..', 'eas.json'), 'utf8'));
const build = eas.build?.[profile];
if (!build) {
  console.error(`✗ No such build profile in eas.json: "${profile}"`);
  console.error(`  Available: ${Object.keys(eas.build || {}).join(', ')}`);
  process.exit(2);
}

const env = build.env || {};
const usesMocks = env.EXPO_PUBLIC_USE_MOCKS === '1';
const problems = [];
const warnings = [];

const need = (key, test, message) => {
  const value = env[key];
  if (value === undefined) return problems.push(`${key} is not set for "${profile}"`);
  if (test && !test(value)) problems.push(`${key} ${message} (got "${String(value).slice(0, 40)}")`);
};

// A build that runs entirely on the in-app mock server needs none of the live wiring.
if (usesMocks) {
  console.log(`✓ "${profile}" runs on the in-app mock server — no live configuration required.`);
  process.exit(0);
}

need(
  'EXPO_PUBLIC_API_URL',
  (v) => /^https?:\/\//.test(v) && !/(localhost|127\.0\.0\.1)/.test(v),
  'must be an absolute, non-localhost URL',
);
need(
  'EXPO_PUBLIC_RAZORPAY_KEY_ID',
  (v) => /^rzp_(test|live)_[A-Za-z0-9]{10,}$/.test(v) && !v.includes('xxxx'),
  'must be a real rzp_test_/rzp_live_ key — a placeholder disables checkout entirely',
);
need('EXPO_PUBLIC_SUPABASE_URL', (v) => /^https:\/\//.test(v), 'must be an https URL');
need('EXPO_PUBLIC_SUPABASE_ANON_KEY', (v) => v.length > 40, 'looks too short to be a real anon key');
need('EXPO_PUBLIC_USE_MOCKS', (v) => v === '0', 'must be "0" for a build that talks to the real API');

// Shipping a store build against the Razorpay TEST gateway takes real customers through a sandbox
// that never actually charges them. Worth stopping for, not just mentioning.
if (profile === 'production' && env.EXPO_PUBLIC_RAZORPAY_KEY_ID?.startsWith('rzp_test_')) {
  warnings.push(
    'EXPO_PUBLIC_RAZORPAY_KEY_ID is a TEST key on the "production" profile.\n' +
      '    Real customers would go through the Razorpay sandbox and no money would move.\n' +
      '    Switch to the rzp_live_ key here AND set the matching live key id + key secret on the\n' +
      '    API host before a store release. Both sides must be live, or checkout breaks.',
  );
}

for (const w of warnings) console.warn(`⚠ ${w}`);

if (problems.length) {
  console.error(`\n✗ Build profile "${profile}" is not safe to build:\n`);
  for (const p of problems) console.error(`    • ${p}`);
  console.error(
    '\n  These are read from eas.json "env" — not from .env, which is gitignored and never\n' +
      '  reaches EAS. Add them to the profile and run this again.\n',
  );
  process.exit(1);
}

console.log(`✓ Build profile "${profile}" has every public variable the app needs.`);
if (warnings.length) console.log('  (see the warning above before a store release)');
