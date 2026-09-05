import Constants from 'expo-constants';

/** Everything here is public and ships in the bundle. Secrets never appear in this file. */
export const env = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, ''),
  useMocks: process.env.EXPO_PUBLIC_USE_MOCKS !== '0',
  aiProvider: (process.env.EXPO_PUBLIC_AI_PROVIDER || 'groq').toLowerCase(),
  groqKey: process.env.EXPO_PUBLIC_GROQ_API_KEY || null,
  groqModel: process.env.EXPO_PUBLIC_GROQ_MODEL || 'openai/gpt-oss-120b',
  geminiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || null,
  geminiModel: process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-3.6-flash',
  razorpayKeyId: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_xxxxxxxxxxxx',
  isExpoGo: Constants.executionEnvironment === 'storeClient',
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
  easProjectId: Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId || '',
};

export const API_BASE = `${env.apiUrl}/api/v1`;
