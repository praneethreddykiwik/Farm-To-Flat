/**
 * expo-updates, or null where the native module is missing (Expo Go, tests). Requiring it can
 * throw there, so callers get null instead and simply skip update handling.
 */
export function loadUpdates() {
  try {
    return require('expo-updates');
  } catch {
    return null;
  }
}
