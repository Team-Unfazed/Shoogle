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
  useHome,
} from '@/features/dashboard';
import { useSession } from '@/features/auth/SessionProvider';
import { useTheme } from '@/theme';

/**
 * HOME TAB. Feature owner: Aryan.
 *
 * Laid out to match "Shoogle Home.dc.html" from the Claude Design project:
 * business switcher, the gradient "Shoogle suggests" card, a horizontal insight
 * strip, a 3-up metric row, a connection alert, and three module rows.
 *
 * THIS FILE DECIDES NOTHING
 * -------------------------
 * `useHome()` returns a finished view model and every honesty rule lives behind
 * it, in `features/dashboard/aggregate.ts`, where it is unit-tested without a
 * renderer. There is no `?? 0`, no `||` fallback and no branch below that
 * invents a value — if a number is not on the view model, it is not known, and
 * `MetricTile` renders a dash and the reason.
 *
 * DATA HONESTY
 * ------------
 * There is no backend yet, so in development the sources come from a labelled
 * fixture (the design's own demo business, Vahan Ready) and a banner always
 * says so. Outside development the aggregation reports `not_connected` for
 * every source and the screen shows its honest empty state instead.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { isPreview } = useSession();

  const home = useHome({ isPreview });

  // The preview banner already says nothing here is real, so we do not stack a
  // second banner on top of it.
  const showFixtureBanner = home.isFixture && !isPreview;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top + 8 }}>
      <ErrorBoundary label="Home">
        <BusinessHeader
          name={home.business?.name ?? 'Your business'}
          locality={home.business?.locality ?? 'Add your location'}
          initials={home.business?.initials ?? '?'}
          hasUnread={home.hasUnreadNotifications}
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

          {home.isEmpty ? (
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
              {home.headline ? (
                <SuggestCard
                  title={home.headline.title}
                  body={home.headline.body}
                  primaryLabel={home.headline.primaryLabel}
                  moreCount={home.moreSuggestions}
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
                    toast.show({
                      message: 'The suggestions screen is not built yet.',
                      tone: 'neutral',
                    })
                  }
                />
              ) : null}

              {home.insights.length > 0 ? <InsightStrip items={home.insights} /> : null}

              {home.metrics.length > 0 ? (
                <>
                  <Text
                    variant="bodyStrong"
                    tone="muted"
                    style={{
                      fontSize: 13,
                      paddingHorizontal: theme.layout.screenPaddingX,
                      paddingBottom: 8,
                    }}>
                    {home.metricsPeriod}
                  </Text>

                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 9,
                      paddingHorizontal: theme.layout.screenPaddingX,
                      paddingBottom: 20,
                    }}>
                    {home.metrics.map((metric) => (
                      <MetricTile
                        key={metric.key}
                        label={metric.label}
                        value={metric.value}
                        changePct={metric.changePct}
                        unavailableReason={metric.note ?? undefined}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {home.alert ? (
                <AlertRow
                  title={home.alert.title}
                  body={home.alert.body}
                  actionLabel={home.alert.actionLabel}
                  onPress={() => router.push('/(tabs)/business')}
                />
              ) : null}

              <View style={{ paddingHorizontal: theme.layout.screenPaddingX, gap: 11 }}>
                {home.modules.map((module) => (
                  <ModuleRow
                    key={module.id}
                    title={module.title}
                    subtitle={module.subtitle}
                    accent={module.accent}
                    icon={module.icon}
                    emphasis={module.emphasis}
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
