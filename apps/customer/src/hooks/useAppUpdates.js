import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { watchAppUpdates } from '../lib/appUpdates';
import { loadUpdates } from '../lib/updatesModule';

/**
 * Check for, download and switch on published updates without waiting for a full restart.
 * Rules and reasons: lib/appUpdates.js. Mounted once, in the root layout.
 */
export function useAppUpdates() {
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (__DEV__) return undefined;
    return watchAppUpdates({
      updates: loadUpdates(),
      appState: AppState,
      getPath: () => path.current,
    });
  }, []);
}
