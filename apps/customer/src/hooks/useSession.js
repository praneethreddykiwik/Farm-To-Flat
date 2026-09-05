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
        const out = /** @type {any} */ (
          await baseQuery(
            { url: '/auth/refresh', method: 'POST', body: { refreshToken } },
            /** @type {any} */ ({ getState: () => ({ auth: { accessToken: null } }), dispatch }),
            {},
          )
        );
        if (!alive) return;
        if (out.data?.accessToken) {
          await saveRefreshToken(out.data.refreshToken);
          dispatch(signedIn({ accessToken: out.data.accessToken, customer: out.data.customer }));
        } else {
          await clearRefreshToken();
        }
      } catch {
        // fall through to signed out
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
