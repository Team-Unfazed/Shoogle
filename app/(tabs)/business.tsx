import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ErrorBoundary, Screen, TopBar } from '@/components/shared';
import { Badge, Card, Divider, PageHeader, Score, Section, Text } from '@/components/ui';
import { ALL_PROVIDER_IDS, getProvider, getProviderDisplayName, isProviderRegistered } from '@/lib/providers';
import { loading, type DataState } from '@/lib/state/DataState';
import type { ConnectionInfo } from '@/lib/providers/types';
import type { ProviderId } from '@/types/domain';
import { useTheme } from '@/theme';

/**
 * BUSINESS TAB - foundation. Feature owner: Pranay (SEO / GBP / Audit).
 *
 * This screen is NOT a placeholder: it reports the real, current connection
 * state of every provider by asking the provider registry. Today every answer
 * is "not connected", because no engineer has registered an implementation yet
 * - and saying so plainly is the correct, honest UI.
 *
 * As soon as a feature calls `registerProvider(...)`, this screen starts
 * showing that provider's genuine state with no change to this file.
 *
 * The audit Score is `null` (not 0) because nothing has been measured.
 */
export default function BusinessScreen() {
  const theme = useTheme();

  return (
    <Screen
      testID="screen-business"
      header={<TopBar showBack={false} />}>
      <ErrorBoundary label="Business">
        <PageHeader title="Business" subtitle="Your profile and connected accounts." />

        <Section title="Health">
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
              {/* null, not 0 - no audit has run. */}
              <Score value={null} label="Profile score" />
              <Text
                variant="caption"
                tone="muted"
                align="center"
                style={{ marginTop: theme.spacing.md, maxWidth: 280 }}>
                Shoogle scores your profile once it can read it. Connect an account to get started.
              </Text>
            </View>
          </Card>
        </Section>

        <Section title="Connected accounts" subtitle="Nothing is connected until you connect it.">
          <Card padded={false}>
            {ALL_PROVIDER_IDS.map((id, index) => (
              <View key={id}>
                {index > 0 ? <Divider spacing={0} inset={56} /> : null}
                <ConnectionRow providerId={id} />
              </View>
            ))}
          </Card>
        </Section>
      </ErrorBoundary>
    </Screen>
  );
}

const PROVIDER_ICON: Record<ProviderId, React.ComponentProps<typeof Ionicons>['name']> = {
  google_business: 'business-outline',
  instagram: 'logo-instagram',
  facebook: 'logo-facebook',
  linkedin: 'logo-linkedin',
};

/**
 * One provider row. Asks the registry for the truth and renders exactly that.
 * Never assumes a provider is available and never shows a placeholder handle.
 */
function ConnectionRow({ providerId }: { providerId: ProviderId }) {
  const theme = useTheme();
  // Starts as `loading` and is only replaced once the provider answers, so the
  // row never flashes a state we have not actually established.
  const [state, setState] = useState<DataState<ConnectionInfo>>(loading());

  useEffect(() => {
    let cancelled = false;
    void getProvider(providerId)
      .getConnection()
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const { label, accent } = describeConnection(state);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${getProviderDisplayName(providerId)}, ${label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        minHeight: theme.control.minTouchTarget,
      }}>
      <Ionicons name={PROVIDER_ICON[providerId]} size={22} color={theme.colors.muted} />

      <View style={{ flex: 1, marginLeft: theme.spacing.md, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {getProviderDisplayName(providerId)}
        </Text>
        {!isProviderRegistered(providerId) ? (
          <Text variant="caption" tone="muted2" style={{ marginTop: 2 }}>
            Integration not built yet
          </Text>
        ) : null}
      </View>

      <Badge label={label} accent={accent} />
    </View>
  );
}

/** Maps a connection state to badge copy. Never invents a "connected" state. */
function describeConnection(
  state: DataState<ConnectionInfo>,
): { label: string; accent: 'blue' | 'green' | 'amber' | 'red' | 'neutral' } {
  switch (state.status) {
    case 'loading':
      return { label: 'Checking', accent: 'neutral' };
    case 'error':
      return { label: 'Error', accent: 'red' };
    case 'unavailable':
      return { label: 'Not connected', accent: 'neutral' };
    case 'ready':
      switch (state.value.status) {
        case 'connected':
          return { label: 'Connected', accent: 'green' };
        case 'connecting':
          return { label: 'Connecting', accent: 'blue' };
        case 'expired':
          return { label: 'Reconnect', accent: 'amber' };
        case 'revoked':
          return { label: 'Revoked', accent: 'amber' };
        case 'error':
          return { label: 'Error', accent: 'red' };
        default:
          return { label: 'Not connected', accent: 'neutral' };
      }
  }
}
