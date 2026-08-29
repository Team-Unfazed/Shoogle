import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/client';
import {
  failed,
  loading,
  ready,
  unavailable,
  type DataState,
} from '@/lib/state/DataState';
import type { SessionUser } from '@/lib/providers/contracts';

/**
 * AUTHENTICATION SHELL. Owner: Sunny.
 *
 * WHAT THIS IS
 * ------------
 * The session container the app shell needs in order to decide between the
 * (auth) and (tabs) route groups. It reads the current Supabase session and
 * subscribes to changes. That is all.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is NOT the auth feature. Sign-up rules, email verification, OAuth account
 * linking, profile bootstrapping, RLS policies and onboarding all belong to the
 * auth feature and are not implemented here.
 *
 * HONESTY
 * -------
 * When Supabase is not configured (no `.env.local`, which is the state of a
 * fresh clone), this reports `unavailable('not_connected', ...)` rather than
 * pretending to be signed out. The two are different: "no backend" is a
 * developer problem, "signed out" is an owner state, and the UI says which.
 */

export interface SessionContextValue {
  /** Null value means "definitely signed out". Non-ready means we do not know. */
  state: DataState<SessionUser | null>;
  /** True only when we have a confirmed, signed-in user. */
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const NOT_CONFIGURED_MESSAGE =
  'Supabase is not configured on this build. Copy .env.local.example to .env.local and add the project URL and publishable key.';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DataState<SessionUser | null>>(loading());

  const readSession = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setState(unavailable('not_connected', NOT_CONFIGURED_MESSAGE));
      return;
    }

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setState(failed('AUTH_SESSION_READ_FAILED', 'Could not check your sign-in status.', true));
        return;
      }
      setState(ready(toSessionUser(data.session?.user ?? null), new Date().toISOString()));
    } catch {
      setState(failed('AUTH_SESSION_UNREACHABLE', 'Could not reach the server.', true));
    }
  }, []);

  useEffect(() => {
    void readSession();

    const supabase = getSupabase();
    if (!supabase) return;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(ready(toSessionUser(session?.user ?? null), new Date().toISOString()));
    });
    return () => data.subscription.unsubscribe();
  }, [readSession]);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    setState(ready(null, new Date().toISOString()));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      isAuthenticated: state.status === 'ready' && state.value !== null,
      signOut,
      refresh: readSession,
    }),
    [state, signOut, readSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside <SessionProvider> (mounted in app/_layout.tsx).');
  }
  return context;
}

/** Narrow the Supabase user to the fields the app is allowed to rely on. */
function toSessionUser(user: { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> } | null): SessionUser | null {
  if (!user) return null;
  const displayName = user.user_metadata?.['display_name'];
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    displayName: typeof displayName === 'string' ? displayName : null,
  };
}

export { isSupabaseConfigured };
