import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary, FixtureBanner } from '@/components/shared';
import { Card, EmptyState, Text, useToast } from '@/components/ui';
import {
  AlertRow,
  BusinessHeader,
  InsightStrip,
  MetricTile,
  ModuleRow,
  SuggestCard,
} from '@/features/dashboard/components/HomeParts';
import { useSession } from '@/features/auth/SessionProvider';
import { homeFixture } from '@/fixtures/home';
import { isFixtureModeEnabled } from '@/lib/env';
import { useTheme } from '@/theme';

/**
 * HOME TAB. Feature owner: Aryan.
 *
 * Laid out to match "Shoogle Home.dc.html" from the Claude Design project:
 * business switcher, the gradient "Shoogle suggests" card, a horizontal insight
 * strip, a 3-up metric row, a connection alert, and three module rows.
 *
 * DATA HONESTY
 * ------------
 * There is no backend yet, so the content comes from a labelled development
 * fixture (the design's own demo business, Vahan Ready) and is only reachable
 * in development. A banner always states this.
 *
 * Outside development the screen renders its honest empty state instead. It
 * never invents numbers, and `MetricTile` takes `number | null` so an
 * unmeasured value cannot become 0.
 *
 * Aryan: replace `homeFixture` with real `DataState` values from your
 * providers. The layout does not change — only where the data comes from.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { isPreview } = useSession();

  // Fixtures are development-only. Nothing real exists to show yet.
  const data = isFixtureModeEnabled() || isPreview ? homeFixture : null;

  // The preview banner already says nothing here is real, so we do not stack a
  // second banner on top of it.
  const showFixtureBanner = data !== null && !isPreview;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top + 8 }}>
      <ErrorBoundary label="Home">
        <BusinessHeader
          name={data?.business.name ?? 'Your business'}
          locality={data?.business.locality ?? 'Add your location'}
          initials={data?.business.initials ?? '?'}
          hasUnread={(data?.unreadNotifications ?? 0) > 0}
          onPressBusiness={() => router.push('/(tabs)/business')}
          onPressNotifications={() => router.push('/notifications')}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}>
          {showFixtureBanner ? (
            <View style={{ paddingHorizontal: theme.layout.screenPaddingX }}>
              <FixtureBanner />
            </View>
          ) : null}

          {data === null ? (
            <View style={{ paddingHorizontal: theme.layout.screenPaddingX }}>
              <Card>
                <EmptyState
                  compact
                  icon="sparkles-outline"
                  title="Nothing to act on yet"
                  body="Connect your business and Shoogle will propose what to do next here."
                  action={{
                    label: 'Connect an account',
                    onPress: () => router.push('/(tabs)/business'),
                  }}
                />
              </Card>
            </View>
          ) : (
            <>
              <SuggestCard
                title={data.headline.title}
                body={data.headline.body}
                primaryLabel={data.headline.primaryLabel}
                moreCount={data.moreSuggestions}
                onPrimary={() =>
                  toast.show({
                    message: 'The create-post flow is not built yet.',
                    tone: 'neutral',
                  })
                }
                onSkip={() =>
                  toast.show({ message: 'Suggestion skipped for today.', tone: 'neutral' })
                }
                onMore={() =>
                  toast.show({ message: 'The suggestions screen is not built yet.', tone: 'neutral' })
                }
              />

              <InsightStrip items={data.insights} />

              <Text
                variant="bodyStrong"
                tone="muted"
                style={{
                  fontSize: 13,
                  paddingHorizontal: theme.layout.screenPaddingX,
                  paddingBottom: 8,
                }}>
                {data.metricsPeriod}
              </Text>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 9,
                  paddingHorizontal: theme.layout.screenPaddingX,
                  paddingBottom: 20,
                }}>
                {data.metrics.map((metric) => (
                  <MetricTile
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    changePct={metric.changePct}
                  />
                ))}
              </View>

              {data.alert ? (
                <AlertRow
                  title={data.alert.title}
                  body={data.alert.body}
                  actionLabel={data.alert.actionLabel}
                  onPress={() => router.push('/(tabs)/business')}
                />
              ) : null}

              <View
                style={{
                  paddingHorizontal: theme.layout.screenPaddingX,
                  gap: 11,
                }}>
                {data.modules.map((module) => (
                  <ModuleRow
                    key={module.id}
                    title={module.title}
                    subtitle={module.subtitle}
                    accent={module.accent}
                    icon={module.icon}
                    emphasis={module.emphasis === true}
                    onPress={() => router.push(module.href as never)}
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </ErrorBoundary>
    </View>
  );
}
