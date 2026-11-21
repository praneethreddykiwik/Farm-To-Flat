#!/usr/bin/env node
/**
 * `pnpm --filter api db:reset` — drops every table, re-creates the schema and re-seeds.
 *
 * Why a guard (review #50, 21 Nov 2026): the script used to be a bare
 * `prisma db push --force-reset --accept-data-loss`, and Prisma resets whatever DATABASE_URL points
 * at. apps/api/.env is the same file that is used to talk to the hosted database, so one stale .env
 * or one exported variable in the wrong terminal and the reset wipes production orders. It now runs
 * only when you say so (CONFIRM_RESET=yes) AND the target does not look like a hosted database.
 *
 * The URLs are never printed — only which variable failed the check — so the output is safe to paste.
 *
 *   CONFIRM_RESET=yes pnpm --filter api db:reset
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Hosts we deploy to. A reset against any of them is never what a developer meant. */
const HOSTED = [
  /supabase\.(co|com)$/,
  /pooler/,
  /render\.com$/,
  /neon\.tech$/,
  /amazonaws\.com$/,
  /prod/,
];

const refuse = (why) => {
  console.error(`✗ db:reset refused: ${why}`);
  console.error('  Nothing was changed. See apps/api/scripts/guard-db-reset.mjs.');
  process.exit(1);
};

if (process.env.CONFIRM_RESET !== 'yes') {
  refuse('this DROPS EVERY TABLE. Re-run with CONFIRM_RESET=yes if that is what you want.');
}

// What Prisma will actually use: a variable already in the environment wins over apps/api/.env,
// which Prisma loads itself. Read the file the same way so the check sees the same target.
const fromFile = existsSync(join(apiDir, '.env'))
  ? parseEnv(readFileSync(join(apiDir, '.env'), 'utf8'))
  : {};
const effective = (name) => process.env[name] ?? fromFile[name];

/** Returns null when the URL is safe to reset, else a reason that does not include the URL. */
const problemWith = (name) => {
  const raw = effective(name);
  if (!raw) return name === 'DATABASE_URL' ? 'DATABASE_URL is not set' : null;
  let host;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return `${name} is not a parseable URL`;
  }
  if (HOSTED.some((re) => re.test(host))) return `${name} points at a hosted database`;
  return null;
};

for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
  const problem = problemWith(name);
  if (problem) refuse(`${problem}. Resets are for a local database only.`);
}

console.log('✓ db:reset: confirmed, and the target is not a hosted database. Resetting…');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: apiDir, stdio: 'inherit' });
run('prisma', ['db', 'push', '--force-reset', '--accept-data-loss']);
run('node', ['--env-file=.env', 'prisma/seed.mjs']);
