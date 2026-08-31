/**
 * The Performance screen's model. Owner: Pranay.
 *
 * Pure functions and pure types. No I/O, no React, no wall clock, no fixtures.
 * `app/seo/performance.tsx` decides where the bytes came from; this file only
 * decides what can honestly be said about them.
 *
 * THE FIVE FACTS THIS FILE KEEPS APART
 * ------------------------------------
 * Google's Performance v1 API can produce five genuinely different situations
 * for a single metric, and four of them collapse into "0" if you model a metric
 * as a plain number. `MetricReading` makes that collapse impossible:
 *
 *   1. MEASURED           Google reported days and they summed to N (N may be
 *                         large or small).
 *   2. MEASURED ZERO      Google reported days and they summed to 0. This is a
 *                         real, useful finding — "nobody tapped Call last week"
 *                         — and renders as `0`.
 *   3. PARTLY REPORTED    Google reported some days of the window. The total is
 *                         a FLOOR, and `coverage` carries how many days it
 *                         actually covers so the screen can say so.
 *   4. NOT REPORTED       Google reported no days at all. Renders `—` with a
 *                         reason. Never `0`.
 *   5. NOT APPLICABLE     The metric cannot apply to this business — a salon has
 *                         no food orders. Renders `—` with the OBSERVATION it
 *                         rests on, not a guess.
 *
 * Cases 1–4 come out of `features/gbp/performance.ts`, which already resolves
 * proto3's zero/absent ambiguity the only safe way. Case 5 is decided here, and
 * only from something Google itself stated about the listing.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * There is no rank, no score, no projection and no "expected" value. Google
 * publishes no rank position through any API, and every other number here would
 * have to be invented. There is also no function that turns a removed metric
 * into anything but `unavailable('not_supported', …)` — that lives in
 * `features/seo/metrics.ts` and stays there.
 */

import {
  LIVE_DAILY_METRICS,
  LIVE_DAILY_METRIC_ORDER,
  type DailyMetricGroup,
  type LiveDailyMetric,
} from '@/features/seo';

import type { DailyRange } from '../../endpoints';
import {
  GBP_PERIODS,
  buildWindows,
  changePercent,
  extractSeries,
  totalOver,
  type GbpPerformancePeriod,
  type GbpWindows,
} from '../../performance';
import type { GbpPerformanceReport } from '../../provider';
import type { GbpDailyPoint, GbpFetchMultiDailyMetricsResponse } from '../../types';

/* -------------------------------------------------------------------------- */
/* Readings                                                                   */
/* -------------------------------------------------------------------------- */

/** How much of the requested window Google actually reported. */
export interface MetricCoverage {
  readonly reportedDays: number;
  readonly totalDays: number;
}

export type MetricReading =
  | {
      readonly kind: 'measured';
      /** May be 0. A measured zero is a fact, not a missing value. */
      readonly total: number;
      /** Null when the change cannot be computed honestly. Never rendered as 0%. */
      readonly changePct: number | null;
      /**
       * Null means we know the total but not how many days it covers — which is
       * the case when the total arrives through the shared `Metric` contract.
       * A null coverage is treated as "not confirmed complete" everywhere.
       */
      readonly coverage: MetricCoverage | null;
    }
  | { readonly kind: 'not_reported' }
  | {
      readonly kind: 'not_applicable';
      /** What Google stated that makes this metric inapplicable. Quoted, not inferred. */
      readonly observation: string;
    };

export interface PerformanceRow {
  readonly metric: LiveDailyMetric;
  readonly reading: MetricReading;
  /** e.g. `last 28 days`, or `last 28 days — Google reported 26 of 28 days`. */
  readonly periodLabel: string;
}

export interface PerformanceSeries {
  readonly metric: LiveDailyMetric;
  readonly points: readonly GbpDailyPoint[];
}

/**
 * What Google says this listing is capable of.
 *
 * `canHaveFoodMenus` is a real output-only field on the location resource. It
 * is the difference between "this salon has no food orders" (a fact Google
 * stated) and "we assumed a salon has no food orders" (a guess). Null means we
 * have not read it, and null NEVER produces a "not applicable".
 */
export interface ProfileCapabilities {
  readonly canHaveFoodMenus: boolean | null;
  readonly categoryLabel: string | null;
}

export const UNKNOWN_PROFILE_CAPABILITIES: ProfileCapabilities = Object.freeze({
  canHaveFoodMenus: null,
  categoryLabel: null,
});

export interface PerformanceSnapshot {
  readonly period: GbpPerformancePeriod;
  readonly windows: GbpWindows;
  /** All eleven live metrics, always, in `LIVE_DAILY_METRIC_ORDER`. */
  readonly rows: readonly PerformanceRow[];
  /** Daily points clipped to the current window, for the chart. */
  readonly series: readonly PerformanceSeries[];
  readonly capabilities: ProfileCapabilities;
}

/* -------------------------------------------------------------------------- */
/* Periods                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 28 days, matching what Google's own dashboard defaults to. Declared as a
 * literal rather than `GBP_PERIODS[1]` so `noUncheckedIndexedAccess` cannot
 * hand a screen `undefined` and make it render a window it never requested.
 */
export const DEFAULT_PERIOD: GbpPerformancePeriod = Object.freeze(
  GBP_PERIODS.find((candidate) => candidate.key === '28d') ?? {
    key: '28d',
    label: 'last 28 days',
    days: 28,
  },
);

/** Short tab label — `28 days`. The long form stays on every number. */
export function shortPeriodLabel(period: GbpPerformancePeriod): string {
  return `${period.days} days`;
}

/* -------------------------------------------------------------------------- */
/* Applicability                                                              */
/* -------------------------------------------------------------------------- */

/** The two metrics that only exist for businesses Google lets serve food. */
export const FOOD_METRICS: readonly LiveDailyMetric[] = [
  'BUSINESS_FOOD_ORDERS',
  'BUSINESS_FOOD_MENU_CLICKS',
];

/**
 * Why a metric does not apply, or null when it does (or when we cannot tell).
 *
 * The bar is deliberately high: only an explicit `false` from Google's own
 * listing metadata suppresses a metric. If we have not read the flag, the
 * metric stays in the list and shows whatever Google reported — usually
 * nothing, which renders as "not reported", which is the truth.
 */
export function notApplicableObservation(
  metric: LiveDailyMetric,
  capabilities: ProfileCapabilities,
): string | null {
  if (!FOOD_METRICS.includes(metric)) return null;
  if (capabilities.canHaveFoodMenus !== false) return null;

  const category = capabilities.categoryLabel;
  const suffix = category === null ? '' : `, listed as ${category}`;
  return `Google's listing data reports canHaveFoodMenus = false for this profile${suffix}.`;
}

/* -------------------------------------------------------------------------- */
/* Building a snapshot                                                        */
/* -------------------------------------------------------------------------- */

export function periodLabelFor(
  period: GbpPerformancePeriod,
  coverage: MetricCoverage | null,
): string {
  if (coverage === null || coverage.reportedDays === coverage.totalDays) return period.label;
  return `${period.label} — Google reported ${coverage.reportedDays} of ${coverage.totalDays} days`;
}

function clip(points: readonly GbpDailyPoint[], range: DailyRange): GbpDailyPoint[] {
  return points.filter((point) => point.date >= range.startDate && point.date <= range.endDate);
}

export interface BuildSnapshotOptions {
  readonly series: readonly PerformanceSeries[];
  readonly capabilities: ProfileCapabilities;
  readonly period: GbpPerformancePeriod;
  /** The last day we are willing to claim a reading for. Never "today". */
  readonly endDate: string;
}

/**
 * Turn normalised daily points into the eleven rows a screen renders.
 *
 * Every one of the eleven live metrics appears in the result, always. A metric
 * that is missing from the response does not vanish from the screen — it
 * appears as `not_reported`, because a shorter grid with no explanation reads
 * to an owner as "this does not exist" rather than "Google said nothing".
 */
export function buildSnapshot({
  series,
  capabilities,
  period,
  endDate,
}: BuildSnapshotOptions): PerformanceSnapshot | null {
  const windows = buildWindows(endDate, period.days);
  // No window means no period to report against. Returning an empty snapshot
  // would render eleven rows of "not reported", which blames Google for a date
  // we could not parse ourselves. Null lets the screen say what really happened.
  if (windows === null) return null;

  const byMetric = new Map<LiveDailyMetric, readonly GbpDailyPoint[]>();
  for (const entry of series) byMetric.set(entry.metric, entry.points);

  const rows: PerformanceRow[] = LIVE_DAILY_METRIC_ORDER.map((metric) => {
    const observation = notApplicableObservation(metric, capabilities);
    if (observation !== null) {
      return {
        metric,
        reading: { kind: 'not_applicable', observation },
        periodLabel: period.label,
      };
    }

    const points = byMetric.get(metric) ?? [];
    const current = totalOver(points, windows.current);
    if (current.kind !== 'total') {
      return { metric, reading: { kind: 'not_reported' }, periodLabel: period.label };
    }

    const coverage: MetricCoverage = {
      reportedDays: current.reportedDays,
      totalDays: current.totalDays,
    };

    return {
      metric,
      reading: {
        kind: 'measured',
        total: current.total,
        changePct: changePercent(current, totalOver(points, windows.previous)),
        coverage,
      },
      periodLabel: periodLabelFor(period, coverage),
    };
  });

  const clipped: PerformanceSeries[] = series.map((entry) => ({
    metric: entry.metric,
    points: clip(entry.points, windows.current),
  }));

  return { period, windows, rows, series: clipped, capabilities };
}

/**
 * Build a snapshot straight from a `fetchMultiDailyMetricsTimeSeries` body.
 *
 * `extractSeries` is what drops `DAILY_METRIC_UNKNOWN` and anything else the
 * registry does not recognise, so the sentinel is removed by the same function
 * the live adapter uses — not by a branch written twice.
 */
export function snapshotFromResponse(
  response: GbpFetchMultiDailyMetricsResponse,
  capabilities: ProfileCapabilities,
  period: GbpPerformancePeriod,
  endDate: string,
): PerformanceSnapshot | null {
  const series: PerformanceSeries[] = extractSeries(response).map((entry) => ({
    metric: entry.metric,
    points: entry.points,
  }));
  return buildSnapshot({ series, capabilities, period, endDate });
}

/**
 * Build a snapshot from the shared-contract report the adapter returns.
 *
 * The contract's `Metric.value` is a non-nullable number, so the adapter has
 * already omitted everything it could not read; `report.unreported` is how it
 * names them. Coverage is null on this path because the day counts do not
 * survive the contract — which means the combined impressions total is refused
 * here, correctly, rather than assumed complete.
 */
export function snapshotFromReport(
  report: GbpPerformanceReport,
  capabilities: ProfileCapabilities,
  period: GbpPerformancePeriod,
): PerformanceSnapshot {
  const byKey = new Map(report.metrics.map((metric) => [metric.key, metric]));

  const rows: PerformanceRow[] = LIVE_DAILY_METRIC_ORDER.map((metric) => {
    const observation = notApplicableObservation(metric, capabilities);
    if (observation !== null) {
      return {
        metric,
        reading: { kind: 'not_applicable', observation },
        periodLabel: period.label,
      };
    }

    const found = byKey.get(LIVE_DAILY_METRICS[metric].key);
    if (found === undefined) {
      return { metric, reading: { kind: 'not_reported' }, periodLabel: period.label };
    }

    return {
      metric,
      reading: {
        kind: 'measured',
        total: found.value,
        changePct: found.changePct,
        coverage: null,
      },
      periodLabel: found.period.trim().length > 0 ? found.period : period.label,
    };
  });

  return { period, windows: report.windows, rows, series: [], capabilities };
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

export const GROUP_ORDER: readonly DailyMetricGroup[] = ['impressions', 'actions', 'transactions'];

export const GROUP_COPY: Readonly<
  Record<DailyMetricGroup, { readonly title: string; readonly subtitle: string }>
> = {
  impressions: {
    title: 'How people found you',
    subtitle:
      'Google splits this four ways — Search or Maps, phone or computer. There is no combined "views" number in the API any more, so these four are the whole picture.',
  },
  actions: {
    title: 'What people did next',
    subtitle:
      'What someone tapped after your profile appeared. These are taps, not outcomes — a call tap is not a call answered.',
  },
  transactions: {
    title: 'Bookings and orders',
    subtitle:
      'Only counts things booked or ordered through Google itself. A customer who phoned you and booked never appears here.',
  },
};

export function rowsInGroup(
  rows: readonly PerformanceRow[],
  group: DailyMetricGroup,
): PerformanceRow[] {
  return rows.filter((row) => LIVE_DAILY_METRICS[row.metric].group === group);
}

/* -------------------------------------------------------------------------- */
/* The combined impressions number                                            */
/* -------------------------------------------------------------------------- */

export type CombinedImpressions =
  | { readonly kind: 'total'; readonly total: number; readonly splits: number }
  | { readonly kind: 'unavailable'; readonly message: string };

function listLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1] ?? ''}`;
}

/**
 * The one "how many people saw you" number, or an honest refusal.
 *
 * The research doc is explicit: a single profile-views figure may only be shown
 * as the sum of the four impression splits, with that stated. So this refuses
 * unless ALL four are measured AND each covers its whole window. A sum built
 * from a partly-reported split would be a number Google never reported, dressed
 * up as a headline — which is precisely the move this product exists not to
 * make.
 */
export function combinedImpressions(rows: readonly PerformanceRow[]): CombinedImpressions {
  const impressions = rowsInGroup(rows, 'impressions');

  const missing: string[] = [];
  const partial: string[] = [];
  let total = 0;

  for (const row of impressions) {
    const label = LIVE_DAILY_METRICS[row.metric].label;
    if (row.reading.kind !== 'measured') {
      missing.push(label);
      continue;
    }
    const coverage = row.reading.coverage;
    if (coverage === null || coverage.reportedDays !== coverage.totalDays) {
      partial.push(label);
    }
    total += row.reading.total;
  }

  if (impressions.length === 0) {
    return { kind: 'unavailable', message: 'No impression metrics were requested.' };
  }
  if (missing.length > 0) {
    return {
      kind: 'unavailable',
      message: `Google reported nothing for ${listLabels(missing)}, so the four splits cannot be added into one number. Adding only the splits we have would understate it and look like a measurement.`,
    };
  }
  if (partial.length > 0) {
    return {
      kind: 'unavailable',
      message: `Google reported only part of this period for ${listLabels(partial)}, so a combined total would cover different days for different splits.`,
    };
  }

  return { kind: 'total', total, splits: impressions.length };
}

/* -------------------------------------------------------------------------- */
/* Series shape, for the chart and its text summary                           */
/* -------------------------------------------------------------------------- */

export interface SeriesShape {
  readonly days: number;
  readonly reportedDays: number;
  readonly unreportedDays: number;
  /** Days Google reported as exactly zero. */
  readonly zeroDays: number;
  readonly peak: { readonly date: string; readonly count: number } | null;
  readonly trough: { readonly date: string; readonly count: number } | null;
}

export function describeSeries(points: readonly GbpDailyPoint[]): SeriesShape {
  let reportedDays = 0;
  let unreportedDays = 0;
  let zeroDays = 0;
  let peak: { date: string; count: number } | null = null;
  let trough: { date: string; count: number } | null = null;

  for (const point of points) {
    if (point.kind !== 'reported') {
      unreportedDays += 1;
      continue;
    }
    reportedDays += 1;
    if (point.count === 0) zeroDays += 1;
    if (peak === null || point.count > peak.count) peak = { date: point.date, count: point.count };
    if (trough === null || point.count < trough.count) {
      trough = { date: point.date, count: point.count };
    }
  }

  return { days: points.length, reportedDays, unreportedDays, zeroDays, peak, trough };
}

/**
 * Metrics it is honest to draw a line for.
 *
 * A metric with no reported day would produce an empty chart, and an empty
 * chart standing in for missing data is the exact thing CONTRIBUTING.md rule 1
 * forbids. Those metrics keep their row and their reason; they just get no
 * picture.
 */
export function chartableMetrics(snapshot: PerformanceSnapshot): LiveDailyMetric[] {
  const measured = new Set(
    snapshot.rows.filter((row) => row.reading.kind === 'measured').map((row) => row.metric),
  );

  return LIVE_DAILY_METRIC_ORDER.filter((metric) => {
    if (!measured.has(metric)) return false;
    const series = snapshot.series.find((entry) => entry.metric === metric);
    return series !== undefined && series.points.some((point) => point.kind === 'reported');
  });
}

export function seriesFor(
  snapshot: PerformanceSnapshot,
  metric: LiveDailyMetric,
): readonly GbpDailyPoint[] {
  return snapshot.series.find((entry) => entry.metric === metric)?.points ?? [];
}

export function rowFor(
  snapshot: PerformanceSnapshot,
  metric: LiveDailyMetric,
): PerformanceRow | null {
  return snapshot.rows.find((row) => row.metric === metric) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * `2020-06-28` -> `28 Jun`. Formatted by hand, not through `Intl`: Hermes ships
 * a variable ICU surface across Android versions and an axis label that renders
 * differently on two phones is a support ticket.
 *
 * Returns null for anything that is not a plain ISO day, so a caller says
 * "date unknown" rather than printing `Invalid Date`.
 */
export function formatShortDay(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const month = match?.[2];
  const day = match?.[3];
  if (month === undefined || day === undefined) return null;
  const name = SHORT_MONTHS[Number(month) - 1];
  if (name === undefined) return null;
  return `${Number(day)} ${name}`;
}

/**
 * `2020-01-01T00:00:00.000Z` -> `1 Jan 2020`.
 *
 * Used for "read from Google on …". Returns null rather than inventing a date
 * when the stamp cannot be read — a wrong freshness date is worse than none.
 */
export function formatReadOn(iso: string): string | null {
  const day = formatShortDay(iso.slice(0, 10));
  if (day === null) return null;
  return `${day} ${iso.slice(0, 4)}`;
}

/** `2020-03-31`..`2020-06-28` -> `31 Mar – 28 Jun`. */
export function formatRange(range: DailyRange): string | null {
  const start = formatShortDay(range.startDate);
  const end = formatShortDay(range.endDate);
  if (start === null || end === null) return null;
  return `${start} – ${end}`;
}
