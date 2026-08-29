import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env, isSupabaseConfigured } from '@/lib/env';

/**
 * Supabase client for React Native / Expo.
 *
 * SECURITY
 * --------
 * Only the publishable (anon) key is used here, and only because Row Level
 * Security protects every table. The service role key MUST NEVER be imported
 * into the app - it is not even readable from `@/lib/env`.
 *
 * AVAILABILITY
 * ------------
 * The app must open in Expo Go on a fresh clone with no `.env.local`. So this
 * module never throws at import time: when Supabase is unconfigured,
 * `getSupabase()` returns null and the auth shell renders an honest
 * "backend not configured" state instead of crashing.
 *
 * Owner: Sunny (Auth / Supabase / DB / RLS).
 */

let client: SupabaseClient | null = null;

/**
 * Returns the shared client, or null when `EXPO_PUBLIC_SUPABASE_URL` /
 * `EXPO_PUBLIC_SUPABASE_ANON_KEY` are not set. Callers must handle null.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;

  client = createClient(env.supabaseUrl as string, env.supabaseAnonKey as string, {
    auth: {
      // AsyncStorage is available inside Expo Go, so development needs no
      // custom dev build. Session tokens are scoped to the app sandbox.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar, so there is no callback fragment to parse.
      // OAuth redirects are handled explicitly via expo-auth-session instead.
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Test hook. Drops the memoised client so env changes take effect. */
export function resetSupabaseClient(): void {
  client = null;
}

export { isSupabaseConfigured };
