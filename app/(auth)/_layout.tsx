import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/features/auth/SessionProvider';

/**
 * Unauthenticated route group. Feature owner: Sunny.
 *
 * The foundation ships only the sign-in shell. Sign-up, password reset, OTP,
 * OAuth linking and onboarding are auth-feature work and belong in additional
 * routes inside this group.
 *
 * If a confirmed session already exists, this group bounces to the app - so a
 * signed-in owner can never land on a sign-in screen by deep link.
 */
export default function AuthLayout() {
  const { isAuthenticated } = useSession();

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 180,
      }}
    />
  );
}
