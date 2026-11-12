/**
 * Meal photographs are kept for a fixed number of days and then deleted; the numbers they produced
 * stay. A photo of someone's dinner has done its job once it has been read, and personal data that
 * has served its purpose should not be kept (DPDP Act 2023, storage limitation). The app tells the
 * customer the same number — see MEAL_PHOTO_RETENTION_DAYS in routes/meals.js.
 */
import { IS_TEST } from './env.js';
import { expireMealPhotos } from '../customer-store.js';
import { deleteMealPhotos } from './storage.js';

const DAY_MS = 86400000;

/** The earliest date whose photos are still kept, in IST (the customer's day). */
export function retentionCutoff(now, days) {
  const ist = new Date(now.getTime() + 330 * 60000 - days * DAY_MS);
  return ist.toISOString().slice(0, 10);
}

/** Delete every stored meal photo older than the retention window. @returns {Promise<number>} photos removed */
export async function sweepMealPhotos(days, now = new Date()) {
  const keys = expireMealPhotos(retentionCutoff(now, days));
  if (!keys.length) return 0;
  await deleteMealPhotos(keys);
  return keys.length;
}

export function startMealRetention(days) {
  if (IS_TEST) return;
  const run = () =>
    sweepMealPhotos(days).catch((e) =>
      // eslint-disable-next-line no-console
      console.error('[meals] photo retention sweep failed:', e?.message || e),
    );
  setTimeout(run, 5 * 60 * 1000).unref(); // once, shortly after boot
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}
