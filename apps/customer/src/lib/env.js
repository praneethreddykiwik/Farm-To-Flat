import Constants from 'expo-constants';

// The API port the dev server listens on (apps/api). Kept here so the LAN fallback below and any
// explicit override agree on one number.
const DEV_API_PORT = 4000;

/**
 * Resolve the API base URL.
 *
 * A real device can't reach `localhost` — there, `localhost` is the phone itself, not the Mac
 * running the API, which is why "Send code" failed with "No connection". When the configured URL
 * points at localhost we instead derive the dev machine's LAN IP from the Metro host that already
 * served this bundle (the same address Expo connected to), so it works on any Wi-Fi with no
 * hardcoded IP. An explicit LAN or production URL in EXPO_PUBLIC_API_URL always wins as-is.
 */
function resolveApiUrl() {
  const explicit = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
  const isLocalhost = !explicit || /(localhost|127\.0\.0\.1)/.test(explicit);
  if (!isLocalhost) return explicit;

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    '';
  const host = hostUri.split('/')[0].split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${DEV_API_PORT}`;
  }
  return explicit || `http://localhost:${DEV_API_PORT}`;
}

/** Everything here is public and ships in the bundle. Secrets never appear in this file. */
export const env = {
  apiUrl: resolveApiUrl(),
  useMocks: process.env.EXPO_PUBLIC_USE_MOCKS !== '0',
  aiProvider: (process.env.EXPO_PUBLIC_AI_PROVIDER || 'groq').toLowerCase(),
  groqKey: process.env.EXPO_PUBLIC_GROQ_API_KEY || null,
  groqModel: process.env.EXPO_PUBLIC_GROQ_MODEL || 'openai/gpt-oss-120b',
  geminiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || null,
  geminiModel: process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-3.6-flash',
  razorpayKeyId: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_xxxxxxxxxxxx',
  // Public Supabase values. Auth and user management stay server-side behind /api/v1 (per the
  // technical design); the client uses these only to resolve read-only Storage image URLs.
  supabaseUrl: (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || null,
  isExpoGo: Constants.executionEnvironment === 'storeClient',
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  easProjectId: Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId || '',
};

export const API_BASE = `${env.apiUrl}/api/v1`;

// One line in the Metro terminal on every reload, so it's obvious on-device which API the app is
// talking to (localhost on the simulator, the Mac's LAN IP on a real phone).
if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log(`[f2f] API → ${API_BASE}  (mocks ${env.useMocks ? 'ON' : 'off'})`);
}
