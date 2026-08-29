import { Redirect } from 'expo-router';

import { FullScreenLoader } from '@/components/shared';
import { useSession } from '@/features/auth/SessionProvider';

/**
 * Splash / route decision.
 *
 * The single place that decides whether the owner lands in (auth) or (tabs).
 * It renders a loader only while the session is genuinely unknown - it does not
 * add an artificial delay or a branded animation, because a splash that lasts
 * longer than the work it is covering is progress theatre (product rule 10).
 *
 * `unavailable` (backend not configured) routes to (auth), where the sign-in
 * screen explains the real reason rather than silently failing.
 */
export default function Index() {
  const { state } = useSession();

  if (state.status === 'loading') {
    return <FullScreenLoader label="Starting Shoogle" />;
  }

  const signedIn = state.status === 'ready' && state.value !== null;
  return signedIn ? <Redirect href="/(tabs)" /> : <Redirect href="/(auth)/sign-in" />;
}
