/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA. GBP Performance v1.
 *
 * Read fixtures/README.md before using anything here. Same gate as every other
 * fixture: `isFixtureModeEnabled()` requires `__DEV__` AND
 * `EXPO_PUBLIC_ENABLE_FIXTURES=1`, so a release build cannot reach a byte of it.
 *
 * Google publishes NO sandbox for the Business Profile APIs and recommends
 * mocked responses instead, so this is the test path Google itself names rather
 * than a shortcut around an integration.
 *
 * WHY THIS FILE IS SHAPED THE WAY IT IS
 * ------------------------------------
 * `app/seo/performance.tsx` exists to keep four different facts visually
 * distinct, and a fixture that only carries "a number" proves none of it. So
 * this response deliberately contains one of each, side by side, where a human
 * reviewing a screenshot can compare them:
 *
 *   MEASURED          `BUSINESS_IMPRESSIONS_*`, `CALL_CLICKS` — real counts,
 *                     including individual days whose value is the string "0".
 *   MEASURED ZERO     `BUSINESS_BOOKINGS` — Google reported every day of the
 *                     window and every day was zero. The total is a real 0 and
 *                     must render as `0`.
 *   NOT REPORTED      `BUSINESS_CONVERSATIONS` — Google returned no days at
 *                     all. Must render `—` with a reason, NEVER `0`.
 *   PARTLY REPORTED   `WEBSITE_CLICKS` — some days carry a `date` but no
 *                     `value`. proto3 omits defaults, so an absent value is
 *                     ambiguous between "zero" and "not reported"; we resolve
 *                     it as UNKNOWN and label the total as covering fewer days
 *                     than asked for.
 *   NOT APPLICABLE    `BUSINESS_FOOD_ORDERS` / `BUSINESS_FOOD_MENU_CLICKS` —
 *                     Google's own listing metadata says this profile cannot
 *                     have a food menu, so a restaurant metric is not shown to
 *                     a salon as 0. That is an observation, not an assumption.
 *
 * The sentinel `DAILY_METRIC_UNKNOWN` is present on purpose. It is not a
 * metric and not a zero, and the screen must drop it — this fixture is what
 * proves the drop happens in the real pipeline (`extractSeries`) rather than in
 * a hand-written branch.
 *
 * DETERMINISM
 * -----------
 * Day values come from a small integer LCG seeded by (metric index, day index),
 * never `Math.random()` and never the wall clock. The same fixture renders the
 * same pixels on every machine and in every test run.
 */

import { addDaysIso } from '@/features/gbp/performance';
import type {
  GbpDailyMetricTimeSeriesWire,
  GbpDatedValueWire,
  GbpFetchMultiDailyMetricsResponse,
  GoogleDate,
} from '@/features/gbp/types';
import { isFixtureModeEnabled } from '@/lib/env';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';

/** Fixed timestamp so snapshots are stable and nothing looks "live". */
const FIXTURE_TIMESTAMP = '2020-01-01T00:00:00.000Z';

/**
 * The window the fixture covers: 180 days, `2020-01-01`..`2020-06-28`.
 *
 * 180 is not arbitrary. The longest period the screen offers is 90 days, and
 * the change-vs-previous calculation needs the 90 days before that too. A
 * shorter fixture would make the 90-day comparison silently unavailable for a
 * reason that has nothing to do with Google.
 */
export const FIXTURE_PERFORMANCE_FIRST_DAY = '2020-01-01';
export const FIXTURE_PERFORMANCE_END_DATE = '2020-06-28';
export const FIXTURE_PERFORMANCE_DAY_COUNT = 180;

function googleDate(iso: string): GoogleDate {
  const [year = 0, month = 0, day = 0] = iso.split('-').map(Number);
  return { year, month, day };
}

/* -------------------------------------------------------------------------- */
/* Deterministic day values                                                   */
/* -------------------------------------------------------------------------- */

const LCG_MODULUS = 2147483647; // 2^31 - 1

/**
 * A stable pseudo-random number in [0, 1) for one (metric, day) pair.
 *
 * Every intermediate product stays under 2^53, so this is exact IEEE-754
 * arithmetic and produces identical output in Hermes, Node and the browser.
 */
function pseudoRandom(metricIndex: number, dayIndex: number): number {
  const seed = ((metricIndex + 1) * 1013904223 + (dayIndex + 1) * 1664525) % LCG_MODULUS;
  return ((seed * 48271) % LCG_MODULUS) / LCG_MODULUS;
}

interface SeriesSpec {
  readonly metric: string;
  /** Typical daily count. */
  readonly base: number;
  /** Peak-to-trough spread around `base`. */
  readonly swing: number;
  /** Google returned no time series at all for this metric. */
  readonly absent?: boolean;
  /** Every reported day is a genuine measured zero. */
  readonly allZero?: boolean;
  /** Days Google sent a `date` for but no `value` — unknown days, not zeros. */
  readonly unreported?: (dayIndex: number) => boolean;
  /** Days pinned to a real measured zero, so the chart always shows one. */
  readonly zeroed?: (dayIndex: number) => boolean;
}

/**
 * One spec per surviving `DailyMetric`, in `LIVE_DAILY_METRIC_ORDER`.
 *
 * The holes and zeros are pinned to specific day indices rather than left to
 * the generator, so the interesting cases are guaranteed to land inside the
 * 7-day window as well as the 28-day and 90-day ones.
 */
const SERIES_SPECS: readonly SeriesSpec[] = [
  { metric: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH', base: 86, swing: 44 },
  { metric: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', base: 63, swing: 34 },
  { metric: 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', base: 11, swing: 10 },
  { metric: 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', base: 5, swing: 6 },
  // Real counts with pinned measured-zero days: nobody tapped Call that day,
  // which is a finding, not a gap.
  { metric: 'CALL_CLICKS', base: 3, swing: 6, zeroed: (day) => day % 11 === 4 },
  // Days Google simply did not report. The total is therefore a floor.
  { metric: 'WEBSITE_CLICKS', base: 4, swing: 5, unreported: (day) => day % 17 === 3 },
  { metric: 'BUSINESS_DIRECTION_REQUESTS', base: 6, swing: 7 },
  // Google returned nothing. UNKNOWN — must render `—`, never `0`.
  { metric: 'BUSINESS_CONVERSATIONS', base: 0, swing: 0, absent: true },
  // Google reported every day and every day was zero. A real 0.
  { metric: 'BUSINESS_BOOKINGS', base: 0, swing: 0, allZero: true },
  // Not applicable to a salon; see `fixtureGbpProfileCapabilities`.
  { metric: 'BUSINESS_FOOD_ORDERS', base: 0, swing: 0, absent: true },
  { metric: 'BUSINESS_FOOD_MENU_CLICKS', base: 0, swing: 0, absent: true },
];

function datedValuesFor(spec: SeriesSpec, metricIndex: number): GbpDatedValueWire[] {
  const values: GbpDatedValueWire[] = [];

  for (let dayIndex = 0; dayIndex < FIXTURE_PERFORMANCE_DAY_COUNT; dayIndex += 1) {
    const iso = addDaysIso(FIXTURE_PERFORMANCE_FIRST_DAY, dayIndex);
    // FIXTURE_PERFORMANCE_FIRST_DAY is a literal in this file, so null here
    // means the shared date maths regressed rather than a bad input. Failing
    // loudly beats emitting a day with a broken date that the pipeline would
    // then silently discard, quietly shrinking the fixture window.
    if (iso === null) {
      throw new Error(
        `Fixture date arithmetic failed for ${FIXTURE_PERFORMANCE_FIRST_DAY} + ${dayIndex} days`,
      );
    }

    // A date with no `value` is how Google says nothing for a day. We keep it
    // rather than dropping the row, because "there was a day here and we have
    // no reading for it" is exactly the fact the screen has to show.
    if (spec.unreported?.(dayIndex) === true) {
      values.push({ date: googleDate(iso) });
      continue;
    }

    const count =
      spec.allZero === true || spec.zeroed?.(dayIndex) === true
        ? 0
        : Math.max(0, Math.round(spec.base + (pseudoRandom(metricIndex, dayIndex) - 0.5) * spec.swing));

    // int64 arrives as a STRING on the wire, including for zero.
    values.push({ date: googleDate(iso), value: String(count) });
  }

  return values;
}

function buildTimeSeries(): GbpDailyMetricTimeSeriesWire[] {
  const series: GbpDailyMetricTimeSeriesWire[] = SERIES_SPECS.map((spec, metricIndex) => ({
    dailyMetric: spec.metric,
    timeSeries: {
      datedValues: spec.absent === true ? [] : datedValuesFor(spec, metricIndex),
    },
  }));

  // The enum's default member. It is neither a metric nor a zero, and the
  // screen must drop it. Kept here so that rule is exercised end to end.
  series.push({
    dailyMetric: 'DAILY_METRIC_UNKNOWN',
    timeSeries: {
      datedValues: [{ date: googleDate(FIXTURE_PERFORMANCE_END_DATE), value: '9999' }],
    },
  });

  return series;
}

/**
 * The fixture `fetchMultiDailyMetricsTimeSeries` response.
 *
 * This is the WIRE shape on purpose. Handing the screen a pre-normalised object
 * would skip the exact code — `extractSeries`, `parseCount`, `totalOver` —
 * whose job is to keep zero and unknown apart.
 */
export const fixtureGbpPerformanceResponse: GbpFetchMultiDailyMetricsResponse = {
  multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: buildTimeSeries() }],
};

/* -------------------------------------------------------------------------- */
/* Profile capabilities — where "not applicable" comes from                   */
/* -------------------------------------------------------------------------- */

/**
 * Read from `location.metadata.canHaveFoodMenus` on the Business Information
 * API. It is a fact Google states about this listing, which is why the screen
 * can say "not applicable" instead of guessing from the category name.
 */
export const fixtureGbpProfileCapabilities = Object.freeze({
  canHaveFoodMenus: false as boolean | null,
  categoryLabel: '[FIXTURE] Salon' as string | null,
});

/* -------------------------------------------------------------------------- */
/* Gated access                                                               */
/* -------------------------------------------------------------------------- */

export interface GbpPerformanceFixtures {
  readonly response: GbpFetchMultiDailyMetricsResponse;
  readonly capabilities: typeof fixtureGbpProfileCapabilities;
  /** The last day the fixture is willing to claim a reading for. */
  readonly endDate: string;
}

/**
 * The ONLY sanctioned way to read these fixtures.
 *
 * Returns null unless fixture mode is on, so the honest "nothing here" path is
 * always exercised too — and in a release build there is no other path.
 */
export function getGbpPerformanceFixtures(): GbpPerformanceFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    response: fixtureGbpPerformanceResponse,
    capabilities: fixtureGbpProfileCapabilities,
    endDate: FIXTURE_PERFORMANCE_END_DATE,
  };
}

/**
 * Wrap a fixture value in a `DataState` carrying `isFixture: true`, so the flag
 * travels with the data instead of depending on someone remembering the banner.
 *
 * With fixture mode off this returns `not_connected` — the same answer the real
 * adapter gives today, because no Google Business Profile is linked.
 */
export function gbpPerformanceFixtureState<T>(value: T): DataState<T> {
  if (!isFixtureModeEnabled()) {
    return unavailable(
      'not_connected',
      'No Google Business Profile is connected, so Google has not been asked for any of these numbers.',
    );
  }
  return ready(value, FIXTURE_TIMESTAMP, true);
}
