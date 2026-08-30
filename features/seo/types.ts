/**
 * features/seo — core domain types. Owner: Pranay.
 *
 * These types exist because the Google Business Profile Performance API v1
 * returns shapes that collapse into a lie if you model them as plain numbers.
 * See `docs/research/google-business-profile.md` §7.
 *
 * THREE THINGS THAT ARE NOT THE SAME, and each has its own representation:
 *
 *   | Fact                          | Representation                          |
 *   |-------------------------------|-----------------------------------------|
 *   | We did not / could not ask    | `DataState` -> `unavailable(reason, …)`  |
 *   | We asked, answer was "none"   | `{ kind: 'exact', value: 0 }`            |
 *   | We asked, answer was a bound  | `{ kind: 'below_threshold', threshold }` |
 *
 * Nothing in this file performs I/O.
 */

import type { UnavailableReason } from '@/lib/state/DataState';

/* -------------------------------------------------------------------------- */
/* Search-keyword impressions — the threshold union                           */
/* -------------------------------------------------------------------------- */

/**
 * What `locations.searchkeywords.impressions.monthly.list` actually returns per
 * keyword. `SearchKeywordCount.insightsValue` is a union in the API itself:
 * either `value` (an exact count of unique users) or `threshold` ("a threshold
 * that indicates that the actual value is below this threshold").
 *
 * <https://developers.google.com/my-business/reference/performance/rest/v1/locations.searchkeywords.impressions.monthly/list>
 *
 * Most keywords for a neighbourhood business come back as a threshold. Render a
 * threshold as a number and you have fabricated data; render it as `0` and you
 * have broken "unknown is not zero" twice. Hence the union — never a bare
 * `number`.
 */
export type KeywordImpressions =
  | {
      readonly kind: 'exact';
      /** Unique users who searched this term in the month. May legitimately be 0. */
      readonly value: number;
    }
  | {
      readonly kind: 'below_threshold';
      /** The actual count is strictly BELOW this. It is not the count. */
      readonly threshold: number;
    };

/** One month's impressions for one keyword, as the API groups them. */
export interface KeywordImpressionRow {
  /** Google lowercases search keywords; we keep them as returned. */
  readonly keyword: string;
  /** First day of the month the count covers, as `YYYY-MM-01`. */
  readonly monthStart: string;
  readonly impressions: KeywordImpressions;
}

/**
 * A month of search terms for one location.
 *
 * `partial` is true when Google returned fewer rows than it holds (paging cut
 * short, or the request was truncated). A partial list must never be presented
 * as "all the terms you were found for".
 */
export interface SearchKeywordsReport {
  readonly locationId: string;
  readonly monthStart: string;
  readonly rows: readonly KeywordImpressionRow[];
  readonly partial: boolean;
}

/**
 * The raw `insightsValue` shape as it arrives on the wire. Both members are
 * strings in the JSON (int64 fields are serialised as strings), and exactly one
 * of them is present.
 */
export interface RawInsightsValue {
  readonly value?: string | number | null;
  readonly threshold?: string | number | null;
}

/* -------------------------------------------------------------------------- */
/* DailyMetric — the surviving eleven, and the sentinel                        */
/* -------------------------------------------------------------------------- */

/**
 * The eleven `DailyMetric` enum values that still return data.
 *
 * This is the ENTIRE universe of Google Business Profile metrics available
 * today. Anything not in this union either never existed or was removed in
 * 2023 — see `REMOVED_METRICS` in `./metrics`.
 *
 * <https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric>
 */
export type LiveDailyMetric =
  | 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS'
  | 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH'
  | 'BUSINESS_IMPRESSIONS_MOBILE_MAPS'
  | 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH'
  | 'BUSINESS_CONVERSATIONS'
  | 'BUSINESS_DIRECTION_REQUESTS'
  | 'CALL_CLICKS'
  | 'WEBSITE_CLICKS'
  | 'BUSINESS_BOOKINGS'
  | 'BUSINESS_FOOD_ORDERS'
  | 'BUSINESS_FOOD_MENU_CLICKS';

/**
 * The enum's default member. Google returns it when it has nothing to say.
 *
 * It is NOT a metric and NOT a zero. It must never be rendered, never labelled,
 * and never enter a `Metric[]`. `isRenderableDailyMetric()` exists so that rule
 * is enforced by a function rather than by memory.
 */
export const DAILY_METRIC_UNKNOWN = 'DAILY_METRIC_UNKNOWN';

export type DailyMetricSentinel = typeof DAILY_METRIC_UNKNOWN;

/** Every value the `DailyMetric` enum can carry today, sentinel included. */
export type DailyMetricEnumValue = LiveDailyMetric | DailyMetricSentinel;

/** Which part of the profile a metric describes. Used for grouping, not maths. */
export type DailyMetricGroup = 'impressions' | 'actions' | 'transactions';

export interface DailyMetricDefinition {
  readonly metric: LiveDailyMetric;
  /** Stable machine key for `Metric.key`, e.g. `gbp.impressions_mobile_search`. */
  readonly key: string;
  /** Owner-facing label. English UI, product rule 12. */
  readonly label: string;
  readonly group: DailyMetricGroup;
  /**
   * The caveat that must travel with the number. Impressions are deduplicated
   * per unique user per day, so "impressions" is not "views" and four separate
   * impression metrics do not describe four separate audiences.
   */
  readonly note: string;
  /** Every live metric is a plain count. Kept explicit so formatting is typed. */
  readonly unit: 'count';
}

/* -------------------------------------------------------------------------- */
/* Metrics Google deleted                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Metrics that were removed with NO replacement. These are permanently
 * unavailable — not "coming soon", not "0", not an empty chart.
 *
 * <https://developers.google.com/my-business/content/sunset-dates>
 */
export type RemovedMetricId =
  | 'ALL'
  | 'QUERIES_DIRECT'
  | 'QUERIES_INDIRECT'
  | 'QUERIES_CHAIN'
  | 'PHOTOS_VIEWS_MERCHANT'
  | 'PHOTOS_VIEWS_CUSTOMERS'
  | 'PHOTOS_COUNT_MERCHANT'
  | 'PHOTOS_COUNT_CUSTOMERS'
  | 'LOCAL_POST_VIEWS_SEARCH'
  | 'LOCAL_POST_ACTIONS_CALL_TO_ACTION'
  | 'DRIVING_DIRECTION_GEOGRAPHY'
  | 'MEDIA_INSIGHTS';

export interface RemovedMetricDefinition {
  readonly id: RemovedMetricId;
  /** What an owner would have called it. */
  readonly label: string;
  /**
   * One short, honest sentence for the owner explaining why the number is not
   * there. It says what happened; it does not promise a future.
   */
  readonly explanation: string;
  /** ISO date Google discontinued it. */
  readonly discontinuedOn: string;
  /** Always 'not_supported' — kept on the record so callers cannot pick another. */
  readonly reason: Extract<UnavailableReason, 'not_supported'>;
}

/**
 * Metrics that were renamed or split rather than deleted. These are NOT in
 * `REMOVED_METRICS`, because for these there is an honest answer to give.
 */
export interface RenamedMetricDefinition {
  readonly legacyId: string;
  readonly label: string;
  /** One or more live metrics that together carry the same meaning. */
  readonly replacedBy: readonly LiveDailyMetric[];
  readonly discontinuedOn: string;
}

/* -------------------------------------------------------------------------- */
/* Rankings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Why Shoogle does not show a rank position, in one owner-facing sentence.
 *
 * Google exposes no search-rank position through any Business Profile API, and
 * the only sources that do are paid SERP scrapers. `KeywordRanking.position`
 * therefore stays `null` and `SeoProvider.getRankings()` returns
 * `unavailable('not_supported', …)` — see `./provider`.
 */
export const RANK_NOT_MEASURABLE_MESSAGE =
  'Google does not publish where you rank, so we will not guess. ' +
  'We show what Google does report: the search terms people used to find you.';

/* -------------------------------------------------------------------------- */
/* Findings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How strongly a claim is supported. Copy must match: a `study` finding says
 * "studies suggest", a `confirmed` finding may say "Google says".
 */
export type EvidenceBasis =
  /** First-party documentation from the vendor concerned. */
  | 'confirmed'
  /** A published third-party study. Cite it and name it as a study. */
  | 'study'
  /** Practitioner convention. Never the sole basis of a 'critical'. */
  | 'industry';

/**
 * A feature-local superset of `AuditFinding` (which lives in
 * `lib/providers/contracts.ts` and belongs to Sunny — we compose it, we do not
 * edit it). `observation` is what was literally seen; `title`/`detail` are the
 * interpretation. Keeping them apart is what stops the audit inventing facts.
 */
export interface SeoFinding {
  readonly id: string;
  readonly checkId: string;
  readonly title: string;
  readonly detail: string;
  readonly severity: 'critical' | 'important' | 'minor';
  /** Route the owner can open to fix it, or null when the fix is off-app. */
  readonly fixHref: string | null;
  /** What was literally observed, quoted where possible. */
  readonly observation: string;
  readonly evidenceBasis: EvidenceBasis;
}
