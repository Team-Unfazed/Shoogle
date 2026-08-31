import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen, TopBar, DataStateView } from '@/components/shared';
import { Button, EmptyState, Section, Text } from '@/components/ui';
import {
  AddMediaSheet,
  AgentMediaBanner,
  MediaCoverageCard,
  MediaStrip,
  MediaWriteGateNotice,
  PhotoViewsNotice,
  ScheduledMediaTimeline,
  WhyPublishCard,
  computeMediaCoverage,
  describeMediaAge,
  type GbpMediaItem,
  type MediaAgentState,
  type MediaCandidate,
  type ScheduledMediaItem,
} from '@/features/gbp/components/media';
import {
  classifyVoiceOfMerchant,
  describeVoiceOfMerchant,
  voiceOfMerchantGate,
  type VoiceOfMerchantExplanation,
} from '@/features/gbp';
import { getGbpFixtures } from '@/fixtures/gbp';
import { getGbpMediaFixtures, type GbpMediaFixtures } from '@/fixtures/gbp-media';
import { getProvider } from '@/lib/providers';
import type { ConnectionInfo } from '@/lib/providers/types';
import { loading, ready, unavailable, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * PHOTOS. Route `/seo/photos`. Owner: Pranay.
 *
 * The competitor's Photos tab, rebuilt without the two claims it cannot
 * support. Same surface area — an agent banner, the media strip with
 * relative-age badges, an add action, a "why publish?" explainer and a
 * scheduled-media timeline — and one card they do not have, which says that
 * photo views no longer exist.
 *
 * THE HONESTY THIS SCREEN IS BUILT AROUND
 * ---------------------------------------
 * 1. NO PHOTO PERFORMANCE. Google removed `PHOTOS_VIEWS_*`, `PHOTOS_COUNT_*`
 *    and `MediaInsights` on 2023-02-20 with no replacement, and documents
 *    `MediaItem.insights` as untrustworthy. `PhotoViewsNotice` renders that as
 *    `unavailable('not_supported')` with a dash — never 0, never "coming soon".
 *    It is on screen in EVERY state, including not-connected, because it is
 *    true in every state.
 * 2. MEASURED ZERO ≠ UNKNOWN. "Google answered and listed no photos" and "we
 *    have not been able to look" are different facts and render as visibly
 *    different panels. Neither renders as a 0.
 * 3. NO RANK CLAIM. Nothing here says photos lift a ranking. Google publishes
 *    no rank position through any API, so the claim is not checkable and is not
 *    made.
 * 4. NOTHING IS CONNECTED. No GBP credential exists, so the honest production
 *    path is the not-connected state — that is the DEFAULT, not the error.
 *    Upload is disabled with its reason printed beside it.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * The provider registry, which answers `not_connected` until `features/gbp`
 * registers a real implementation — and it deliberately does not. In
 * development with `EXPO_PUBLIC_ENABLE_FIXTURES=1`, `getGbpMediaFixtures()`
 * supplies a labelled library so the layout can be reviewed, under the banner
 * `showsFixtureData` pins to the top.
 */

/** What the screen is currently showing. */
interface MediaLibrary {
  items: GbpMediaItem[];
  scheduled: ScheduledMediaItem[];
  candidates: MediaCandidate[];
  /** The clock relative ages are measured against. */
  now: string;
  /** Voice of Merchant, when we know it. Null when nothing is connected. */
  verification: VoiceOfMerchantExplanation | null;
}

/**
 * The development switch. Three fixture worlds, each a state the real app will
 * meet, and each of which must look different from the others.
 */
type FixtureView = 'library' | 'measured_zero' | 'unverified';

const FIXTURE_VIEWS: { value: FixtureView; label: string; a11y: string }[] = [
  { value: 'library', label: 'Photos', a11y: 'Preview a profile with photos' },
  { value: 'measured_zero', label: 'Zero', a11y: 'Preview a profile Google reported zero photos for' },
  { value: 'unverified', label: 'Unverified', a11y: 'Preview a profile that is not verified with Google' },
];

/** Printed beside the disabled upload button. No credential exists to send with. */
const UPLOAD_BLOCKED_REASON =
  'Uploading is not connected. Shoogle has no Google Business Profile credentials yet, so nothing would be sent.';

export default function PhotosScreen() {
  const theme = useTheme();

  // Gated accessor: null outside development, so a release build cannot reach
  // fixture content at all.
  const [fixtures, setFixtures] = useState<GbpMediaFixtures | null>(() => getGbpMediaFixtures());
  const [fixtureView, setFixtureView] = useState<FixtureView>('library');
  const [connection, setConnection] = useState<DataState<ConnectionInfo>>(loading());
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (fixtures !== null) return;
    let cancelled = false;
    void getProvider('google_business')
      .getConnection()
      .then((next) => {
        if (!cancelled) setConnection(next);
      });
    return () => {
      cancelled = true;
    };
  }, [fixtures]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const next = getGbpMediaFixtures();
    setFixtures(next);
    if (next !== null) {
      // Fixtures are synchronous and local. There is nothing to wait for, and
      // inventing a delay would be progress theatre.
      setRefreshing(false);
      return;
    }
    void getProvider('google_business')
      .getConnection()
      .then((state) => {
        setConnection(state);
        setRefreshing(false);
      });
  }, []);

  const state = useMemo(
    () => resolveLibrary(fixtures, fixtureView, connection),
    [fixtures, fixtureView, connection],
  );

  const isFixture = state.status === 'ready' && state.isFixture === true;

  return (
    <Screen
      testID="photos-screen"
      header={<TopBar title="Photos" />}
      showsFixtureData={isFixture}
      edgeBottom
      refreshing={refreshing}
      onRefresh={handleRefresh}>
      <Text variant="screenTitle" accessibilityRole="header">
        Photos and videos
      </Text>
      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.xs }}>
        What your listing shows people, when it was last refreshed, and which kinds of photo are
        missing.
      </Text>

      {fixtures !== null ? (
        <View testID="fixture-view-switch" style={{ marginTop: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {FIXTURE_VIEWS.map((view) => (
              <Button
                key={view.value}
                label={view.label}
                variant={fixtureView === view.value ? 'primary' : 'secondary'}
                size="small"
                onPress={() => setFixtureView(view.value)}
                accessibilityLabel={view.a11y}
                style={{ flex: 1 }}
                testID={`fixture-view-${view.value}`}
              />
            ))}
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            Development switch. “Zero” is a profile Google answered about with no photos;
            “Unverified” is one we are not allowed to read. They are different facts.
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: theme.spacing.xl, gap: theme.layout.cardGap }}>
        <AgentMediaBanner state={agentStateFor(state)} />

        {/*
          No `onRetry` is passed. No provider is registered, so retrying would
          reach the same honest "not connected" answer — a retry button that
          cannot change anything is a dead control.
        */}
        <DataStateView state={state} testID="media-library-state" skeletonLines={4}>
          {(library) => (
            <View style={{ gap: theme.layout.cardGap }}>
              {library.verification === null ? null : (
                <MediaWriteGateNotice explanation={library.verification} />
              )}

              <Section
                first
                title="Your photos and videos"
                subtitle={
                  library.items.length === 0
                    ? 'Google listed none that you added.'
                    : `${library.items.length} ${
                        library.items.length === 1 ? 'photo or video' : 'photos and videos'
                      } you have added${
                        countPublishedByShoogle(library.items) > 0
                          ? ` · ${countPublishedByShoogle(library.items)} published by Shoogle`
                          : ''
                      }`
                }>
                {library.items.length === 0 ? (
                  /*
                    A MEASURED ZERO. Google answered, and the answer was none.
                    The copy says who answered and what they said, so it cannot
                    be confused with the unavailable panel above, which is what
                    renders when we could not look at all.
                  */
                  <EmptyState
                    testID="media-measured-zero"
                    icon="images-outline"
                    compact
                    title="No photos yet — and we checked"
                    body="Google answered and listed zero photos added by you. That is a measurement, not a gap in what Shoogle can see. Customer photos are not included in that list."
                  />
                ) : (
                  <MediaStrip items={library.items} now={library.now} />
                )}
              </Section>

              <MediaCoverageCard
                observation={computeMediaCoverage(library.items)}
                now={library.now}
              />
            </View>
          )}
        </DataStateView>

        <Button
          label="Add photos and videos"
          onPress={() => setSheetOpen(true)}
          accessibilityLabel="Add photos and videos"
          accessibilityHint="Opens the category picker and Google's size rules"
          testID="add-media-button"
        />

        <WhyPublishCard />

        {/*
          On screen in every state, including not connected. Photo views being
          gone is true whether or not a listing is linked, and burying it under
          a connection would make it look like something a connection unlocks.
        */}
        <PhotoViewsNotice />

        <Section
          title="Scheduled"
          subtitle="Photos Shoogle plans to publish. Google's media API has no scheduling, so these are Shoogle's own plans until a real call is made.">
          <ScheduledMediaTimeline
            items={state.status === 'ready' ? state.value.scheduled : []}
            now={state.status === 'ready' ? state.value.now : new Date().toISOString()}
          />
        </Section>
      </View>

      <AddMediaSheet
        visible={sheetOpen}
        onDismiss={() => setSheetOpen(false)}
        candidates={state.status === 'ready' ? state.value.candidates : []}
        blockedReason={UPLOAD_BLOCKED_REASON}
      />
    </Screen>
  );
}

function countPublishedByShoogle(items: readonly GbpMediaItem[]): number {
  return items.filter((item) => item.publishedByShoogle).length;
}

/** The banner's state, derived from the same `DataState` as everything else. */
function agentStateFor(state: DataState<MediaLibrary>): MediaAgentState {
  if (state.status !== 'ready') {
    if (state.status === 'unavailable' && state.reason !== 'not_connected') {
      return { kind: 'blocked', reason: state.message };
    }
    return { kind: 'not_connected' };
  }

  const observation = computeMediaCoverage(state.value.items);
  return {
    kind: 'measured',
    publishedByShoogle: observation.publishedByShoogle,
    itemCount: observation.totalItems,
    newest:
      observation.totalItems === 0
        ? null
        : describeMediaAge(observation.newestCreateTime, state.value.now),
  };
}

/**
 * Decides which state is true.
 *
 * Note what is NOT here: any branch that turns a missing connection, or a
 * profile we are not allowed to read, into an empty library. Each input maps to
 * exactly one honest statement, and only the fixture path can produce items.
 */
function resolveLibrary(
  fixtures: GbpMediaFixtures | null,
  view: FixtureView,
  connection: DataState<ConnectionInfo>,
): DataState<MediaLibrary> {
  if (fixtures !== null) {
    const gbp = getGbpFixtures();

    if (view === 'unverified') {
      // The likeliest real state for a small Indian business: Google has not
      // verified the listing. `voiceOfMerchantGate` owns the mapping from the
      // four remedial outcomes onto an `UnavailableReason`, so this screen
      // cannot drift from the rest of the GBP surface — and the last sentence
      // is the one that stops the panel reading as "you have no photos".
      const outcome = classifyVoiceOfMerchant(gbp?.voiceOfMerchant.verify ?? { verify: {} });
      const gate = voiceOfMerchantGate(outcome);
      if (gate !== null) {
        return unavailable(
          gate.reason,
          `${gate.message} Until then Shoogle has not read your photos — which is not the same as you having none.`,
        );
      }
    }

    const outcome = classifyVoiceOfMerchant(
      gbp?.voiceOfMerchant.healthy ?? { hasVoiceOfMerchant: true },
    );

    return ready<MediaLibrary>(
      {
        items: view === 'measured_zero' ? fixtures.emptyItems : fixtures.items,
        scheduled: view === 'measured_zero' ? [] : fixtures.scheduled,
        candidates: fixtures.candidates,
        now: fixtures.now,
        verification: describeVoiceOfMerchant(outcome),
      },
      fixtures.fetchedAt,
      true,
    );
  }

  switch (connection.status) {
    case 'loading':
      return loading();
    case 'ready':
      return connection.value.status === 'connected'
        ? /*
             Linked, but nothing has called `media.list` — no media method exists
             on the provider contract yet.

             `insufficient_data`, NOT `no_data_yet`. `no_data_yet` renders
             app-wide as "Nothing yet / There is no activity to report so far",
             which is a claim about the OWNER'S listing and a false one: the
             truth is that Shoogle has not looked. `insufficient_data` renders
             as "Not enough data", a statement about what we know. Same
             reasoning as `voiceOfMerchantGate`.
           */
          unavailable(
            'insufficient_data',
            'Your Google listing is linked, but Shoogle has not read your photos yet. This is not a count of zero.',
          )
        : unavailable(
            'not_connected',
            `Shoogle's access to your Google listing is ${connection.value.status}, so your photos have not been read.`,
          );
    case 'unavailable':
      return unavailable(connection.reason, connection.message);
    case 'error':
      return connection;
  }
}
