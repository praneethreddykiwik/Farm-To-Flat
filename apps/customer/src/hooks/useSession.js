import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { bootFinished, selectAuth, signedIn, signedOut } from '../features/auth/authSlice';
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from '../features/auth/secure';
import { api, useLogoutMutation } from '../api/api';
import { baseQuery } from '../api/baseQuery';

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
        const out = /** @type {any} */ (
          await Promise.race([
            baseQuery(
              { url: '/auth/refresh', method: 'POST', body: { refreshToken } },
              /** @type {any} */ ({ getState: () => ({ auth: { accessToken: null } }), dispatch }),
              {},
            ),
            new Promise((res) => setTimeout(() => res({ error: { status: 'TIMEOUT' } }), 22000)),
          ])
        );
        if (!alive) return;
        if (out.data?.accessToken) {
          await saveRefreshToken(out.data.refreshToken);
          dispatch(signedIn({ accessToken: out.data.accessToken, customer: out.data.customer }));
        } else if (out.error?.status === 401) {
          await clearRefreshToken(); // token is genuinely invalid → sign out cleanly
        }
        // else (timeout / 0 / 5xx): keep the token; this launch stays signed out but the next retries.
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
      await logout().unwrap();
    } catch {}
    await clearRefreshToken();
    dispatch(signedOut());
    dispatch(api.util.resetApiState());
  };
}

export function useAuthState() {
  return useSelector(selectAuth);
}
