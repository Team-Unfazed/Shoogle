import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary, FixtureBanner } from '@/components/shared';
import { Dialog, Text, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';
import {
  AccountCard,
  SettingsGroup,
  SettingsRow,
  SettingsToggle,
} from '@/features/dashboard';
import { settingsFixture } from '@/fixtures/settings';
import { isFixtureModeEnabled, missingRequiredEnvNames } from '@/lib/env';
import { useTheme } from '@/theme';

/**
 * SETTINGS TAB. Feature owner: Aryan.
 *
 * Laid out to match the `settings` screen in "Shoogle Website.dc.html":
 * account card, then Business / Team / Preferences / Account groups, and a
 * version footer.
 *
 * WHAT IS REAL HERE
 * -----------------
 * Sign out genuinely signs you out, and Diagnostics names the environment
 * VARIABLES that are missing — names only, never values. Those two are not
 * fixtures. Everything else on this screen is a labelled placeholder until
 * Aryan builds it, and each row says so rather than opening an empty screen.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { state, signOut, isPreview } = useSession();

  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);

  const user = state.status === 'ready' ? state.value : null;
  const data = isFixtureModeEnabled() || isPreview ? settingsFixture : null;
  const showFixtureBanner = data !== null && !isPreview;

  const missingEnv = missingRequiredEnvNames();
  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  const notBuilt = (what: string) => () =>
    toast.show({ message: `${what} is not built yet.`, tone: 'neutral' });

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
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top + 8 }}>
      <ErrorBoundary label="Settings">
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: theme.fontFamily.display,
              fontSize: 24,
              letterSpacing: -0.48,
              color: theme.colors.text,
            }}>
            Settings
          </Text>
        </View>

        <ScrollView
          testID="screen-settings"
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}>
          {showFixtureBanner ? <FixtureBanner /> : null}

          <AccountCard
            businessName={data?.account.businessName ?? 'Your business'}
            initials={data?.account.initials ?? '?'}
            ownerLine={data?.account.ownerLine ?? (user?.email ?? 'Not signed in')}
            onSwitch={data ? notBuilt('Switching business') : undefined}
          />

          <SettingsGroup title="Business">
            <SettingsRow label="Business information" onPress={notBuilt('Business information')} />
            <SettingsRow label="Logo & brand" onPress={notBuilt('Logo and brand')} />
            <SettingsRow
              label="Connected accounts"
              badge={data && data.connectedIssues > 0 ? `${data.connectedIssues} issue` : undefined}
              onPress={notBuilt('Connected accounts')}
              last
            />
          </SettingsGroup>

          <SettingsGroup title="Team">
            <SettingsRow
              label="Employees"
              value={data ? String(data.employees) : undefined}
              onPress={notBuilt('Employees')}
            />
            <SettingsRow label="Roles & permissions" onPress={notBuilt('Roles and permissions')} last />
          </SettingsGroup>

          <SettingsGroup title="Preferences">
            <SettingsToggle
              label="Push notifications"
              value={pushEnabled}
              onChange={(next) => {
                setPushEnabled(next);
                toast.show({
                  message: 'Notification delivery is not wired up yet.',
                  tone: 'neutral',
                });
              }}
            />
            <SettingsToggle
              label="WhatsApp alerts"
              value={whatsappEnabled}
              onChange={(next) => {
                setWhatsappEnabled(next);
                toast.show({ message: 'WhatsApp alerts are not wired up yet.', tone: 'neutral' });
              }}
            />
            <SettingsRow
              label="Labels"
              value={data ? String(data.labels) : undefined}
              onPress={notBuilt('Labels')}
              last
            />
          </SettingsGroup>

          <SettingsGroup title="Account">
            <SettingsRow
              label="Subscription"
              value={data?.plan}
              onPress={notBuilt('Subscription')}
            />
            <SettingsRow label="Help & support" onPress={notBuilt('Help and support')} />
            {/* Real. This actually signs you out. */}
            <SettingsRow
              label="Log out"
              destructive
              showChevron={false}
              onPress={() => setConfirmingSignOut(true)}
              testID="settings-log-out"
              last
            />
          </SettingsGroup>

          {/* Real. Names only — never values. */}
          <SettingsGroup title="Diagnostics">
            <SettingsRow label="App version" value={appVersion} showChevron={false} />
            <SettingsRow
              label="Backend"
              value={missingEnv.length === 0 ? 'Configured' : 'Not configured'}
              showChevron={false}
              last={missingEnv.length === 0}
            />
            {missingEnv.map((name, index) => (
              <SettingsRow
                key={name}
                label={name}
                value="missing"
                showChevron={false}
                last={index === missingEnv.length - 1}
              />
            ))}
          </SettingsGroup>

          <Text
            variant="caption"
            tone="muted2"
            align="center"
            style={{ fontSize: 11.5, marginTop: 24 }}>
            {`Shoogle v${appVersion} · Made for Indian businesses`}
          </Text>
        </ScrollView>

        <Dialog
          visible={confirmingSignOut}
          title="Log out?"
          message="You will need to sign in again to manage this business."
          confirmLabel="Log out"
          destructive
          busy={signingOut}
          onConfirm={handleSignOut}
          onCancel={() => setConfirmingSignOut(false)}
        />
      </ErrorBoundary>
    </View>
  );
}
