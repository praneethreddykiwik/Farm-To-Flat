import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLazyMealPlanQuery, useMealPlanSaveMutation } from '../api/api';
import { selectAuth } from '../features/auth/authSlice';
import {
  planHydrated,
  selectPlanOwner,
  selectPlanUpdatedAt,
  selectProfile,
  selectScheduled,
} from '../features/plan/planSlice';
import { selectAiVisible } from '../features/role/roleSlice';

/**
 * Keeps the diet plan, its calendar and the profile behind the daily target saved on the server.
 *
 * They used to live only on this phone: a reinstall or a second phone started empty, and the
 * server could not put the plan's numbers next to what was eaten. Now:
 *   - on sign-in (and each launch) the server copy is fetched, and whichever copy changed last wins;
 *   - every later change is sent ~1.5 s after it settles, newest-first on the server too (an older
 *     phone that comes back online gets the newer copy instead of overwriting it).
 *
 * Same audience as the tracker and the planner (super-admin, for now). Mounted once, at the root.
 */
export function usePlanSync() {
  const dispatch = useDispatch();
  const signedIn = useSelector(selectAuth).status === 'signedIn';
  const me = useSelector(selectAuth).customer?.id || null;
  const owner = useSelector(selectPlanOwner);
  // Only ever send a plan that belongs to the account signed in now (review #35).
  const enabled = useSelector(selectAiVisible) && signedIn && !!me && owner === me;
  const profile = useSelector(selectProfile);
  const scheduled = useSelector(selectScheduled);
  const updatedAt = useSelector(selectPlanUpdatedAt);
  const [fetchPlan] = useLazyMealPlanQuery();
  const [save] = useMealPlanSaveMutation();
  const ready = useRef(false); // the first comparison with the server has happened
  const lastSent = useRef(/** @type {string|null} */ (null));

  // 1. On sign-in: compare with the server copy once.
  useEffect(() => {
    if (!enabled) {
      ready.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchPlan().unwrap();
        if (cancelled) return;
        const remote = r?.plan;
        const localHasPlan = (scheduled || []).length > 0 || !!profile?.age;
        if (remote?.updatedAt && (!updatedAt || remote.updatedAt > updatedAt || !localHasPlan)) {
          lastSent.current = remote.updatedAt;
          dispatch(planHydrated(remote));
        }
      } catch {
        // offline or not allowed: carry on with the copy on the phone and try to send it below
      } finally {
        if (!cancelled) ready.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only on sign-in / role change: later edits go out through effect 2.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // 2. Every change after that: send the whole document, once it has settled.
  useEffect(() => {
    if (!enabled || !updatedAt || updatedAt === lastSent.current) return undefined;
    const timer = setTimeout(async () => {
      if (!ready.current) return; // the comparison above will decide first
      try {
        await save({ profile, scheduled, updatedAt }).unwrap();
        lastSent.current = updatedAt;
      } catch (e) {
        // 409: the server has a newer copy (another phone) — take it.
        const newer = /** @type {any} */ (e)?.data?.plan;
        if (/** @type {any} */ (e)?.status === 409 && newer) {
          lastSent.current = newer.updatedAt;
          dispatch(planHydrated(newer));
        }
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [enabled, updatedAt, profile, scheduled, save, dispatch]);
}
