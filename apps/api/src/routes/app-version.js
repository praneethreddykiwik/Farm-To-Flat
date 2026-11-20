/**
 * GET /api/v1/app/version — the oldest app version still allowed to run (review #45, 21 Nov 2026).
 *
 * There was no way to retire an old build: a version with a known bug (or one that talks to an API
 * shape we have since changed) kept working until each customer happened to update. The owner sets
 * MIN_APP_VERSION on the server (e.g. "0.2.0"); an older app shows an "Update Fooducia" screen with
 * a store button. Unset — the default — blocks nobody. Public: the app asks before sign-in.
 */
import { Router } from 'express';

export const appVersionRouter = Router();

const SEMVER = /^\d+\.\d+\.\d+$/;
const clean = (v) => (v && SEMVER.test(String(v).trim()) ? String(v).trim() : null);

appVersionRouter.get('/version', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    minVersion: clean(process.env.MIN_APP_VERSION),
    storeUrl: {
      ios: 'https://apps.apple.com/app/id6837415422',
      android: 'https://play.google.com/store/apps/details?id=in.fooducia.customer',
    },
  });
});
