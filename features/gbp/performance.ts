/**
 * Google Business Profile — performance normalisation. Owner: Pranay.
 *
 * Pure functions. No I/O, no dates from the wall clock unless you pass one in.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ----------------------------------------
 * `Metric.value` in `lib/providers/types.ts` is a NON-NULLABLE number. So a
 * metric we do not know cannot be represented — it must be OMITTED from the
 * array entirely. It must never appear as 0, because a real measured zero
 * ("nobody tapped Call last week") is a different, genuinely useful fact from
 * "Google did not report Call taps".
 *
 * Google's own serialisation makes this sharp: `DatedValue.value` is an int64
 * sent as a string, and proto3 omits default values, so a missing `value` is
 * ambiguous between "zero" and "not reported". The reference does not say
 * which, and that ambiguity is recorded as UNVERIFIED in the research doc. We
 * resolve it the only safe way: a missing day is UNKNOWN. A window with no
 * reported days at all yields no metric. A partly reported window yields a
 * total that is explicitly labelled as covering fewer days than asked for, so
 * nobody reads it as a complete figure.
 */

import { LIVE_DAILY_METRICS, isRenderableDailyMetric, type LiveDailyMetric } from '@/features/seo';
import type { Metric } from '@/lib/providers/types';

import type { DailyRange } from './endpoints';
import type {
  GbpDailyPoint,
  GbpDatedValueWire,
  GbpFetchMultiDailyMetricsResponse,
  GbpKeywordReport,
  GbpKeywordRow,
  GbpMetricTotal,
  GbpSearchKeywordCountWire,
  GoogleDate,
} from './types';

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in UTC. Local time would drift the window across midnight IST. */
export function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return iso;
  return isoDate(new Date(Date.UTC(year, month - 1, day + days)));
}

export function googleDateToIso(date: GoogleDate | undefined): string | null {
  if (date === undefined) return null;
  const { year, month, day } = date;
  if (typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number') return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Inclusive day count. `2026-01-01`..`2026-01-07` is 7. */
export function daysInRange(range: DailyRange): number {
  const start = Date.parse(`${range.startDate}T00:00:00Z`);
  const end = Date.parse(`${range.endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

function inRange(iso: string, range: DailyRange): boolean {
  return iso >= range.startDate && iso <= range.endDate;
}

/* -------------------------------------------------------------------------- */
/* Periods                                                                    */
/* -------------------------------------------------------------------------- */

export interface GbpPerformancePeriod {
  key: string;
  label: string;
  days: number;
}

/**
 * The periods the Business tab may ask for.
 *
 * `getPerformance(locationId, period)` takes a free-form string on the shared
 * contract, so an unrecognised value must be reported as unsupported rather
 * than silently coerced into some default window — a chart labelled "last 28
 * days" that actually covers 7 is fabricated data.
 */
export const GBP_PERIODS: readonly GbpPerformancePeriod[] = [
  { key: '7d', label: 'last 7 days', days: 7 },
  { key: '28d', label: 'last 28 days', days: 28 },
  { key: '90d', label: 'last 90 days', days: 90 },
];

export function parsePerformancePeriod(period: string): GbpPerformancePeriod | null {
  const wanted = period.trim().toLowerCase();
  return (
    GBP_PERIODS.find((candidate) => candidate.key === wanted || candidate.label === wanted) ?? null
  );
}

export interface GbpWindows {
  current: DailyRange;
  /** The equivalent window immediately before `current`, for change-over-time. */
  previous: DailyRange;
  /** One request covering both, because reads are cheap and round trips are not. */
  combined: DailyRange;
}

/**
 * Build the windows ending on `endDate` (inclusive).
 *
 * Google's reporting latency is UNVERIFIED — no reference page states a lag —
 * so callers pass the last date they are willing to claim, and we never assume
 * today's numbers exist.
 */
export function buildWindows(endDate: string, days: number): GbpWindows {
  const currentStart = addDaysIso(endDate, -(days - 1));
  const previousEnd = addDaysIso(currentStart, -1);
  const previousStart = addDaysIso(previousEnd, -(days - 1));
  return {
    current: { startDate: currentStart, endDate },
    previous: { startDate: previousStart, endDate: previousEnd },
    combined: { startDate: previousStart, endDate },
  };
}

/* -------------------------------------------------------------------------- */
/* Series normalisation                                                       */
/* -------------------------------------------------------------------------- */

/** int64 arrives as a string. Anything that is not a non-negative integer is unknown. */
export function parseCount(raw: string | undefined): number | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function normaliseDatedValues(values: GbpDatedValueWire[] | undefined): GbpDailyPoint[] {
  const points: GbpDailyPoint[] = [];
  for (const entry of values ?? []) {
    const date = googleDateToIso(entry.date);
    if (date === null) continue; // A datapoint with no date tells us nothing.
    const count = parseCount(entry.value);
    points.push(count === null ? { date, kind: 'not_reported' } : { date, kind: 'reported', count });
  }
  return points;
}

/**
 * Sum the days Google actually reported inside `range`.
 *
 * `reportedDays` is carried out so the caller can say "26 of 28 days" instead
 * of presenting a floor as a total.
 */
export function totalOver(points: readonly GbpDailyPoint[], range: DailyRange): GbpMetricTotal {
  const totalDays = daysInRange(range);
  let total = 0;
  let reportedDays = 0;

  for (const point of points) {
    if (!inRange(point.date, range)) continue;
    if (point.kind !== 'reported') continue;
    total += point.count;
    reportedDays += 1;
  }

  if (reportedDays === 0) return { kind: 'unknown', totalDays };
  return { kind: 'total', total, reportedDays, totalDays };
}

/**
 * Change against the previous equal window, or null.
 *
 * Null whenever either window is incomplete, or the previous total is zero —
 * "up from nothing" has no percentage, and rendering ∞ or 100% would be
 * invented. A null here renders as no arrow at all, per the `Metric` contract.
 */
export function changePercent(current: GbpMetricTotal, previous: GbpMetricTotal): number | null {
  if (current.kind !== 'total' || previous.kind !== 'total') return null;
  if (current.reportedDays !== current.totalDays) return null;
  if (previous.reportedDays !== previous.totalDays) return null;
  if (previous.total === 0) return null;
  return Math.round(((current.total - previous.total) / previous.total) * 1000) / 10;
}

export interface GbpSeries {
  metric: LiveDailyMetric;
  points: GbpDailyPoint[];
}

/**
 * Pull the live metrics out of a `fetchMultiDailyMetricsTimeSeries` response.
 *
 * Series whose `dailyMetric` is `DAILY_METRIC_UNKNOWN`, absent, or anything we
 * do not recognise are DROPPED here — that sentinel is not a metric and must
 * never reach a label, a tile or a chart.
 */
export function extractSeries(response: GbpFetchMultiDailyMetricsResponse): GbpSeries[] {
  const series: GbpSeries[] = [];
  for (const multi of response.multiDailyMetricTimeSeries ?? []) {
    for (const entry of multi.dailyMetricTimeSeries ?? []) {
      const name = entry.dailyMetric;
      if (typeof name !== 'string' || !isRenderableDailyMetric(name)) continue;
      series.push({ metric: name, points: normaliseDatedValues(entry.timeSeries?.datedValues) });
    }
  }
  return series;
}

/**
 * Build the `Metric[]` the shared contract wants.
 *
 * A metric appears ONLY when Google reported at least one day of it. Everything
 * else is left out, and the caller is responsible for telling the owner which
 * metrics were absent rather than showing a grid of zeros.
 */
export function buildMetrics(
  response: GbpFetchMultiDailyMetricsResponse,
  windows: GbpWindows,
  periodLabel: string,
): { metrics: Metric[]; omitted: LiveDailyMetric[] } {
  const metrics: Metric[] = [];
  const omitted: LiveDailyMetric[] = [];

  for (const { metric, points } of extractSeries(response)) {
    const current = totalOver(points, windows.current);
    if (current.kind !== 'total') {
      omitted.push(metric);
      continue;
    }

    const previous = totalOver(points, windows.previous);
    const complete = current.reportedDays === current.totalDays;

    const definition = LIVE_DAILY_METRICS[metric];
    metrics.push({
      key: definition.key,
      label: definition.label,
      value: current.total,
      unit: 'count',
      period: complete
        ? periodLabel
        : `${periodLabel} — Google reported ${current.reportedDays} of ${current.totalDays} days`,
      changePct: changePercent(current, previous),
    });
  }

  return { metrics, omitted };
}

/**
 * Which of the eleven live metrics Google returned nothing for.
 *
 * Needed because a metric absent from the response and a metric present but
 * empty are both "unknown" and both get omitted from `Metric[]` — the screen
 * still has to name them, or the owner sees a short grid with no explanation.
 */
export function missingMetrics(
  requested: readonly LiveDailyMetric[],
  produced: readonly Metric[],
): LiveDailyMetric[] {
  const present = new Set(produced.map((metric) => metric.key));
  return requested.filter((metric) => !present.has(LIVE_DAILY_METRICS[metric].key));
}

/* -------------------------------------------------------------------------- */
/* Search keywords                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Normalise one keyword row.
 *
 * `insightsValue` carries EITHER an exact `value` OR a `threshold` meaning "the
 * real number is below this". Returns null when Google sent neither — that is
 * an unknown keyword volume, and an unknown is dropped rather than shown as 0.
 */
export function normaliseKeywordRow(row: GbpSearchKeywordCountWire): GbpKeywordRow | null {
  const keyword = row.searchKeyword;
  if (typeof keyword !== 'string' || keyword.trim().length === 0) return null;

  const exact = parseCount(row.insightsValue?.value);
  if (exact !== null) {
    return { keyword, impressions: { kind: 'exact', value: exact } };
  }

  const threshold = parseCount(row.insightsValue?.threshold);
  if (threshold !== null) {
    return { keyword, impressions: { kind: 'below_threshold', threshold } };
  }

  return null;
}

/**
 * Normalise every row, and COUNT the ones we had to refuse.
 *
 * The count is the whole point. An earlier version filtered the nulls away and
 * returned a bare array, so a response in which every row was unmappable came
 * back as `[]` — which reads to an owner as "you have no search keywords" when
 * the truth is "Google sent keywords Shoogle could not read". `skipped` lets
 * the caller refuse outright, and lets a partial list be labelled as partial.
 */
export function normaliseKeywordRows(
  rows: readonly GbpSearchKeywordCountWire[] | undefined,
): GbpKeywordReport {
  const out: GbpKeywordRow[] = [];
  let skipped = 0;
  for (const row of rows ?? []) {
    const normalised = normaliseKeywordRow(row);
    if (normalised === null) skipped += 1;
    else out.push(normalised);
  }
  return { rows: out, skipped };
}
