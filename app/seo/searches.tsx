/**
 * WHAT PEOPLE SEARCHED. Route: `/seo/searches`. Feature owner: Pranay.
 *
 * This screen exists because the feature every competitor sells — a rank
 * number — cannot be built honestly. Google publishes no search-rank position
 * through any API; the only sources that do are paid SERP scrapers. So instead
 * of a number nobody can verify, this shows the thing Google DOES report:
 * `locations.searchkeywords.impressions.monthly`, the actual queries that
 * surfaced the listing.
 *
 * For a salon owner, "1,240 people found you searching 'hair spa near me'"
 * beats "you are rank 4" on every axis that matters. It is true, it names the
 * words customers used, and it can be acted on this afternoon.
 *
 * THE HARD PART, AND THE REASON `features/seo/keywords.ts` EXISTS
 * --------------------------------------------------------------
 * Impressions come back as a union: an exact count OR a below-threshold marker.
 * For a neighbourhood salon MOST terms are below the threshold. Rendering one
 * as `15` fabricates data and rendering it as `0` breaks "unknown is not zero"
 * twice over, so every value on this screen goes through
 * `formatKeywordImpressions` — `<15`, never `15`, never `0` — and every
 * accessibility label through `describeKeywordImpressions`, because `<15` read
 * aloud on its own is a broken number.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * In development with fixtures on, a labelled fixture report, under the fixture
 * banner. Otherwise the provider is asked and its answer is rendered verbatim —
 * which today is `not_connected`, because no Google Business Profile is linked.
 * There is no third path where the screen invents something.
 */

import { useEffect, useState } from 'react';

import { Screen, TopBar } from '@/components/shared';
import { Text } from '@/components/ui';
import { seoProvider, type SearchKeywordsReport } from '@/features/seo';
import { SearchKeywordsView } from '@/features/seo/components';
import { getSeoFixtures, seoFixtureState } from '@/fixtures/seo';
import { loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * We have no location id, because nothing is connected. The provider is still
 * the thing that answers — asking it keeps the owner-facing copy in one place,
 * and the day a connection exists the only change here is passing a real id.
 * Inventing one would be a request we never made.
 */
const NO_LOCATION_ID = '';

/** `YYYY-MM-01` for the current month, which is how the API keys the report. */
function currentMonthStart(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * The gated fixture read, done once at mount rather than in an effect.
 *
 * `getSeoFixtures()` returns null outside development, so a release build
 * cannot reach fixture content at all — and null here means the screen falls
 * through to the provider, which is the honest path.
 */
function readFixtureKeywords(): DataState<SearchKeywordsReport> | null {
  const fixtures = getSeoFixtures();
  return fixtures === null ? null : seoFixtureState(fixtures.keywords);
}

export default function SearchesScreen() {
  const theme = useTheme();

  // Lazy initialiser: evaluated once, on mount. Not an effect, so there is no
  // render where the screen shows a state it has not established.
  const [fixtureState] = useState<DataState<SearchKeywordsReport> | null>(readFixtureKeywords);
  const [providerState, setProviderState] = useState<DataState<SearchKeywordsReport>>(loading());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Fixtures win in development and there is nothing to fetch.
    if (fixtureState !== null) return;

    let cancelled = false;
    void seoProvider.getSearchKeywords(NO_LOCATION_ID, currentMonthStart()).then((next) => {
      if (!cancelled) setProviderState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [attempt, fixtureState]);

  const retry = (): void => {
    // Both updates happen in the event handler, so the effect never has to set
    // state synchronously to show that a refetch is in flight.
    setProviderState(loading());
    setAttempt((value) => value + 1);
  };

  const state = fixtureState ?? providerState;
  const showsFixtureData = state.status === 'ready' && state.isFixture === true;

  return (
    <Screen
      testID="searches-screen"
      header={<TopBar />}
      edgeBottom
      showsFixtureData={showsFixtureData}>
      <Text variant="screenTitle">What people searched</Text>
      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: 6, marginBottom: theme.spacing.lg }}>
        The words people typed into Google before your profile appeared. Google reports these
        instead of a rank, and they are more useful anyway — they are the phrases your next
        customer is already using.
      </Text>

      <SearchKeywordsView state={state} onRetry={retry} />
    </Screen>
  );
}
