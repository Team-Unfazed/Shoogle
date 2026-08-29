/**
 * Typed, validated access to public runtime configuration.
 *
 * Only `EXPO_PUBLIC_*` variables exist on-device — Expo inlines them at build
 * time. Everything else (service role key, OAuth secrets, Gemini key) is
 * deliberately unreachable from this module and must never be read here.
 *
 * Nothing in this file throws at import time. A missing key degrades a feature
 * to `not_connected`; it never crashes the app or blocks Expo Go.
 */

function readPublic(name: string): string | null {
  // Expo replaces process.env.EXPO_PUBLIC_* literally at build time, so these
  // must be written out rather than looked up dynamically.
  const value = PUBLIC_ENV[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const PUBLIC_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID: process.env.EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID,
  EXPO_PUBLIC_META_APP_ID: process.env.EXPO_PUBLIC_META_APP_ID,
  EXPO_PUBLIC_LINKEDIN_CLIENT_ID: process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID,
  EXPO_PUBLIC_RAZORPAY_KEY_ID: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID,
  EXPO_PUBLIC_ENABLE_FIXTURES: process.env.EXPO_PUBLIC_ENABLE_FIXTURES,
};

export const env = {
  supabaseUrl: readPublic('EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: readPublic('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  googleOAuthClientIdAndroid: readPublic('EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID'),
  metaAppId: readPublic('EXPO_PUBLIC_META_APP_ID'),
  linkedinClientId: readPublic('EXPO_PUBLIC_LINKEDIN_CLIENT_ID'),
  razorpayKeyId: readPublic('EXPO_PUBLIC_RAZORPAY_KEY_ID'),
} as const;

/** True only when Supabase is fully configured. */
export function isSupabaseConfigured(): boolean {
  return env.supabaseUrl !== null && env.supabaseAnonKey !== null;
}

/**
 * Development fixture mode. Forced OFF in any non-development build so a
 * release binary can never render fixture data as if it were the owner's.
 */
export function isFixtureModeEnabled(): boolean {
  if (!__DEV__) return false;
  return readPublic('EXPO_PUBLIC_ENABLE_FIXTURES') === '1';
}

/** Names only — used by Settings > Diagnostics to show what is missing. */
export const REQUIRED_PUBLIC_ENV_NAMES = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const;

export function missingRequiredEnvNames(): string[] {
  return REQUIRED_PUBLIC_ENV_NAMES.filter((name) => readPublic(name) === null);
}
