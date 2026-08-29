import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ErrorBoundary, Screen, TopBar } from '@/components/shared';
import { Card, EmptyState, PageHeader, Section, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * HOME TAB - foundation placeholder. Feature owner: Aryan.
 *
 * This renders the shell only: top bar, page header, section scaffolding. It
 * deliberately shows NO metrics, NO suggestions and NO activity, because none
 * of those exist yet and inventing them would break product rules 6, 7 and 9.
 *
 * Aryan: replace the body below with real content from `features/dashboard`.
 * Keep `<Screen>` and `<TopBar>` - they own safe areas, keyboard and scrolling.
 */
export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Screen
      testID="screen-home"
      header={
        <TopBar
          showBack={false}
          leading={
            <Text variant="cardTitle" style={{ marginLeft: theme.spacing.sm }}>
              Shoogle
            </Text>
          }
          actions={[
            {
              icon: 'notifications-outline',
              accessibilityLabel: 'Notifications',
              onPress: () => router.push('/notifications'),
            },
          ]}
        />
      }>
      <ErrorBoundary label="Home">
        <PageHeader
          title="Home"
          subtitle="Your marketing, handled."
          style={{ marginTop: theme.spacing.sm }}
        />

        <Section title="Today" first={false}>
          <Card>
            <EmptyState
              compact
              icon="sparkles-outline"
              title="Nothing to act on yet"
              body="Once your business is connected, Shoogle will propose what to do next here."
            />
          </Card>
        </Section>

        <Section title="Performance">
          <Card>
            <EmptyState
              compact
              icon="bar-chart-outline"
              title="No data source connected"
              body="Metrics appear once an account is linked. Shoogle does not estimate numbers it cannot measure."
            />
          </Card>
        </Section>

        <View style={{ height: theme.spacing['3xl'] }} />
      </ErrorBoundary>
    </Screen>
  );
}
