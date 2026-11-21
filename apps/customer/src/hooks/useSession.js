import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  bootFinished,
  bootReconnecting,
  selectAuth,
  signedIn,
  signedOut,
} from '../features/auth/authSlice';
import { restoreSession } from '../features/auth/restoreSession';
import { clearRefreshToken, readRefreshToken, saveRefreshToken } from '../features/auth/secure';
import { api, useLogoutMutation } from '../api/api';
import { lastRefreshOutcome, refreshSessionShared } from '../api/baseQuery';
import { currentPushToken } from '../lib/notifications';

/** Cuts short the wait between reconnect attempts ("Try again" on the reconnecting screen). */
let wakeRetry = () => {};
export function retrySessionNow() {
  wakeRetry();
}

/**
 * Restores a session from the refresh token on cold start. Used once in the root layout.
 *
 * Review #41 (21 Nov 2026): this used to race one refresh against a 22 s timer and finish booting
 * signed out when the timer won, so a slow network showed a signed-in customer the login screen.
 * The rules now live in features/auth/restoreSession.js: keep retrying through transient failures
 * (status 'reconnecting' after a few seconds), and only a 401 from the refresh signs out.
 */
export function useSessionBootstrap() {
  const dispatch = useDispatch();
  useEffect(() => {
    let alive = true;
    restoreSession({
      readToken: readRefreshToken,
      // Through the app's ONE shared refresh (review #40): a separate refresh here raced the first
      // screen's own 401-refresh and spent the single-use token twice. The shared one saves the
      // rotated token itself; its outcome tells restoreSession whether to retry or sign out.
      refresh: async () => {
        const data = await refreshSessionShared({ dispatch });
        if (data?.accessToken) return { data };
        return { error: { status: lastRefreshOutcome() === 'invalid' ? 401 : 0 } };
      },
      saveToken: saveRefreshToken,
      clearToken: clearRefreshToken,
      onSignedIn: (data) =>
        dispatch(signedIn({ accessToken: data.accessToken, customer: data.customer })),
      onSignedOut: () => dispatch(bootFinished()),
      onReconnecting: () => dispatch(bootReconnecting()),
      isAlive: () => alive,
      wait: (ms) =>
        new Promise((res) => {
          const t = setTimeout(done, ms);
          function done() {
            clearTimeout(t);
            wakeRetry = () => {};
            res(undefined);
          }
          wakeRetry = done;
        }),
    }).catch(() => {
      // Only a storage failure gets here; the token is untouched, so the next launch tries again.
      if (alive) dispatch(bootFinished());
    });
    return () => {
      alive = false;
      wakeRetry();
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
