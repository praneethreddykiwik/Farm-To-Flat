/**
 * Refuse to publish an over-the-air update with a half-filled environment.
 *
 * `eas build` runs preflight-env.mjs against the eas.json profile, so a build cannot ship
 * misconfigured. `eas update` had no equivalent — and it does not read eas.json at all. It reads
 * the EAS *environment*, which is a separate thing that nobody validates.
 *
 * That gap shipped a fully mocked app to real testers. The preview environment held only
 * EXPO_PUBLIC_API_URL and EXPO_PUBLIC_SENTRY_DSN; EXPO_PUBLIC_USE_MOCKS was simply absent, and the
 * flag used to read `!== '0'`, so absence meant ON. Builds were correct the whole time, which is
 * what made it so hard to see: the APK behaved, every update did not. Testers reported the mock
 * catalogue — three communities, stock photographs, payments that always succeed — as application
 * bugs, and they were chased as such for a day.
 *
 * The default is now opt-in, so that exact failure cannot repeat. This guards the rest of the same
 * class: an update that silently loses the API URL, the Supabase keys, or Sentry.
 *
 *   node scripts/preflight-update.mjs preview
 */
import { execFileSync } from 'node:child_process';

const environment = process.argv[2];
if (!environment) {
  console.error('usage: node scripts/preflight-update.mjs <preview|production>');
  process.exit(1);
}

/** What an update must carry, and how to recognise a value that is actually usable. */
const REQUIRED = {
  EXPO_PUBLIC_API_URL: (v) => /^https:\/\//.test(v) && !/(localhost|127\.0\.0\.1)/.test(v),
  // The one that caused it. '0' is the only value that means "talk to the real API"; anything else
  // is either mocks or a typo, and both are worth stopping for.
  EXPO_PUBLIC_USE_MOCKS: (v) => v === '0',
  EXPO_PUBLIC_SUPABASE_URL: (v) => /^https:\/\//.test(v),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: (v) => v.length > 40,
};

let raw;
try {
  raw = execFileSync('npx', ['eas-cli@latest', 'env:list', '--environment', environment], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  console.error(`✗ could not read the "${environment}" environment from EAS:\n${e.message}`);
  process.exit(1);
}

const found = new Map();
for (const line of raw.split('\n')) {
  const m = line.match(/^(EXPO_PUBLIC_[A-Z0-9_]+)=(.*)$/);
  if (m) found.set(m[1], m[2].trim());
}

const problems = [];
for (const [name, valid] of Object.entries(REQUIRED)) {
  if (!found.has(name)) {
    problems.push(`${name} is MISSING from the "${environment}" environment`);
    continue;
  }
  const value = found.get(name);
  if (!valid(value)) problems.push(`${name} is "${value}", which is not a usable value`);
}

// A variable readable by `env:list` is not necessarily readable by a build or an update: a SECRET
// one is hidden from both. Anything we cannot read here, the update cannot read either.
if (problems.length) {
  console.error(`\n✗ "${environment}" is not safe to publish an update from:\n`);
  for (const p of problems) console.error(`    • ${p}`);
  console.error(`
  Fix with, for example:
    eas env:set --environment ${environment} --name EXPO_PUBLIC_USE_MOCKS --value 0 \\
      --visibility plaintext --type string

  A variable that is SECRET is invisible to builds and updates alike — the public ones the app
  needs must be plaintext. They are public by definition: they ship inside the bundle.\n`);
  process.exit(1);
}

console.log(
  `✓ "${environment}" carries everything an update needs (${Object.keys(REQUIRED).length} variables checked).`,
);
