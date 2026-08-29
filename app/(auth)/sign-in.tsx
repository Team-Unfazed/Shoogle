import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/shared';
import { Button, Card, Input, Text } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/env';
import { useTheme } from '@/theme';

/**
 * SIGN-IN SHELL. Feature owner: Sunny.
 *
 * This is the LAYOUT ONLY. There is no authentication logic here on purpose:
 * `onSubmit` is a seam for the auth feature to fill in. The button is disabled
 * and labelled honestly so the screen never pretends to sign anyone in.
 *
 * When Supabase is unconfigured the screen says exactly that, naming the file
 * to create - because on a fresh clone that is the actual problem, and a
 * generic "sign-in failed" would send an engineer hunting in the wrong place.
 *
 * ONBOARDING: product rule 11 says no unnecessary onboarding. Do not add a
 * carousel, a tour, or a "welcome" step before this screen.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const configured = isSupabaseConfigured();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canAttempt = configured && email.trim().length > 0 && password.length > 0;

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
          containerStyle={{ marginTop: theme.spacing.lg }}
          testID="input-password"
        />

        <Button
          label={configured ? 'Sign in' : 'Sign in unavailable'}
          onPress={() => {
            // Intentionally empty. Authentication is the auth feature's work.
            // Wiring a fake success here would be exactly the kind of pretend
            // behaviour the foundation must not ship.
          }}
          disabled={!canAttempt}
          accessibilityHint={
            configured
              ? 'Signs you in to Shoogle'
              : 'Unavailable until the backend is configured'
          }
          style={{ marginTop: theme.spacing['2xl'] }}
          testID="button-sign-in"
        />

        <Text variant="caption" tone="muted2" align="center" style={{ marginTop: theme.spacing.lg }}>
          Authentication is not implemented in the foundation build.
        </Text>
      </View>
    </Screen>
  );
}
