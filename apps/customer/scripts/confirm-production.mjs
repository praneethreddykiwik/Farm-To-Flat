#!/usr/bin/env node
/**
 * Gate in front of `pnpm --filter customer update:production`.
 *
 * Why (review #50, 21 Nov 2026): that script runs `eas channel:edit production --branch preview-live`,
 * which points EVERY installed store build at whatever was last published to preview-live — at once,
 * with no rollout. It was one keystroke away from `update:preview`. It now says what it will do and
 * stops unless CONFIRM_PRODUCTION=yes is set.
 *
 *   CONFIRM_PRODUCTION=yes pnpm --filter customer update:production
 */
const plan = `
  update:production will:
    1. check the EAS "production" environment (scripts/preflight-update.mjs production)
    2. run: eas channel:edit production --branch preview-live
       → every production install picks up the latest preview-live update on its next launch.
       Undo by pointing the channel back at the previous branch (eas channel:edit production --branch <old>).
`;

if (process.env.CONFIRM_PRODUCTION !== 'yes') {
  console.error(plan);
  console.error('✗ Refused: set CONFIRM_PRODUCTION=yes to go ahead. Nothing was changed.\n');
  process.exit(1);
}

console.log(plan);
console.log('✓ CONFIRM_PRODUCTION=yes — continuing.');
