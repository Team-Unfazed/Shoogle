import Constants from 'expo-constants';
import { useState } from 'react';
import { View } from 'react-native';

import { ErrorBoundary, Screen, TopBar } from '@/components/shared';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  Divider,
  PageHeader,
  Section,
  Text,
  useToast,
} from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';
import { isFixtureModeEnabled, missingRequiredEnvNames } from '@/lib/env';
import { useTheme } from '@/theme';

/**
 * SETTINGS TAB - foundation. Feature owner: Aryan.
 *
 * Ships two things the foundation genuinely owns:
 *   1. Sign out (the only auth action the shell needs).
 *   2. A Diagnostics block naming which environment VARIABLES are missing -
 *      names only, never values. This is what makes a broken local setup
 *      obvious instead of mysterious.
 *
 * Everything else (profile editing, employees, subscription, notification
 * preferences) belongs to Aryan's feature work and is intentionally absent.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { state, signOut } = useSession();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const user = state.status === 'ready' ? state.value : null;
  const missingEnv = missingRequiredEnvNames();
  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.show({ message: 'Signed out', tone: 'success' });
    } catch {
      toast.show({ message: 'Could not sign out. Try again.', tone: 'error' });
    } finally {
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  };

  return (
    <Screen
      testID="screen-settings"
      header={<TopBar showBack={false} />}>
      <ErrorBoundary label="Settings">
        <PageHeader title="Settings" />

        <Card style={{ marginTop: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar name={user?.displayName ?? user?.email ?? 'Shoogle user'} size={48} />
            <View style={{ flex: 1, marginLeft: theme.spacing.md, minWidth: 0 }}>
              <Text variant="cardTitle" numberOfLines={1}>
                {user?.displayName ?? 'Your account'}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {user?.email ?? 'Not signed in'}
              </Text>
            </View>
          </View>
        </Card>

        <Section title="Account">
          <Card padded={false}>
            <View style={{ padding: theme.spacing.lg }}>
              <Button
                label="Sign out"
                variant="secondary"
                size="medium"
                onPress={() => setConfirmingSignOut(true)}
                accessibilityHint="Signs you out of Shoogle on this device"
              />
            </View>
          </Card>
        </Section>

        <Section title="Diagnostics" subtitle="Shown to help set up this build.">
          <Card>
            <Row label="App version" value={appVersion} />
            <Divider spacing={theme.spacing.md} />
            <Row
              label="Backend"
              value={missingEnv.length === 0 ? 'Configured' : 'Not configured'}
              accent={missingEnv.length === 0 ? 'green' : 'amber'}
            />
            {missingEnv.length > 0 ? (
              <View style={{ marginTop: theme.spacing.md }}>
                <Text variant="caption" tone="muted">
                  Missing from your .env.local (names only):
                </Text>
                {missingEnv.map((name) => (
                  <Text key={name} variant="caption" tone="amber" style={{ marginTop: 4 }}>
                    {name}
                  </Text>
                ))}
              </View>
            ) : null}

            {isFixtureModeEnabled() ? (
              <>
                <Divider spacing={theme.spacing.md} />
                <Row label="Fixture mode" value="On (development)" accent="amber" />
              </>
            ) : null}
          </Card>
        </Section>

        <Dialog
          visible={confirmingSignOut}
          title="Sign out?"
          message="You will need to sign in again to manage this business."
          confirmLabel="Sign out"
          destructive
          busy={signingOut}
          onConfirm={handleSignOut}
          onCancel={() => setConfirmingSignOut(false)}
        />
      </ErrorBoundary>
    </Screen>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'amber';
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text variant="body" tone="muted">
        {label}
      </Text>
      {accent ? (
        <Badge label={value} accent={accent} />
      ) : (
        <Text variant="bodyStrong">{value}</Text>
      )}
    </View>
  );
}
