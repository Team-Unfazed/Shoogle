/**
 * PERFORMANCE. Route: `/seo/performance`. Feature owner: Pranay.
 *
 * WHAT THIS SCREEN IS FOR
 * -----------------------
 * Google's Business Profile Performance API v1 returns exactly eleven metrics.
 * That is the entire universe of performance data available to any product,
 * including every competitor. This screen shows all eleven, grouped so an owner
 * can read them, and — this is the part nobody else ships — says which of the
 * eleven Google actually answered for.
 *
 * THE COMPETITOR ROW THIS REPLACES
 * --------------------------------
 * Grexa's Performance tab opens with "Performance Analysis — review results in
 * 2 weeks >". No metric, no period, no statement of what was measured. It is a
 * promise with nothing behind it. Every number on this screen instead carries
 * its metric, the window it covers, and its status: measured, a genuine zero,
 * only partly reported, unknown, or inapplicable to this business — with the
 * reason attached in each case.
 *
 * THE FIVE STATES, AND WHY THEY MUST LOOK DIFFERENT
 * -------------------------------------------------
 *   measured        `61`  Google reported every day and this is the total.
 *   measured zero   `0`   Google counted and found none. A finding, not a gap.
 *   partly reported `N`   Labelled "Google reported 26 of 28 days" — a floor.
 *   not reported    `—`   Google said nothing. UNKNOWN. Never rendered as 0.
 *   not applicable  `—`   Google's own `canHaveFoodMenus = false` says a food
 *                         metric cannot happen here, so a restaurant number is
 *                         never shown to a salon as 0.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * In development with fixtures on: a labelled fixture response, run through the
 * real normalisation pipeline, under the fixture banner. Otherwise the adapter
 * is asked and its answer is rendered verbatim — which today is
 * `not_connected`, because no Google Business Profile is linked and no API
 * quota has been approved. There is no third path where this screen invents a
 * number.
 *
 * `not_connected` is the DEFAULT state, not an error, and the screen is laid
 * out for it: the "what Google removed in 2023" section renders in every state,
 * because it is documentation about Google rather than data about this
 * business — and it is the single most useful thing here for an owner arriving
 * from another tool wondering where their post views went.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Screen, TopBar } from '@/components/shared';
import { Text } from '@/components/ui';
import { googleBusinessProfileProvider } from '@/features/gbp';
import {
  DEFAULT_PERIOD,
  PerformanceView,
  UNKNOWN_PROFILE_CAPABILITIES,
  snapshotFromReport,
  snapshotFromResponse,
  type PerformanceSnapshot,
  type ProfileCapabilities,
} from '@/features/gbp/components/performance';
import { parsePerformancePeriod } from '@/features/gbp/performance';
import { getGbpPerformanceFixtures, gbpPerformanceFixtureState } from '@/fixtures/gbp-performance';
import { loading, mapData, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * We have no location id, because nothing is connected. The adapter is still
 * the thing that answers — asking it keeps the owner-facing copy in one place,
 * and the day a connection exists the only change here is passing a real id.
 * Inventing one would be a request we never made.
 */
const NO_LOCATION_ID = '';

export default function PerformanceScreen() {
  const theme = useTheme();
  const [periodKey, setPeriodKey] = useState<string>(DEFAULT_PERIOD.key);
  const [providerState, setProviderState] = useState<DataState<PerformanceSnapshot>>(loading());
  const [attempt, setAttempt] = useState(0);

  const period = parsePerformancePeriod(periodKey) ?? DEFAULT_PERIOD;

  /**
   * The fixture path is a pure derivation, not an effect: the bytes are already
   * in the bundle, so re-windowing them for a new period is a computation. It
   * runs through `snapshotFromResponse` — the WIRE response through the real
   * pipeline — which is what drops `DAILY_METRIC_UNKNOWN` and what stops a day
   * Google never reported from turning into a zero.
   *
   * `getGbpPerformanceFixtures()` is the gated accessor and returns null
   * outside development, so a release build cannot reach any of it.
   */
  const fixtureState = useMemo<DataState<PerformanceSnapshot> | null>(() => {
    const fixtures = getGbpPerformanceFixtures();
    if (fixtures === null) return null;

    const capabilities: ProfileCapabilities = fixtures.capabilities;
    return gbpPerformanceFixtureState(
      snapshotFromResponse(fixtures.response, capabilities, period, fixtures.endDate),
    );
  }, [period]);

  useEffect(() => {
    // With fixtures on, no request is made at all — asking Google for numbers
    // we are about to overwrite with invented ones would be dishonest work.
    if (fixtureState !== null) return;

    let cancelled = false;
    void googleBusinessProfileProvider
      .getPerformanceReport(NO_LOCATION_ID, period.key)
      .then((next) => {
        if (cancelled) return;
        setProviderState(
          mapData(next, (report) =>
            // Capabilities are unknown on this path, and unknown never produces
            // a "not applicable" — it leaves the metric visible with whatever
            // Google reported for it.
            snapshotFromReport(report, UNKNOWN_PROFILE_CAPABILITIES, period),
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [fixtureState, period, attempt]);

  const state = fixtureState ?? providerState;

  /** Changing the window discards the old one rather than relabelling it. */
  const handlePeriodChange = useCallback((key: string) => {
    setProviderState(loading());
    setPeriodKey(key);
  }, []);

  const handleRetry = useCallback(() => {
    setProviderState(loading());
    setAttempt((value) => value + 1);
  }, []);

  const showsFixtureData = state.status === 'ready' && state.isFixture === true;

  return (
    <Screen
      testID="performance-screen"
      header={<TopBar />}
      edgeBottom
      showsFixtureData={showsFixtureData}>
      <Text variant="screenTitle">Performance</Text>
      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: 6, marginBottom: theme.spacing.lg }}>
        The eleven numbers Google still reports about your profile. Each one says the period it
        covers and whether Google measured it, measured it as zero, or never answered. Nothing here
        is estimated, and a number we do not have is never shown as 0.
      </Text>

      <PerformanceView
        state={state}
        periodKey={periodKey}
        onPeriodChange={handlePeriodChange}
        onRetry={handleRetry}
      />
    </Screen>
  );
}
