import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary, FixtureBanner } from '@/components/shared';
import { Badge, Card, Divider, Text, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';
import {
  AdviceCard,
  BusinessNavRow,
  GridMetric,
  RatingRow,
  VisibilityHero,
} from '@/features/gbp/components/BusinessParts';
import { businessFixture } from '@/fixtures/business';
import { isFixtureModeEnabled } from '@/lib/env';
import {
  ALL_PROVIDER_IDS,
  getProvider,
  getProviderDisplayName,
  isProviderRegistered,
} from '@/lib/providers';
import type { ConnectionInfo } from '@/lib/providers/types';
import { loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';
import type { ProviderId } from '@/types/domain';

/**
 * BUSINESS TAB. Feature owner: Pranay (SEO / GBP / Audit).
 *
 * Laid out to match the `seo` screen in "Shoogle SEO.dc.html": the visibility
 * hero, a 2x2 metric grid, the rating summary, and navigation rows into
 * rankings, Google posts and the business profile. The Website module is folded
 * in here too, because the product spec has four tabs rather than the design's
 * five.
 *
 * TWO SOURCES, DELIBERATELY DIFFERENT
 * -----------------------------------
 * The SEO content above the fold is a labelled development fixture, so the
 * layout can be reviewed. The "Connected accounts" section at the bottom is
 * REAL: it asks the provider registry and reports the truth, which today is
 * "not connected" for everything. Fixture content sits under a banner; real
 * state does not.
 */
export default function BusinessScreen() {
  const theme = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { isPreview } = useSession();

  const data = isFixtureModeEnabled() || isPreview ? businessFixture : null;
  const showFixtureBanner = data !== null && !isPreview;

  const notBuilt = (what: string) => () =>
    toast.show({ message: `${what} is not built yet.`, tone: 'neutral' });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top + 8 }}>
      <ErrorBoundary label="Business">
        <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: theme.fontFamily.display,
              fontSize: 24,
              letterSpacing: -0.48,
              color: theme.colors.text,
            }}>
            Business
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 8,
            paddingBottom: 32,
            gap: 14,
          }}
          showsVerticalScrollIndicator={false}>
          {showFixtureBanner ? <FixtureBanner /> : null}

          {data === null ? (
            <VisibilityHero
              label="YOUR LOCAL VISIBILITY"
              headline="Not measured yet"
              body="Connect Google Business Profile and Shoogle will measure how people find you."
              filledSegments={null}
              accent="neutral"
            />
          ) : (
            <>
              <VisibilityHero
                label={data.visibility.label}
                headline={data.visibility.headline}
                body={data.visibility.body}
                filledSegments={data.visibility.filledSegments}
              />

              <View style={{ flexDirection: 'row', gap: 9 }}>
                {data.metrics.slice(0, 2).map((m) => (
                  <GridMetric
                    key={m.key}
                    label={m.label}
                    value={m.value}
                    delta={m.delta}
                    deltaDirection={m.direction}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 9 }}>
                {data.metrics.slice(2).map((m) => (
                  <GridMetric
                    key={m.key}
                    label={m.label}
                    value={m.value}
                    delta={m.delta}
                    deltaDirection={m.direction}
                  />
                ))}
              </View>
            </>
          )}

          <RatingRow
            rating={data?.reviews.rating ?? null}
            total={data?.reviews.total ?? null}
            unanswered={data?.reviews.unanswered ?? 0}
            onPress={notBuilt('Reviews')}
          />

          <BusinessNavRow
            title="Search rankings"
            subtitle={
              data
                ? `${data.rankings.tracked} keywords tracked · ${data.rankings.improved} improved`
                : 'Not measured yet'
            }
            icon="trending-up"
            accent="green"
            onPress={notBuilt('Search rankings')}
          />

          <BusinessNavRow
            title="Google Business posts"
            subtitle={data ? data.gbpPosts.status : 'Not connected'}
            subtitleTone={data?.gbpPosts.needsAttention ? 'red' : 'muted'}
            glyph="G"
            accent="green"
            onPress={notBuilt('Google Business posts')}
          />

          <BusinessNavRow
            title="Website"
            subtitle={data ? data.website.status : 'Not started'}
            subtitleTone={data?.website.needsAttention ? 'amber' : 'muted'}
            icon="globe-outline"
            accent="amber"
            onPress={notBuilt('The website module')}
          />

          <BusinessNavRow
            title="Business profile"
            subtitle="Hours, areas, photos, details"
            icon="list-outline"
            onPress={notBuilt('The business profile editor')}
          />

          {data ? (
            <AdviceCard
              text={data.advice.text}
              actionLabel={data.advice.actionLabel}
              onPress={notBuilt('Creating a Google post')}
            />
          ) : null}

          {/* ---------------------------------------------------------------
              Real data below this line. The registry is asked directly, and
              whatever it answers is what is shown.
             --------------------------------------------------------------- */}
          <Text
            variant="label"
            tone="muted2"
            accessibilityRole="header"
            style={{ marginTop: 8, letterSpacing: 0.8 }}>
            Connected accounts
          </Text>

          <Card padded={false}>
            {ALL_PROVIDER_IDS.map((id, index) => (
              <View key={id}>
                {index > 0 ? <Divider spacing={0} inset={56} /> : null}
                <ConnectionRow providerId={id} />
              </View>
            ))}
          </Card>
        </ScrollView>
      </ErrorBoundary>
    </View>
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
