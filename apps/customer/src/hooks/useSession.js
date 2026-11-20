import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bootFinished, selectAuth, signedIn, signedOut } from '../features/auth/authSlice';
import { clearRefreshToken, readRefreshToken } from '../features/auth/secure';
import { api, useLogoutMutation } from '../api/api';
import { refreshSessionShared } from '../api/baseQuery';
import { currentPushToken } from '../lib/notifications';

/**
 * Restores a session from the refresh token on cold start (one rotation). Used once in the root layout.
 */
export function useSessionBootstrap() {
  const dispatch = useDispatch();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const refreshToken = await readRefreshToken();
        if (!refreshToken) return;
        // Timeout so a cold/hanging Render server can't freeze the splash forever, and ONLY delete the
        // 30-day refresh token on a DEFINITIVE 401 (genuinely expired). A transient/timeout/5xx/cold-start
        // failure must PRESERVE the token — deleting it here was a permanent sign-out that dumped users
        // back to the OTP screen every time they opened the app while the server was waking up.
        // The SAME in-flight refresh as everything else in the app (review #40): a separate one here
        // raced the first screen's own 401-refresh, spent the single-use token twice, and the loser
        // signed the customer out. The shared one saves the rotated token and signs out only on a
        // definite 401 itself.
        const shared = refreshSessionShared({ dispatch });
        const out = /** @type {any} */ (
          await Promise.race([
            shared,
            new Promise((res) => setTimeout(() => res('TIMEOUT'), 22000)),
          ])
        );
        if (!alive) return;
        if (out && out !== 'TIMEOUT' && out.accessToken) {
          dispatch(signedIn({ accessToken: out.accessToken, customer: out.customer }));
        } else if (out === 'TIMEOUT') {
          // A slow wake. Keep going in the background: when the server answers, sign them in
          // where they are instead of leaving them on the sign-in screen until the next launch.
          shared.then((late) => {
            if (alive && late?.accessToken)
              dispatch(signedIn({ accessToken: late.accessToken, customer: late.customer }));
          });
        }
      } catch {
        // network throw — keep the token, fall through to signed out for this launch
      } finally {
        if (alive) dispatch(bootFinished());
      }
    })();
    return () => {
      alive = false;
    };
  }, [dispatch]);
}

export function useSignOut() {
  const dispatch = useDispatch();
  const [logout] = useLogoutMutation();
  return async () => {
    try {
      await logout({ expoPushToken: currentPushToken() }).unwrap();
    } catch {}
    await clearRefreshToken();
    dispatch(signedOut({ reason: 'user' }));
    dispatch(api.util.resetApiState());
  };
}

export function useAuthState() {
  return useSelector(selectAuth);
}
