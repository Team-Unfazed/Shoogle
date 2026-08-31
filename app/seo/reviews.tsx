/**
 * REVIEWS. Route `/seo/reviews`. Owner: Pranay.
 *
 * Grexa's Reviews tab shows a list. This screen shows the same list plus the
 * three things that decide whether the list means anything:
 *
 *   1. WHETHER GOOGLE WILL EVEN LET US LOOK. `reviews.list` is documented as
 *      "only valid if the specified location is verified"
 *      (docs/research/google-business-profile.md §4). For a small Indian
 *      business, not being in Voice of Merchant is the LIKELIEST state, so all
 *      four remedial outcomes are designed screens with their own copy — not a
 *      grey error box, and never an empty list that reads as "you have no
 *      reviews".
 *   2. WHAT EACH NUMBER IS A NUMBER OF. The average and the total are Google's
 *      own figures and are rendered as-is; the star breakdown is counted from
 *      the reviews actually loaded, and the card says so in words every time.
 *      Every one of those is `number | null` and a null renders `—` with the
 *      reason. A measured zero renders `0`. Those are different facts.
 *   3. WHAT BECAME OF EACH REPLY. Google moderates replies, so "submitted" and
 *      "published" are different states and this screen refuses to merge them.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * - An "unanswered" filter and an unanswered count. See
 *   `NO_UNANSWERED_FILTER_REASON`: the coverage of Google's reply field is not
 *   established, so the number could be wrong, and a wrong number would have an
 *   owner replying twice. The absence is explained on screen.
 * - Any rank, anywhere. Google publishes none through any API.
 * - Deleting or flagging a review. Google exposes no method; §5 of the research
 *   doc treats it as impossible, so no control offers it.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * There is no live Google pipeline: `features/gbp` deliberately does not
 * register a provider, so the honest production path is NOT CONNECTED, and that
 * is the DEFAULT state of this screen rather than an error in it.
 *
 * In development with `EXPO_PUBLIC_ENABLE_FIXTURES=1`, `getGbpReviewFixtures()`
 * returns eight scenarios built by running invented wire data through the REAL
 * mapper, the REAL Voice of Merchant classifier and the REAL error classifier.
 * A switcher walks them, and every pixel of it sits under the fixture banner
 * that `showsFixtureData` pins to the top.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen, TopBar } from '@/components/shared';
import { Card, EmptyState, Section, Text, useToast } from '@/components/ui';
import { describeGbpAvailability, type VoiceOfMerchantOutcome } from '@/features/gbp';
import {
  RatingSummaryCard,
  ReviewsList,
  summariseReviews,
  VerificationPanel,
  type ReviewFilter,
} from '@/features/gbp/components/reviews';
import type { GbpReviewPage } from '@/features/gbp/types';
import {
  getGbpReviewFixtures,
  type ReviewsScenario,
  type ReviewsScenarioId,
} from '@/fixtures/gbp-reviews';
import { unavailable, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * Google exposes no way to delete or flag a review. Stated once, on screen,
 * rather than left as a control an owner hunts for and never finds.
 */
const NO_REMOVAL_MESSAGE =
  'Google does not let any app delete or report a review on your behalf — there is no such method in its API. If a review breaks Google’s rules, you report it from your Google Business Profile.';

export default function ReviewsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();

  // Gated accessor: null outside development, so a release build cannot reach
  // fixture content at all.
  const fixtures = useMemo(() => getGbpReviewFixtures(), []);
  const [scenarioId, setScenarioId] = useState<ReviewsScenarioId>('loaded');
  const [filter, setFilter] = useState<ReviewFilter>('all');

  const scenario: ReviewsScenario | null = useMemo(() => {
    if (fixtures === null) return null;
    return fixtures.scenarios.find((entry) => entry.id === scenarioId) ?? null;
  }, [fixtures, scenarioId]);

  /**
   * The production path. The provider is not registered and cannot be, so this
   * is the honest answer and it is the DEFAULT — not a failure mode.
   */
  const notConnected: DataState<GbpReviewPage> = useMemo(
    () => unavailable('not_connected', describeGbpAvailability().body),
    [],
  );

  const state: DataState<GbpReviewPage> = scenario?.state ?? notConnected;
  const verification: VoiceOfMerchantOutcome | null = scenario?.verification ?? null;
  const showsFixtureData = state.status === 'ready' && state.isFixture === true;

  const openReply = useCallback(
    (reviewId: string) => {
      router.push({ pathname: '/seo/review-reply', params: { reviewId } });
    },
    [router],
  );

  const summary = state.status === 'ready' ? summariseReviews(state.value) : null;

  return (
    <Screen
      testID="reviews-screen"
      header={<TopBar title="Reviews" />}
      edgeBottom
      showsFixtureData={showsFixtureData}>
      <Text variant="screenTitle">Reviews</Text>
      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: 6, marginBottom: theme.spacing.lg }}>
        What customers said on Google, and exactly where each of your replies stands with Google.
        Google checks every reply before it appears, so “submitted” and “live” are shown as the two
        different things they are.
      </Text>

      {fixtures === null ? null : (
        <ScenarioSwitcher
          scenarios={fixtures.scenarios}
          value={scenarioId}
          onChange={(next) => {
            setScenarioId(next);
            setFilter('all');
          }}
        />
      )}

      {/*
        The verification state is shown ABOVE everything, whatever the outcome.
        When the profile is healthy it is one green line; when it is not, it is
        the reason there is no list, stated before the owner can wonder.
      */}
      {verification === null ? null : (
        <View style={{ marginBottom: theme.spacing.lg }}>
          <VerificationPanel outcome={verification} testID="reviews-verification" />
        </View>
      )}

      {state.status === 'ready' && summary !== null ? (
        <>
          <RatingSummaryCard summary={summary} testID="reviews-summary" />

          <Section
            title="Every review"
            subtitle="Newest first, exactly as Google returned them.">
            <ReviewsList
              page={state.value}
              filter={filter}
              onFilterChange={setFilter}
              onReply={openReply}
              testID="reviews-list"
            />
          </Section>
        </>
      ) : (
        <ReviewsUnavailable state={state} />
      )}

      <Section title="What Shoogle cannot do here" subtitle="Named, so nobody hunts for it.">
        <Card testID="reviews-limits">
          <Text variant="bodyStrong">Removing a review</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {NO_REMOVAL_MESSAGE}
          </Text>

          <Text variant="bodyStrong" style={{ marginTop: theme.spacing.md }}>
            Telling you where you rank
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            No Google API returns a search rank position, so Shoogle will not show one — here or
            anywhere else.
          </Text>
        </Card>
      </Section>

      <Pressable
        onPress={() =>
          toast.show({
            message: NO_REMOVAL_MESSAGE,
            tone: 'neutral',
            durationMs: 6000,
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Why can’t Shoogle remove a review?"
        style={({ pressed }) => [
          styles.footnote,
          { minHeight: theme.control.minTouchTarget, opacity: pressed ? 0.6 : 1 },
        ]}
        testID="reviews-removal-explainer">
        <Text variant="caption" tone="blue" style={{ fontFamily: theme.fontFamily.bold }}>
          Why can’t Shoogle remove a review?
        </Text>
      </Pressable>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Non-ready states                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Everything that is not a loaded page.
 *
 * `not_connected` gets its own presentation because it is the DEFAULT state of
 * this screen today, not an error in it — the copy says what is missing (an
 * approved Google API quota and a sign-in that does not exist yet) rather than
 * implying something went wrong.
 */
function ReviewsUnavailable({ state }: { state: DataState<GbpReviewPage> }) {
  const theme = useTheme();

  if (state.status === 'loading') {
    return <Card loading loadingHeight={180} testID="reviews-loading" />;
  }

  // The caller only reaches here for non-ready states; narrowing it explicitly
  // keeps that a type guarantee rather than a convention.
  if (state.status === 'ready') return null;

  if (state.status === 'error') {
    return (
      <EmptyState
        testID="reviews-error"
        title="Google did not answer"
        body={state.message}
        icon="alert-circle-outline"
      />
    );
  }

  if (state.reason === 'rate_limited') {
    return (
      <Card accent="amber" testID="reviews-rate-limited">
        <Text variant="cardTitle">Google is limiting requests right now</Text>
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          {state.message}
        </Text>
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
          Nothing is shown below rather than a shorter list, because a partial list would look like
          you have fewer reviews than you do.
        </Text>
      </Card>
    );
  }

  return (
    <EmptyState
      testID="reviews-unavailable"
      title={
        state.reason === 'not_connected'
          ? 'Google Business Profile is not connected'
          : 'Reviews are not available'
      }
      body={state.message}
      icon={state.reason === 'not_connected' ? 'link-outline' : 'ellipse-outline'}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Development scenario switcher                                              */
/* -------------------------------------------------------------------------- */

/**
 * DEVELOPMENT ONLY. Rendered exclusively when `getGbpReviewFixtures()` returned
 * a value, which requires `__DEV__` AND `EXPO_PUBLIC_ENABLE_FIXTURES=1`, and it
 * always sits under the fixture banner.
 *
 * It exists so the eight states this screen has to get right can be walked and
 * reviewed before any credential exists — including the four verification
 * outcomes, which are the ones a real Indian salon is most likely to land in.
 */
function ScenarioSwitcher({
  scenarios,
  value,
  onChange,
}: {
  scenarios: ReviewsScenario[];
  value: ReviewsScenarioId;
  onChange: (id: ReviewsScenarioId) => void;
}) {
  const theme = useTheme();
  const active = scenarios.find((scenario) => scenario.id === value) ?? null;

  return (
    <View style={{ marginBottom: theme.spacing.lg }} testID="reviews-scenarios">
      <Text variant="label" tone="muted2">
        Development states
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scenarioRow}
        style={{ marginTop: theme.spacing.sm }}>
        {scenarios.map((scenario) => {
          const selected = scenario.id === value;
          const { fg, bg } = theme.accent(selected ? 'blue' : 'neutral');
          return (
            <Pressable
              key={scenario.id}
              onPress={() => onChange(scenario.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show the ${scenario.label} state`}
              accessibilityHint={scenario.note}
              android_ripple={{ color: theme.colors.border }}
              testID={`reviews-scenario-${scenario.id}`}
              style={({ pressed }) => [
                styles.scenarioChip,
                {
                  minHeight: theme.control.minTouchTarget,
                  paddingHorizontal: theme.spacing.lg,
                  borderRadius: theme.radii.sm,
                  backgroundColor: bg,
                  borderColor: selected ? fg : theme.colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <Text
                variant="caption"
                style={{
                  color: selected ? fg : theme.colors.muted,
                  fontFamily: selected ? theme.fontFamily.bold : theme.fontFamily.semibold,
                }}>
                {scenario.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {active === null ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.sm }}
          testID="reviews-scenario-note">
          {active.note}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scenarioRow: { gap: 8, paddingRight: 8 },
  scenarioChip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  footnote: { justifyContent: 'center', marginTop: 12 },
});
