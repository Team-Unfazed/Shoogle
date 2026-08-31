/**
 * The Google Business Profile metric registries. Owner: Pranay.
 *
 * Two registries, deliberately separate:
 *
 *   LIVE_DAILY_METRICS   the eleven `DailyMetric` values that still return data
 *   REMOVED_METRICS      metrics Google deleted in 2023 with NO replacement
 *
 * A metric in the second registry can only ever produce
 * `unavailable('not_supported', …)`. There is no code path in this file that
 * turns one into a number, and none should ever be added.
 *
 * Source: docs/research/google-business-profile.md §7
 * <https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric>
 * <https://developers.google.com/my-business/content/sunset-dates>
 */

import { unavailable, type UnavailableState } from '@/lib/state/DataState';
import type { Metric } from '@/lib/providers/types';
import {
  DAILY_METRIC_UNKNOWN,
  type DailyMetricDefinition,
  type DailyMetricEnumValue,
  type LiveDailyMetric,
  type RemovedMetricDefinition,
  type RemovedMetricId,
  type RenamedMetricDefinition,
} from './types';

/* -------------------------------------------------------------------------- */
/* The eleven that still work                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Impressions are deduplicated per unique user per day. Repeated verbatim on
 * every impression metric because owners read "impressions" as "views" and the
 * two are not the same number.
 */
const IMPRESSION_NOTE =
  'Counts unique people once per day, so it is not the same as total views.';

export const LIVE_DAILY_METRICS: Readonly<Record<LiveDailyMetric, DailyMetricDefinition>> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: {
    metric: 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
    key: 'gbp.impressions.desktop_maps',
    label: 'Maps impressions (desktop)',
    group: 'impressions',
    note: IMPRESSION_NOTE,
    unit: 'count',
  },
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: {
    metric: 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
    key: 'gbp.impressions.desktop_search',
    label: 'Search impressions (desktop)',
    group: 'impressions',
    note: IMPRESSION_NOTE,
    unit: 'count',
  },
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: {
    metric: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    key: 'gbp.impressions.mobile_maps',
    label: 'Maps impressions (mobile)',
    group: 'impressions',
    note: IMPRESSION_NOTE,
    unit: 'count',
  },
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: {
    metric: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
    key: 'gbp.impressions.mobile_search',
    label: 'Search impressions (mobile)',
    group: 'impressions',
    note: IMPRESSION_NOTE,
    unit: 'count',
  },
  BUSINESS_CONVERSATIONS: {
    metric: 'BUSINESS_CONVERSATIONS',
    key: 'gbp.actions.conversations',
    label: 'Messages started',
    group: 'actions',
    note: 'Message conversations people started from your profile.',
    unit: 'count',
  },
  BUSINESS_DIRECTION_REQUESTS: {
    metric: 'BUSINESS_DIRECTION_REQUESTS',
    key: 'gbp.actions.direction_requests',
    label: 'Direction requests',
    group: 'actions',
    note: 'How many people asked for directions. Google no longer says where from.',
    unit: 'count',
  },
  CALL_CLICKS: {
    metric: 'CALL_CLICKS',
    key: 'gbp.actions.call_clicks',
    label: 'Call button taps',
    group: 'actions',
    note: 'Taps on the call button. Not the same as calls answered.',
    unit: 'count',
  },
  WEBSITE_CLICKS: {
    metric: 'WEBSITE_CLICKS',
    key: 'gbp.actions.website_clicks',
    label: 'Website clicks',
    group: 'actions',
    note: 'Clicks through to your website from the profile.',
    unit: 'count',
  },
  BUSINESS_BOOKINGS: {
    metric: 'BUSINESS_BOOKINGS',
    key: 'gbp.transactions.bookings',
    label: 'Bookings',
    group: 'transactions',
    note: 'Bookings made through Reserve with Google only.',
    unit: 'count',
  },
  BUSINESS_FOOD_ORDERS: {
    metric: 'BUSINESS_FOOD_ORDERS',
    key: 'gbp.transactions.food_orders',
    label: 'Food orders',
    group: 'transactions',
    note: 'Orders placed from your profile.',
    unit: 'count',
  },
  BUSINESS_FOOD_MENU_CLICKS: {
    metric: 'BUSINESS_FOOD_MENU_CLICKS',
    key: 'gbp.transactions.food_menu_clicks',
    label: 'Menu clicks',
    group: 'transactions',
    note: IMPRESSION_NOTE,
    unit: 'count',
  },
};

/** Display order. Exactly eleven — pinned by a test. */
export const LIVE_DAILY_METRIC_ORDER: readonly LiveDailyMetric[] = [
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
  'BUSINESS_CONVERSATIONS',
  'BUSINESS_BOOKINGS',
  'BUSINESS_FOOD_ORDERS',
  'BUSINESS_FOOD_MENU_CLICKS',
];

export function isLiveDailyMetric(value: string): value is LiveDailyMetric {
  return Object.prototype.hasOwnProperty.call(LIVE_DAILY_METRICS, value);
}

/**
 * The guard that keeps the sentinel off the screen.
 *
 * `DAILY_METRIC_UNKNOWN` is the enum's default member. It means Google had
 * nothing to say, which is neither a metric nor a zero. Everything that turns
 * an API row into something renderable must pass through here.
 */
export function isRenderableDailyMetric(value: DailyMetricEnumValue | string): value is LiveDailyMetric {
  if (value === DAILY_METRIC_UNKNOWN) return false;
  return isLiveDailyMetric(value);
}

/** Owner-facing label, or `null` for the sentinel and anything unrecognised. */
export function dailyMetricLabel(value: DailyMetricEnumValue | string): string | null {
  if (!isRenderableDailyMetric(value)) return null;
  return LIVE_DAILY_METRICS[value].label;
}

/* -------------------------------------------------------------------------- */
/* Building a Metric[] without inventing zeros                                */
/* -------------------------------------------------------------------------- */

/**
 * One row as it comes back from `fetchMultiDailyMetricsTimeSeries`, already
 * summed over the requested range by the caller.
 *
 * `total` is `number | null`. `null` means the series was absent or
 * unparseable — NOT that the total was zero. A real zero is `0`.
 */
export interface DailyMetricSample {
  readonly metric: DailyMetricEnumValue | string;
  readonly total: number | null;
  /** Window the total covers, e.g. 'last 28 days'. */
  readonly period: string;
  /** Change vs the previous equivalent window, or null when unknown. */
  readonly changePct?: number | null;
}

/**
 * Turn samples into `Metric[]`.
 *
 * `Metric.value` in `lib/providers/types.ts` is `number`, not `number | null`,
 * so an unknown metric has exactly one honest representation: it is OMITTED.
 * This function drops the sentinel, drops unrecognised keys, and drops `null`
 * totals. It never emits a `0` that Google did not report.
 *
 * Callers that need to tell the owner what is missing should use
 * `omittedDailyMetrics()` and put the labels in `uncheckedAreas`.
 */
export function toMetrics(samples: readonly DailyMetricSample[]): Metric[] {
  const metrics: Metric[] = [];
  for (const sample of samples) {
    if (!isRenderableDailyMetric(sample.metric)) continue;
    if (sample.total === null || !Number.isFinite(sample.total)) continue;
    const definition = LIVE_DAILY_METRICS[sample.metric];
    metrics.push({
      key: definition.key,
      label: definition.label,
      value: sample.total,
      unit: definition.unit,
      period: sample.period,
      changePct: sample.changePct ?? null,
    });
  }
  return metrics;
}

/**
 * The labels `toMetrics()` dropped, so the caller can name them out loud rather
 * than let them disappear. "We could not read this" is a fact worth showing.
 */
export function omittedDailyMetrics(samples: readonly DailyMetricSample[]): string[] {
  const omitted: string[] = [];
  for (const sample of samples) {
    if (!isRenderableDailyMetric(sample.metric)) continue;
    if (sample.total !== null && Number.isFinite(sample.total)) continue;
    omitted.push(LIVE_DAILY_METRICS[sample.metric].label);
  }
  return omitted;
}

/* -------------------------------------------------------------------------- */
/* Metrics Google deleted, with no replacement                                */
/* -------------------------------------------------------------------------- */

export const REMOVED_METRICS: Readonly<Record<RemovedMetricId, RemovedMetricDefinition>> = {
  ALL: {
    id: 'ALL',
    label: 'All metrics combined',
    explanation: 'Google removed the combined total in 2023. Each metric is now reported on its own.',
    discontinuedOn: '2023-03-30',
    reason: 'not_supported',
  },
  QUERIES_DIRECT: {
    id: 'QUERIES_DIRECT',
    label: 'Searches for your business name',
    explanation: 'Google stopped splitting searches into direct, discovery and branded in 2023.',
    discontinuedOn: '2023-03-30',
    reason: 'not_supported',
  },
  QUERIES_INDIRECT: {
    id: 'QUERIES_INDIRECT',
    label: 'Searches for what you do',
    explanation: 'Google stopped splitting searches into direct, discovery and branded in 2023.',
    discontinuedOn: '2023-03-30',
    reason: 'not_supported',
  },
  QUERIES_CHAIN: {
    id: 'QUERIES_CHAIN',
    label: 'Searches for your brand',
    explanation: 'Google stopped splitting searches into direct, discovery and branded in 2023.',
    discontinuedOn: '2023-03-30',
    reason: 'not_supported',
  },
  PHOTOS_VIEWS_MERCHANT: {
    id: 'PHOTOS_VIEWS_MERCHANT',
    label: 'Views of photos you posted',
    explanation: 'Google removed photo view counts from its API in 2023 and did not replace them.',
    discontinuedOn: '2023-02-20',
    reason: 'not_supported',
  },
  PHOTOS_VIEWS_CUSTOMERS: {
    id: 'PHOTOS_VIEWS_CUSTOMERS',
    label: 'Views of customer photos',
    explanation: 'Google removed photo view counts from its API in 2023 and did not replace them.',
    discontinuedOn: '2023-02-20',
    reason: 'not_supported',
  },
  PHOTOS_COUNT_MERCHANT: {
    id: 'PHOTOS_COUNT_MERCHANT',
    label: 'Number of photos you posted',
    explanation: 'Google removed photo counts from its API in 2023 and did not replace them.',
    discontinuedOn: '2023-02-20',
    reason: 'not_supported',
  },
  PHOTOS_COUNT_CUSTOMERS: {
    id: 'PHOTOS_COUNT_CUSTOMERS',
    label: 'Number of customer photos',
    explanation: 'Google removed photo counts from its API in 2023 and did not replace them.',
    discontinuedOn: '2023-02-20',
    reason: 'not_supported',
  },
  LOCAL_POST_VIEWS_SEARCH: {
    id: 'LOCAL_POST_VIEWS_SEARCH',
    label: 'Views of your Google posts',
    explanation: 'Google removed post performance from its API in 2023 and did not replace it.',
    discontinuedOn: '2023-02-20',
    reason: 'not_supported',
  },
  LOCAL_POST_ACTIONS_CALL_TO_ACTION: {
    id: 'LOCAL_POST_ACTIONS_CALL_TO_ACTION',
    label: 'Clicks on your post buttons',
    explanation: 'Google removed post performance from its API in 2023 and did not replace it.',
    discontinuedOn: '2023-02-20',
    reason: 'not_supported',
  },
  DRIVING_DIRECTION_GEOGRAPHY: {
    id: 'DRIVING_DIRECTION_GEOGRAPHY',
    label: 'Where direction requests came from',
    explanation:
      'Google removed the map of where direction requests came from in 2023. Only the total remains.',
    discontinuedOn: '2023-03-30',
    reason: 'not_supported',
  },
  MEDIA_INSIGHTS: {
    id: 'MEDIA_INSIGHTS',
    label: 'Performance of an individual photo',
    explanation: 'Google removed per-photo statistics from its API in 2023 and did not replace them.',
    discontinuedOn: '2023-02-20',
    reason: 'not_supported',
  },
};

export const REMOVED_METRIC_IDS: readonly RemovedMetricId[] = Object.keys(
  REMOVED_METRICS,
) as RemovedMetricId[];

export function isRemovedMetric(value: string): value is RemovedMetricId {
  return Object.prototype.hasOwnProperty.call(REMOVED_METRICS, value);
}

/**
 * The ONLY state a removed metric may ever produce.
 *
 * Returns `unavailable('not_supported', …)` carrying the short explanation. It
 * is deliberately impossible for this function to return a `ready` state, so
 * there is no way to render a removed metric as a number, a zero, an empty
 * chart or a "coming soon".
 */
export function removedMetricState(id: RemovedMetricId): UnavailableState {
  const definition = REMOVED_METRICS[id];
  return unavailable(definition.reason, definition.explanation);
}

/**
 * Lookup by any string, including a legacy key read from stored data.
 * Returns `null` when the id is not a known removed metric.
 */
export function removedMetricStateFor(id: string): UnavailableState | null {
  return isRemovedMetric(id) ? removedMetricState(id) : null;
}

/* -------------------------------------------------------------------------- */
/* Metrics that were renamed, not deleted                                     */
/* -------------------------------------------------------------------------- */

/**
 * Kept apart from `REMOVED_METRICS` on purpose: for these there IS an honest
 * answer, so `removedMetricState()` must not claim otherwise.
 */
export const RENAMED_METRICS: readonly RenamedMetricDefinition[] = [
  {
    legacyId: 'VIEWS_MAPS',
    label: 'Maps views',
    replacedBy: ['BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_MAPS'],
    discontinuedOn: '2023-03-30',
  },
  {
    legacyId: 'VIEWS_SEARCH',
    label: 'Search views',
    replacedBy: ['BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH'],
    discontinuedOn: '2023-03-30',
  },
  {
    legacyId: 'ACTIONS_WEBSITE',
    label: 'Website actions',
    replacedBy: ['WEBSITE_CLICKS'],
    discontinuedOn: '2023-03-30',
  },
  {
    legacyId: 'ACTIONS_PHONE',
    label: 'Phone actions',
    replacedBy: ['CALL_CLICKS'],
    discontinuedOn: '2023-03-30',
  },
  {
    legacyId: 'ACTIONS_DRIVING_DIRECTIONS',
    label: 'Driving direction actions',
    replacedBy: ['BUSINESS_DIRECTION_REQUESTS'],
    discontinuedOn: '2023-03-30',
  },
];

export function renamedMetricFor(legacyId: string): RenamedMetricDefinition | null {
  return RENAMED_METRICS.find((entry) => entry.legacyId === legacyId) ?? null;
}
