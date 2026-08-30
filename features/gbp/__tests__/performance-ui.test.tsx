/**
 * `app/seo/performance.tsx` — the Performance screen.
 *
 * THE RULES UNDER TEST
 * --------------------
 * Google's Performance v1 API produces five genuinely different situations for
 * a single metric, and four of them become an indistinguishable `0` if anyone
 * gets lazy. These tests pin all five as separately visible facts:
 *
 *   MEASURED         a real total, with the window it covers
 *   MEASURED ZERO    `0`, labelled as a measurement, NOT the same pixels as
 *   NOT REPORTED     `—` with a reason that says out loud it is not zero
 *   PARTLY REPORTED  a total labelled "Google reported 26 of 28 days"
 *   NOT APPLICABLE   `—` with the observation it rests on, so a restaurant
 *                    metric is never shown to a salon as 0
 *
 * Plus the two things that must be true in every state: `DAILY_METRIC_UNKNOWN`
 * never reaches a label or a bar, and no rank position is rendered anywhere,
 * ever.
 *
 * The second half pins the honest empty states. `not_connected` is what a real
 * build reports today — it is the DEFAULT state, not an error — and the
 * "removed in 2023" section has to survive it, because that section is
 * documentation about Google rather than data about the owner.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import PerformanceScreen from '@/app/seo/performance';
import { ToastProvider, formatMetricValue } from '@/components/ui';
import {
  DEFAULT_PERIOD,
  PerformanceView,
  buildSnapshot,
  chartableMetrics,
  combinedImpressions,
  describeSeries,
  explanationFor,
  formatShortDay,
  notApplicableObservation,
  snapshotFromResponse,
  statusChipFor,
  type PerformanceRow,
  type ProfileCapabilities,
} from '@/features/gbp/components/performance';
import { LIVE_DAILY_METRICS, LIVE_DAILY_METRIC_ORDER } from '@/features/seo';
import {
  FIXTURE_PERFORMANCE_END_DATE,
  fixtureGbpPerformanceResponse,
  fixtureGbpProfileCapabilities,
} from '@/fixtures/gbp-performance';
import { failed, loading, ready, unavailable } from '@/lib/state/DataState';
import { ThemeProvider } from '@/theme';
import { control } from '@/theme/tokens';

let mockFixtures = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    ...actual,
    isFixtureModeEnabled: () => mockFixtures,
    isDevPreviewEnabled: () => false,
    isSupabaseConfigured: () => false,
  };
});

function renderScreen() {
  return renderRouter(
    {
      'seo/performance': () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>
            <PerformanceScreen />
          </ToastProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: '/seo/performance' },
  );
}

/** RNTL 14 returns a promise from `render`, so every render is awaited. */
async function renderView(element: React.JSX.Element) {
  return render(
    <ThemeProvider forceScheme="light">
      <ToastProvider>{element}</ToastProvider>
    </ThemeProvider>,
  );
}

/**
 * Press, then let React settle.
 *
 * `fireEvent.press` on its own leaves React 19's act scope open while the
 * adapter's promise resolves in the same tick, which surfaces as "overlapping
 * act() calls" and leaves every later render empty. Wrapping the press in an
 * async act flushes both, and is the supported way to do it.
 */
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

/* -------------------------------------------------------------------------- */
/* Independent re-derivation from the wire fixture                            */
/* -------------------------------------------------------------------------- */

/**
 * Sum a metric straight out of the wire fixture, without going through the
 * model. If the screen and this disagree, one of them is wrong — which is the
 * point of not reusing the production sum here.
 */
function sumFromWire(metric: string, startDate: string, endDate: string): number {
  const entries =
    fixtureGbpPerformanceResponse.multiDailyMetricTimeSeries?.[0]?.dailyMetricTimeSeries ?? [];
  const found = entries.find((entry) => entry.dailyMetric === metric);
  let total = 0;

  for (const value of found?.timeSeries?.datedValues ?? []) {
    const year = value.date?.year;
    const month = value.date?.month;
    const day = value.date?.day;
    if (year === undefined || month === undefined || day === undefined) continue;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (iso < startDate || iso > endDate) continue;
    if (value.value === undefined) continue;
    total += Number(value.value);
  }

  return total;
}

/** The 28-day window the screen opens on: 2020-06-01 .. 2020-06-28. */
const WINDOW_28 = { start: '2020-06-01', end: FIXTURE_PERFORMANCE_END_DATE };

const IMPRESSION_METRICS = [
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
] as const;

afterEach(() => {
  mockFixtures = false;
});

/* -------------------------------------------------------------------------- */

describe('the five readings, side by side', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('renders all eleven surviving metrics and nothing else', async () => {
    await renderScreen();

    for (const metric of LIVE_DAILY_METRIC_ORDER) {
      expect(screen.getAllByText(LIVE_DAILY_METRICS[metric].label).length).toBeGreaterThan(0);
    }
    expect(LIVE_DAILY_METRIC_ORDER).toHaveLength(11);
  });

  it('renders a measured zero as 0 and says it was measured', async () => {
    await renderScreen();

    // Google reported every day of the window for bookings and every day was 0.
    const value = screen.getByTestId('metric-BUSINESS_BOOKINGS-value');
    expect(within(value).getByText('0')).toBeOnTheScreen();

    const status = screen.getByTestId('metric-BUSINESS_BOOKINGS-status');
    expect(within(status).getByText('Measured zero')).toBeOnTheScreen();

    expect(
      screen.getByText(
        'Google measured every day of this period and counted none. This is a real zero, not a missing number.',
      ),
    ).toBeOnTheScreen();
  });

  it('renders an unreported metric as a dash and says out loud it is not zero', async () => {
    await renderScreen();

    // Google returned no days at all for conversations.
    const value = screen.getByTestId('metric-BUSINESS_CONVERSATIONS-value');
    expect(within(value).getByText('—')).toBeOnTheScreen();
    expect(within(value).queryByText('0')).toBeNull();

    const status = screen.getByTestId('metric-BUSINESS_CONVERSATIONS-status');
    expect(within(status).getByText('Not reported')).toBeOnTheScreen();

    expect(
      screen.getByText(
        'Google returned no days for this metric, so there is no number to show. It is unknown — not zero.',
      ),
    ).toBeOnTheScreen();
  });

  it('keeps the measured zero and the unknown visibly apart on the same screen', async () => {
    await renderScreen();

    const zero = screen.getByTestId('metric-BUSINESS_BOOKINGS-value');
    const unknown = screen.getByTestId('metric-BUSINESS_CONVERSATIONS-value');

    // The zero has a number and no dash; the unknown has a dash and no number.
    expect(within(zero).getByText('0')).toBeOnTheScreen();
    expect(within(zero).queryByText('—')).toBeNull();
    expect(within(unknown).getByText('—')).toBeOnTheScreen();
    expect(within(unknown).queryByText('0')).toBeNull();
  });

  it('labels a partly reported window as covering fewer days, not as a total', async () => {
    await renderScreen();

    // Website clicks has two days in the 28-day window that Google sent a date
    // for but no value. Those are unknown days, not zeros.
    expect(
      screen.getByText('last 28 days — Google reported 26 of 28 days'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        /Google reported 26 of 28 days, so this is at least \d+ — the missing days have no reading and have not been filled in with zeros\./,
      ),
    ).toBeOnTheScreen();
  });

  it('does not show a restaurant metric to a salon as 0, and names the observation', async () => {
    await renderScreen();

    for (const metric of ['BUSINESS_FOOD_ORDERS', 'BUSINESS_FOOD_MENU_CLICKS']) {
      const status = screen.getByTestId(`metric-${metric}-status`);
      expect(within(status).getByText('Not applicable')).toBeOnTheScreen();

      const value = screen.getByTestId(`metric-${metric}-value`);
      expect(within(value).getByText('—')).toBeOnTheScreen();
      expect(within(value).queryByText('0')).toBeNull();
    }

    expect(
      screen.getAllByText(
        "Google's listing data reports canHaveFoodMenus = false for this profile, listed as [FIXTURE] Salon. A metric that cannot happen here is not shown as 0.",
      ).length,
    ).toBe(2);
  });

  it('adds the four impression splits only because all four are complete, and says so', async () => {
    await renderScreen();

    const expected = IMPRESSION_METRICS.reduce(
      (sum, metric) => sum + sumFromWire(metric, WINDOW_28.start, WINDOW_28.end),
      0,
    );

    const combined = screen.getByTestId('combined-impressions-value');
    expect(within(combined).getByText(formatMetricValue(expected, 'count'))).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Google does not publish a single "profile views" number any more. This is the sum of all 4 splits below, each of which Google reported for every day of the period.',
      ),
    ).toBeOnTheScreen();
  });

  it('marks fixture data as fixture data', async () => {
    await renderScreen();
    expect(screen.getByTestId('fixture-banner')).toBeOnTheScreen();
  });
});

describe('the sentinel and the rank that do not exist', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('never renders DAILY_METRIC_UNKNOWN, in any form', async () => {
    await renderScreen();

    expect(screen.queryByText(/DAILY_METRIC_UNKNOWN/)).toBeNull();
    expect(screen.queryByText(/Unknown metric/i)).toBeNull();
    // The sentinel series in the fixture carries the value 9999.
    expect(screen.queryByText('9,999')).toBeNull();
    expect(screen.queryByText('9999')).toBeNull();
  });

  it('drops the sentinel before a row is ever built', () => {
    const snapshot = snapshotFromResponse(
      fixtureGbpPerformanceResponse,
      fixtureGbpProfileCapabilities,
      DEFAULT_PERIOD,
      FIXTURE_PERFORMANCE_END_DATE,
    );

    expect(snapshot.rows).toHaveLength(11);
    expect(snapshot.rows.map((row) => row.metric)).toEqual([...LIVE_DAILY_METRIC_ORDER]);
    expect(snapshot.series.some((entry) => String(entry.metric) === 'DAILY_METRIC_UNKNOWN')).toBe(
      false,
    );
  });

  it('never renders a rank position, and says why', async () => {
    await renderScreen();

    expect(screen.getByTestId('no-rank-note')).toBeOnTheScreen();
    expect(screen.getByText('No rank, ever')).toBeOnTheScreen();
    expect(screen.queryByText(/#\d/)).toBeNull();
    expect(screen.queryByText(/\brank(ing)? \d/i)).toBeNull();
  });
});

describe('what Google removed in 2023', () => {
  it('names the removed metrics even with nothing connected', async () => {
    mockFixtures = false;
    await renderScreen();

    expect(await screen.findByTestId('removed-metrics')).toBeOnTheScreen();
    expect(screen.getByText('Views of your Google posts')).toBeOnTheScreen();
    expect(screen.getByText('Clicks on your post buttons')).toBeOnTheScreen();
    expect(screen.getByText('Views of photos you posted')).toBeOnTheScreen();
    expect(screen.getByText('Where direction requests came from')).toBeOnTheScreen();
  });

  it('renders every removed metric as a dash with a date, never as 0 or "coming soon"', async () => {
    mockFixtures = false;
    await renderScreen();

    const row = await screen.findByTestId('removed-metric-LOCAL_POST_VIEWS_SEARCH');
    expect(within(row).getByText('—')).toBeOnTheScreen();
    expect(within(row).queryByText('0')).toBeNull();
    expect(within(row).getByText('Removed by Google · 20 Feb 2023')).toBeOnTheScreen();
    expect(
      within(row).getByText(
        'Google removed post performance from its API in 2023 and did not replace it.',
      ),
    ).toBeOnTheScreen();

    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByText(/we.re working on/i)).toBeNull();
  });

  it('expands to the full list, and the control actually does something', async () => {
    mockFixtures = false;
    await renderScreen();

    await screen.findByTestId('performance-unavailable');
    expect(screen.queryByTestId('removed-metric-PHOTOS_COUNT_CUSTOMERS')).toBeNull();

    await press(screen.getByTestId('removed-metrics-toggle'));

    expect(screen.getByTestId('removed-metric-PHOTOS_COUNT_CUSTOMERS')).toBeOnTheScreen();
    expect(screen.getByText('Show fewer')).toBeOnTheScreen();
  });

  it('separates renamed metrics from deleted ones, so an old label has an answer', async () => {
    mockFixtures = false;
    await renderScreen();

    expect(await screen.findByTestId('renamed-metrics-card')).toBeOnTheScreen();
    expect(screen.getByText('Maps views')).toBeOnTheScreen();
    expect(
      screen.getByText('Now: Maps impressions (desktop) + Maps impressions (mobile)'),
    ).toBeOnTheScreen();
  });
});

describe('honest states when there is nothing to show', () => {
  it('reports the adapter’s own not-connected answer, with no fixture leakage', async () => {
    mockFixtures = false;
    await renderScreen();

    expect(
      await screen.findByText(
        'Shoogle cannot reach Google Business Profile yet. Google has not approved our API access, and the sign-in that would connect your profile does not exist yet. Nothing here is real data, and nothing is hidden from you.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Nothing measured yet')).toBeOnTheScreen();

    expect(screen.queryByTestId('fixture-banner')).toBeNull();
    expect(screen.queryByText('[FIXTURE] Salon')).toBeNull();
    // Nothing unknown is rendered as a number of any kind.
    expect(screen.queryByText('0')).toBeNull();
  });

  it('hides the period control when there is nothing to re-window — no dead controls', async () => {
    mockFixtures = false;
    await renderScreen();

    expect(await screen.findByTestId('performance-unavailable')).toBeOnTheScreen();
    expect(screen.queryByTestId('period-tabs')).toBeNull();
    expect(screen.queryByTestId('chart-metric-tabs')).toBeNull();
  });

  it('shows a skeleton while loading, not an empty chart', async () => {
    await renderView(
      <PerformanceView state={loading()} periodKey="28d" onPeriodChange={() => {}} />,
    );

    expect(screen.getByTestId('performance-state')).toBeOnTheScreen();
    expect(screen.queryByTestId('daily-series-chart')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('offers a retry on a retryable error and still explains the removed metrics', async () => {
    const onRetry = jest.fn();
    await renderView(
      <PerformanceView
        state={failed('gbp_http_500', 'Google returned an error.', true)}
        periodKey="28d"
        onPeriodChange={() => {}}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Google returned an error.')).toBeOnTheScreen();
    expect(screen.getByTestId('removed-metrics')).toBeOnTheScreen();
  });

  it('says a rate limit is a Google limit, not an empty period', async () => {
    await renderView(
      <PerformanceView
        state={unavailable('rate_limited', 'Google is throttling Shoogle right now.')}
        periodKey="28d"
        onPeriodChange={() => {}}
      />,
    );

    expect(screen.getByText('Google is limiting requests')).toBeOnTheScreen();
    expect(screen.getByText('Google is throttling Shoogle right now.')).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('the period control', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('re-windows every number when the period changes', async () => {
    await renderScreen();

    expect(screen.getAllByText('last 28 days').length).toBeGreaterThan(0);

    await press(screen.getByText('7 days'));

    expect(screen.getByText('last 7 days — Google reported 6 of 7 days')).toBeOnTheScreen();
    expect(screen.queryByText('last 28 days')).toBeNull();
  });
});

describe('the day-by-day chart', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('draws bars and keeps the numbers as real text beside them', async () => {
    await renderScreen();

    expect(screen.getByTestId('daily-series-chart')).toBeOnTheScreen();

    // The bars are deliberately hidden from assistive technology — every fact
    // they encode is in the text below — so the query has to opt into hidden
    // elements to see them at all. That opt-in IS the assertion.
    const plot = screen.getByTestId('daily-series-chart-plot', { includeHiddenElements: true });
    expect(plot.props.importantForAccessibility).toBe('no-hide-descendants');
    // One mark per day of the 28-day window, including the days with no reading.
    expect(plot.children).toHaveLength(28);

    // Every number the bars encode is also a real text node, and the spoken
    // summary says the same thing rather than a friendlier different thing.
    expect(screen.getByText(/Google reported 28 of 28 days\./)).toBeOnTheScreen();
    const summary = screen.getByTestId('daily-series-chart-summary');
    expect(String(summary.props.accessibilityLabel)).toContain('28 of 28 days reported by Google.');
    expect(String(summary.props.accessibilityLabel)).toContain('Busiest day');
  });

  it('names measured-zero days and no-reading days separately in the legend', async () => {
    await renderScreen();

    const chart = within(screen.getByTestId('chart-card'));
    expect(chart.getByText('Measured')).toBeOnTheScreen();
    expect(chart.getByText('Measured zero')).toBeOnTheScreen();
    expect(chart.getByText('No reading')).toBeOnTheScreen();
  });

  it('counts unreported days out loud rather than drawing them as zero', async () => {
    await renderScreen();

    // Switch the chart to the metric that has holes in the window.
    await press(within(screen.getByTestId('chart-metric-tabs')).getByText('Website clicks'));

    expect(
      screen.getByText(
        /2 days have no reading at all — those are the empty slots, and they are not zeros\./,
      ),
    ).toBeOnTheScreen();
  });
});

/* -------------------------------------------------------------------------- */
/* The model                                                                  */
/* -------------------------------------------------------------------------- */

const SALON: ProfileCapabilities = fixtureGbpProfileCapabilities;

function snapshot28() {
  return snapshotFromResponse(
    fixtureGbpPerformanceResponse,
    SALON,
    DEFAULT_PERIOD,
    FIXTURE_PERFORMANCE_END_DATE,
  );
}

describe('the model keeps zero, unknown and inapplicable apart', () => {
  it('reads a window of measured zeros as a measured total of 0', () => {
    const row = snapshot28().rows.find((entry) => entry.metric === 'BUSINESS_BOOKINGS');
    expect(row?.reading).toEqual({
      kind: 'measured',
      total: 0,
      changePct: null,
      coverage: { reportedDays: 28, totalDays: 28 },
    });
  });

  it('reads an absent series as not reported, never as a zero total', () => {
    const row = snapshot28().rows.find((entry) => entry.metric === 'BUSINESS_CONVERSATIONS');
    expect(row?.reading.kind).toBe('not_reported');
    expect(JSON.stringify(row?.reading)).not.toContain('"total"');
  });

  it('carries coverage for a partly reported window so the total reads as a floor', () => {
    const row = snapshot28().rows.find((entry) => entry.metric === 'WEBSITE_CLICKS');
    expect(row?.reading.kind).toBe('measured');
    if (row?.reading.kind !== 'measured') throw new Error('expected a measured reading');
    expect(row.reading.coverage).toEqual({ reportedDays: 26, totalDays: 28 });
    expect(row.reading.total).toBe(sumFromWire('WEBSITE_CLICKS', WINDOW_28.start, WINDOW_28.end));
    expect(row.periodLabel).toBe('last 28 days — Google reported 26 of 28 days');
  });

  it('only calls a metric inapplicable when Google said so', () => {
    expect(notApplicableObservation('BUSINESS_FOOD_ORDERS', SALON)).toContain(
      'canHaveFoodMenus = false',
    );
    // Unknown must never become "not applicable" — that would be a guess.
    expect(
      notApplicableObservation('BUSINESS_FOOD_ORDERS', {
        canHaveFoodMenus: null,
        categoryLabel: null,
      }),
    ).toBeNull();
    expect(
      notApplicableObservation('BUSINESS_FOOD_ORDERS', {
        canHaveFoodMenus: true,
        categoryLabel: null,
      }),
    ).toBeNull();
    // A non-food metric is never suppressed.
    expect(notApplicableObservation('CALL_CLICKS', SALON)).toBeNull();
  });

  it('never fabricates a change percentage from an incomplete window', () => {
    const row = snapshot28().rows.find((entry) => entry.metric === 'WEBSITE_CLICKS');
    if (row?.reading.kind !== 'measured') throw new Error('expected a measured reading');
    expect(row.reading.changePct).toBeNull();
  });
});

describe('the combined impressions number', () => {
  function rowFor(metric: (typeof IMPRESSION_METRICS)[number], total: number): PerformanceRow {
    return {
      metric,
      reading: { kind: 'measured', total, changePct: null, coverage: { reportedDays: 7, totalDays: 7 } },
      periodLabel: 'last 7 days',
    };
  }

  it('adds the four splits only when all four cover the whole window', () => {
    const rows = IMPRESSION_METRICS.map((metric) => rowFor(metric, 10));
    expect(combinedImpressions(rows)).toEqual({ kind: 'total', total: 40, splits: 4 });
  });

  it('refuses the total when one split was not reported, and names it', () => {
    const rows: PerformanceRow[] = [
      rowFor('BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 10),
      rowFor('BUSINESS_IMPRESSIONS_MOBILE_MAPS', 10),
      rowFor('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 10),
      {
        metric: 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
        reading: { kind: 'not_reported' },
        periodLabel: 'last 7 days',
      },
    ];

    const combined = combinedImpressions(rows);
    expect(combined.kind).toBe('unavailable');
    if (combined.kind !== 'unavailable') throw new Error('expected a refusal');
    expect(combined.message).toContain('Maps impressions (desktop)');
    expect(combined.message).not.toContain('30');
  });

  it('refuses the total when a split covers fewer days than the others', () => {
    const rows: PerformanceRow[] = [
      rowFor('BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 10),
      rowFor('BUSINESS_IMPRESSIONS_MOBILE_MAPS', 10),
      rowFor('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 10),
      {
        metric: 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
        reading: {
          kind: 'measured',
          total: 10,
          changePct: null,
          coverage: { reportedDays: 5, totalDays: 7 },
        },
        periodLabel: 'last 7 days — Google reported 5 of 7 days',
      },
    ];

    const combined = combinedImpressions(rows);
    expect(combined.kind).toBe('unavailable');
    if (combined.kind !== 'unavailable') throw new Error('expected a refusal');
    expect(combined.message).toContain('only part of this period');
  });

  it('refuses when the day counts did not survive the shared contract', () => {
    const rows = IMPRESSION_METRICS.map<PerformanceRow>((metric) => ({
      metric,
      reading: { kind: 'measured', total: 10, changePct: null, coverage: null },
      periodLabel: 'last 7 days',
    }));

    expect(combinedImpressions(rows).kind).toBe('unavailable');
  });
});

describe('presentational helpers', () => {
  it('labels a zero total differently from a positive one', () => {
    const zero: PerformanceRow = {
      metric: 'CALL_CLICKS',
      reading: { kind: 'measured', total: 0, changePct: null, coverage: { reportedDays: 7, totalDays: 7 } },
      periodLabel: 'last 7 days',
    };
    const some: PerformanceRow = { ...zero, reading: { ...zero.reading, total: 4 } as never };

    expect(statusChipFor(zero).label).toBe('Measured zero');
    expect(statusChipFor(some).label).toBe('Measured');
    expect(explanationFor(zero)).toContain('This is a real zero, not a missing number.');
  });

  it('refuses to chart a metric with no reported day', () => {
    const empty = buildSnapshot({
      series: [{ metric: 'CALL_CLICKS', points: [{ date: '2020-06-28', kind: 'not_reported' }] }],
      capabilities: SALON,
      period: DEFAULT_PERIOD,
      endDate: FIXTURE_PERFORMANCE_END_DATE,
    });

    expect(chartableMetrics(empty)).toEqual([]);
  });

  it('counts reported, zero and missing days separately', () => {
    const shape = describeSeries([
      { date: '2020-06-01', kind: 'reported', count: 4 },
      { date: '2020-06-02', kind: 'reported', count: 0 },
      { date: '2020-06-03', kind: 'not_reported' },
    ]);

    expect(shape).toEqual({
      days: 3,
      reportedDays: 2,
      unreportedDays: 1,
      zeroDays: 1,
      peak: { date: '2020-06-01', count: 4 },
      trough: { date: '2020-06-02', count: 0 },
    });
  });

  it('formats a day without Intl, and refuses anything that is not a day', () => {
    expect(formatShortDay('2020-06-28')).toBe('28 Jun');
    expect(formatShortDay('not-a-date')).toBeNull();
    expect(formatShortDay('2020-13-01')).toBeNull();
  });

  it('renders a ready-but-fixture snapshot without claiming it is real', async () => {
    const snapshot = snapshot28();
    await renderView(
      <PerformanceView
        state={ready(snapshot, '2020-01-01T00:00:00.000Z', true)}
        periodKey="28d"
        onPeriodChange={() => {}}
      />,
    );

    // The view itself never says "connected" or "live".
    expect(screen.queryByText(/connected to google/i)).toBeNull();
    expect(screen.getByText('Read from Google on 1 Jan 2020.')).toBeOnTheScreen();
  });
});

/* -------------------------------------------------------------------------- */
/* Android QA                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Shoogle is Android-first and must behave at 390x844 and 412x915.
 *
 * These checks are STATIC: they walk the rendered tree and assert on declared
 * styles and accessibility props. Anything that cannot be determined that way —
 * overflow caused by flex or content, keyboard behaviour, real scrolling — is
 * reported as undetermined rather than quietly counted as a pass, and still
 * needs a device.
 *
 * The walker is a local copy of the one in `__tests__/android-qa.test.tsx`
 * rather than an import: that file defines `describe` blocks at module scope,
 * so importing it would run the whole Business-tab suite a second time. It is a
 * shared file and not this feature's to restructure.
 */

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
] as const;

interface TreeNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (TreeNode | string)[] | null;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

function walk(node: TreeNode | string | null, visit: (n: TreeNode) => void): void {
  if (!node || typeof node === 'string') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

interface QaReport {
  overflow: { width: number; testID?: string }[];
  smallTargets: { height: number; role: string; label?: string }[];
  unlabelled: { role: string; testID?: string }[];
  totalPressables: number;
}

function auditRenderedTree(tree: TreeNode | string | null, viewportWidth: number): QaReport {
  const report: QaReport = { overflow: [], smallTargets: [], unlabelled: [], totalPressables: 0 };

  walk(tree, (node) => {
    const props = node.props ?? {};
    const style = flattenStyle(props.style);

    const width = style.width;
    if (typeof width === 'number' && width > viewportWidth) {
      report.overflow.push({
        width,
        ...(typeof props.testID === 'string' ? { testID: props.testID } : {}),
      });
    }

    const role = props.accessibilityRole;
    if (role !== 'button' && role !== 'tab' && role !== 'switch') return;
    report.totalPressables += 1;

    const label = props.accessibilityLabel;
    if (typeof label !== 'string' || label.trim().length === 0) {
      report.unlabelled.push({
        role: String(role),
        ...(typeof props.testID === 'string' ? { testID: props.testID } : {}),
      });
    }

    const declared =
      typeof style.minHeight === 'number'
        ? style.minHeight
        : typeof style.height === 'number'
          ? style.height
          : null;
    // A height that comes from flex or content is not knowable here, and is
    // reported as neither a pass nor a failure.
    if (declared === null) return;

    const hitSlop = props.hitSlop;
    const slop = typeof hitSlop === 'number' ? hitSlop * 2 : 0;
    if (declared + slop < control.minTouchTarget) {
      report.smallTargets.push({
        height: declared,
        role: String(role),
        ...(typeof label === 'string' ? { label } : {}),
      });
    }
  });

  return report;
}

function wrapAt(width: number, height: number) {
  return renderRouter(
    {
      'seo/performance': () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>
            <PerformanceScreen />
          </ToastProvider>
        </ThemeProvider>
      ),
    },
    {
      initialUrl: '/seo/performance',
      initialMetrics: {
        frame: { x: 0, y: 0, width, height },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      },
    } as never,
  );
}

/** Proves the walker can fail. A checker that cannot fail is worse than none. */
describe('the walker itself', () => {
  it('detects an over-wide element and an unlabelled control', () => {
    const report = auditRenderedTree(
      {
        type: 'View',
        props: { style: { width: 500 }, testID: 'wide' },
        children: [{ type: 'View', props: { accessibilityRole: 'button', testID: 'bare' } }],
      },
      390,
    );
    expect(report.overflow).toEqual([{ width: 500, testID: 'wide' }]);
    expect(report.unlabelled).toEqual([{ role: 'button', testID: 'bare' }]);
  });
});

describe.each(VIEWPORTS)('Performance at $name', ({ width, height }) => {
  it('fits, labels every control, and keeps its buttons at the 44pt floor', async () => {
    mockFixtures = true;
    await wrapAt(width, height);

    expect(screen.getByTestId('performance-screen')).toBeOnTheScreen();

    const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    // Two segmented controls plus the removed-metrics toggle.
    expect(report.totalPressables).toBeGreaterThan(3);

    // Every control this feature declares meets the floor. The only shortfall
    // is the segmented control in `components/ui/Tabs.tsx`, whose tab Pressable
    // declares minHeight 36 — an upstream gap in a SHARED primitive that three
    // features already use, not something to fork a private copy over. It is
    // named here rather than papered over.
    expect(report.smallTargets.every((target) => target.role === 'tab')).toBe(true);
    expect(report.smallTargets.every((target) => target.height === 36)).toBe(true);
  });

  it('fits and stays labelled with nothing connected, too', async () => {
    mockFixtures = false;
    await wrapAt(width, height);

    await screen.findByTestId('performance-unavailable');

    const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    // With nothing connected there is no segmented control at all, so every
    // remaining pressable must clear 44pt outright.
    expect(report.smallTargets).toEqual([]);
  });
});
