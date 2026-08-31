import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary, FixtureBanner } from '@/components/shared';
import { Badge, Card, Divider, Text, useToast } from '@/components/ui';
import { AuditSummaryCard, type AuditRun } from '@/features/audit';
import { useSession } from '@/features/auth/SessionProvider';
import {
  AdviceCard,
  BusinessNavRow,
  GridMetric,
  RatingRow,
  VisibilityHero,
} from '@/features/gbp/components/BusinessParts';
import { getAuditFixtures, type AuditFixtures } from '@/fixtures/audit';
import { getBusinessFixture, RANK_NOT_MEASURABLE_MESSAGE } from '@/fixtures/business';
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
 *
 * WHAT THIS TAB IS A DOOR TO
 * --------------------------
 * Three destinations exist and are linked; everything else still toasts "not
 * built yet", because a link to a route that does not exist is worse than an
 * honest refusal (and typedRoutes fails the build for it anyway).
 *
 *   /seo/audit        the full profile audit, summarised here by
 *                     <AuditSummaryCard> - the ONLY view `features/audit`
 *                     exports, so the tab cannot form a second opinion about
 *                     the score, the top finding or the unchecked count.
 *   /seo/searches     what people actually typed. This is what replaced the
 *                     impossible "rank" feature; the row still states that
 *                     Google publishes no rank position, permanently.
 *   /seo/visibility   whether AI assistants can read the owner's website.
 *
 * NEVER ON THIS SCREEN: a rank position, and a 0 standing in for something we
 * did not measure. `<Score value={null}>` renders "-" and "Not measured yet".
 */
export default function BusinessScreen() {
  const theme = useTheme();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPreview } = useSession();

  // Gated accessor: returns null outside development, so a release build
  // cannot reach fixture content at all.
  const data = isFixtureModeEnabled() || isPreview ? getBusinessFixture() : null;
  const showFixtureBanner = data !== null && !isPreview;

  // Also gated. The engine is pure and synchronous, so the two fixture runs are
  // produced once on mount rather than re-derived on every render. In a build
  // without fixtures this is null and the registry below is the only source.
  const [auditFixtures] = useState<AuditFixtures | null>(() => getAuditFixtures());
  const [gbpConnection, setGbpConnection] = useState<DataState<ConnectionInfo>>(loading());

  useEffect(() => {
    if (auditFixtures !== null) return;
    let cancelled = false;
    void getProvider('google_business')
      .getConnection()
      .then((next) => {
        if (!cancelled) setGbpConnection(next);
      });
    return () => {
      cancelled = true;
    };
  }, [auditFixtures]);

  const audit = resolveAuditEntry(auditFixtures, gbpConnection);

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

          {/*
            THE AUDIT, IN MINIATURE.

            Everything here comes off the same `AuditRun` that `/seo/audit`
            renders in full, so the tab and the report can never disagree. The
            card carries its own honesty: no score becomes "-" plus "Not
            measured yet" rather than 0, the top finding is shown even when
            there is no number (a missing score must not hide a real problem),
            and the unchecked count survives the shrink to a tab card.

            With fixtures on, the scored run is shown because it is the one
            that exercises the layout; the not-enough-data run is one tap away
            behind the development switch on the report screen itself.
          */}
          {audit.kind === 'linked_not_read' ? (
            // A connected account that nothing has read yet. The summary card's
            // empty copy says "Connect Google Business Profile", which would be
            // a false statement about this owner's account - so this sub-case
            // gets its own row rather than borrowing the wrong sentence.
            <BusinessNavRow
              title="Profile audit"
              subtitle="Listing linked. Shoogle has not read it yet"
              icon="clipboard-outline"
              accent="neutral"
              onPress={() => router.push('/seo/audit')}
            />
          ) : (
            <AuditSummaryCard
              run={audit.kind === 'run' ? audit.run : null}
              loading={audit.kind === 'loading'}
              onPress={() => router.push('/seo/audit')}
            />
          )}

          {/*
            No `unanswered` count is passed. Whether GBP's review `reply` field
            reflects replies posted outside Shoogle is not established, so that
            number cannot be honestly measured yet — it is omitted rather than
            defaulted to 0.
          */}
          <RatingRow
            rating={data?.reviews.rating ?? null}
            total={data?.reviews.total ?? null}
            onPress={() => router.push('/seo/reviews')}
          />

          {/*
            THE OPERATOR ITSELF.

            Product rule 1: Shoogle is an operator, not a CRM. This row is where
            an owner sees what it did on their behalf and can stop it in one tap
            (rule 5). It deliberately does NOT claim to be active -- the agent
            reports whether it can actually act, and today, with no Google
            connection, it cannot.
          */}
          <BusinessNavRow
            title="Shoogle agent"
            subtitle="What Shoogle did for you, and whether it can act"
            icon="flash-outline"
            accent="blue"
            onPress={() => router.push('/seo/agent')}
          />

          {/*
            The highest-leverage growth loop available to an Indian local
            business: more reviews measurably improves local visibility, and
            unlike rank it is something the owner can act on today.
          */}
          <BusinessNavRow
            title="Get more reviews"
            subtitle="Send a review link by WhatsApp, or print a QR for the counter"
            icon="chatbubbles-outline"
            accent="green"
            onPress={() => router.push('/seo/get-reviews')}
          />

          {/*
            THE ROW THAT REPLACED RANKINGS.

            Google exposes no rank position through any API - not rate-limited,
            not approval-gated, it does not exist. The row keeps saying so
            permanently, in the subtitle, and now leads somewhere real: the
            search terms that actually surfaced the business, where a reading
            below Google's threshold arrives as "<15" and never as 15 or 0.

            The title describes what the screen does. "Search rankings" implied
            a position was on its way; nothing is on its way.
          */}
          <BusinessNavRow
            title="What people searched"
            subtitle={`${RANK_NOT_MEASURABLE_MESSAGE} — see the searches instead`}
            icon="search-outline"
            accent="neutral"
            onPress={() => router.push('/seo/searches')}
          />

          {/*
            The AI-search check. It reads the owner's own website, so it is a
            real measurement with real evidence behind every claim - and no
            score, because "5 of 7 checks passed" is a count, not a score.
          */}
          <BusinessNavRow
            title="How you look to AI"
            subtitle="Whether AI assistants can read your website"
            icon="sparkles-outline"
            accent="blue"
            onPress={() => router.push('/seo/visibility')}
          />

          {/*
            The eleven DailyMetric values Google still publishes -- and, stated
            plainly on the screen, the ones it deleted in 2023. An owner arriving
            from another tool wondering where their post and photo view counts
            went gets an answer here that no competitor gives them.
          */}
          <BusinessNavRow
            title="Performance"
            subtitle="How people found you, and what they did next"
            icon="stats-chart-outline"
            accent="green"
            onPress={() => router.push('/seo/performance')}
          />

          <BusinessNavRow
            title="Photos"
            subtitle="Coverage gaps and how fresh your profile looks"
            icon="images-outline"
            accent="amber"
            onPress={() => router.push('/seo/photos')}
          />

          <BusinessNavRow
            title="Business profile"
            subtitle="Hours, festival closures, service areas, details"
            icon="list-outline"
            onPress={() => router.push('/seo/profile')}
          />

          {/*
            NOT WIRED, DELIBERATELY -- both belong to other engineers.

            Google Business posts: 'google_business' is already a ProviderId that
            Yash's SocialPublisher targets. Two composers would mean two sources
            of truth for post status, so this waits on a written handoff.

            Website: app/website/ is Devashish's and does not exist yet. With
            typedRoutes on, linking to it would fail typecheck; an honest toast
            beats a broken link.
          */}
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

/**
 * What the tab can honestly say about the audit right now.
 *
 * `linked_not_read` is separated from `not_connected` on purpose: telling an
 * owner who HAS linked Google Business Profile to "connect Google Business
 * Profile" is a false statement about their account, and the two facts have
 * different fixes. `/seo/audit` draws the same distinction.
 *
 * Note what is absent: no branch turns a missing connection or a failed read
 * into an empty report, a zero, or a score. Unknown stays unknown.
 */
type AuditEntry =
  | { kind: 'loading' }
  | { kind: 'run'; run: AuditRun }
  | { kind: 'not_connected' }
  | { kind: 'linked_not_read' };

function resolveAuditEntry(
  fixtures: AuditFixtures | null,
  connection: DataState<ConnectionInfo>,
): AuditEntry {
  if (fixtures !== null) return { kind: 'run', run: fixtures.scored };

  switch (connection.status) {
    case 'loading':
      return { kind: 'loading' };
    case 'ready':
      return connection.value.status === 'connected'
        ? { kind: 'linked_not_read' }
        : { kind: 'not_connected' };
    case 'unavailable':
    case 'error':
      return { kind: 'not_connected' };
  }
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
