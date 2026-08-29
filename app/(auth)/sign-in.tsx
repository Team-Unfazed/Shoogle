import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/shared';
import { Button, Card, Input, Text } from '@/components/ui';
import { getSignInHandler, isSignInImplemented } from '@/features/auth/handlers';
import { useSession } from '@/features/auth/SessionProvider';
import { isDevPreviewEnabled, isSupabaseConfigured } from '@/lib/env';
import { useTheme } from '@/theme';

/**
 * SIGN-IN SHELL. Feature owner: Sunny.
 *
 * This screen owns the LAYOUT and the honest reporting of what is and is not
 * available. It does NOT implement authentication: it delegates to whatever
 * handler the auth feature registers via `registerSignInHandler`.
 *
 * Two separate facts are reported separately, because conflating them would
 * produce a button that looks live and silently does nothing:
 *
 *   1. Is the backend configured?  -> isSupabaseConfigured()
 *   2. Is sign-in actually built?  -> isSignInImplemented()
 *
 * The button only enables when BOTH are true and the fields are filled.
 *
 * On success there is no navigation call here. SessionProvider is subscribed to
 * auth-state changes, and `(auth)/_layout.tsx` redirects out of this group once
 * a session exists - so the redirect follows the real session, not an
 * optimistic assumption that the call worked.
 *
 * ONBOARDING: product rule 11 says no unnecessary onboarding. Do not add a
 * carousel, a tour, or a "welcome" step before this screen.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const configured = isSupabaseConfigured();
  const implemented = isSignInImplemented();
  const previewAvailable = isDevPreviewEnabled();
  const { enterPreview } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = configured && implemented;
  const canAttempt = ready && email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSignIn = async () => {
    const handler = getSignInHandler();
    if (!handler || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await handler.signInWithEmail(email.trim(), password);
      if (result.status === 'error') {
        setError(result.message);
      } else if (result.status === 'unavailable') {
        setError(result.message);
      }
      // On success: do nothing here. SessionProvider observes the new session
      // and the (auth) layout redirects. Navigating manually would be claiming
      // success before the session actually exists.
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen testID="screen-sign-in" edgeBottom>
      <View style={{ marginTop: theme.spacing['5xl'] }}>
        <Text variant="display">Shoogle</Text>
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          Marketing for your business, handled.
        </Text>
      </View>

      {!configured ? (
        <Card
          accent="amber"
          style={{ marginTop: theme.spacing['2xl'] }}
          testID="backend-not-configured">
          <Text variant="cardTitle">Backend not configured</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
            This build has no Supabase project. Copy .env.local.example to .env.local and set
            EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.
          </Text>
        </Card>
      ) : null}

      <View style={{ marginTop: theme.spacing['2xl'] }}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@business.in"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          disabled={submitting}
          testID="input-email"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          disabled={submitting}
          onSubmitEditing={canAttempt ? handleSignIn : undefined}
          containerStyle={{ marginTop: theme.spacing.lg }}
          testID="input-password"
        />

        {error ? (
          <Text
            variant="caption"
            tone="red"
            accessibilityLiveRegion="polite"
            style={{ marginTop: theme.spacing.md }}
            testID="sign-in-error">
            {error}
          </Text>
        ) : null}

        <Button
          label={ready ? 'Sign in' : 'Sign in unavailable'}
          onPress={handleSignIn}
          disabled={!canAttempt}
          loading={submitting}
          accessibilityHint={
            ready
              ? 'Signs you in to Shoogle'
              : implemented
                ? 'Unavailable until the backend is configured'
                : 'Unavailable until sign-in is implemented'
          }
          style={{ marginTop: theme.spacing['2xl'] }}
          testID="button-sign-in"
        />

        {!implemented ? (
          <Text
            variant="caption"
            tone="muted2"
            align="center"
            style={{ marginTop: theme.spacing.lg }}>
            Authentication is not implemented in the foundation build.
          </Text>
        ) : null}

        {/*
          Development escape hatch so the shell can be walked before auth
          exists. It signs nobody in - it only relaxes the route guard, and
          every screen then carries an undismissable "Preview mode" banner.
          Hidden entirely unless isDevPreviewEnabled(), which is impossible in a
          release build.
        */}
        {previewAvailable ? (
          <Button
            label="Preview the app without signing in"
            variant="secondary"
            size="medium"
            onPress={enterPreview}
            accessibilityHint="Development only. Opens the app shell without an account."
            style={{ marginTop: theme.spacing.lg }}
            testID="button-dev-preview"
          />
        ) : null}
      </View>
    </Screen>
  );
}
