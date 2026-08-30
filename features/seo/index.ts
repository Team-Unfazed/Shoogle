/**
 * features/seo - public surface. Owner: Pranay.
 *
 * Other features import from '@/features/seo' and nothing deeper.
 *
 * ## What is genuinely built here
 *
 * - The threshold-aware keyword impressions union and its formatter. Google
 *   reports low-volume keywords as a BOUND, not a number, and this is the only
 *   sanctioned way to put one on screen.
 * - The eleven surviving `DailyMetric` values, plus the registry of metrics
 *   Google deleted in 2023, which can only ever produce
 *   `unavailable('not_supported', …)`.
 * - `seoProvider`, whose rankings are permanently `not_supported` because no
 *   Google API returns a rank position.
 * - `./ai` — the visibility check, schema generation, directory checklist and
 *   readability observations, none of which need a model or a credential.
 *
 * Nothing here implies a Google connection exists. `SeoProvider` is not a
 * `ConnectableProvider`, so nothing in this feature is handed to
 * `registerProvider()`.
 */

/* Types ------------------------------------------------------------------- */

export {
  DAILY_METRIC_UNKNOWN,
  RANK_NOT_MEASURABLE_MESSAGE,
  type DailyMetricDefinition,
  type DailyMetricEnumValue,
  type DailyMetricGroup,
  type DailyMetricSentinel,
  type EvidenceBasis,
  type KeywordImpressionRow,
  type KeywordImpressions,
  type LiveDailyMetric,
  type RawInsightsValue,
  type RemovedMetricDefinition,
  type RemovedMetricId,
  type RenamedMetricDefinition,
  type SearchKeywordsReport,
  type SeoFinding,
} from './types';

/* Keyword impressions ------------------------------------------------------ */

export {
  belowThresholdImpressions,
  compareKeywordRows,
  countBelowThreshold,
  describeKeywordImpressions,
  exactImpressions,
  formatKeywordImpressions,
  groupThousands,
  isBelowThreshold,
  parseInsightsValue,
} from './keywords';

/* Metric registries -------------------------------------------------------- */

export {
  LIVE_DAILY_METRICS,
  LIVE_DAILY_METRIC_ORDER,
  REMOVED_METRICS,
  REMOVED_METRIC_IDS,
  RENAMED_METRICS,
  dailyMetricLabel,
  isLiveDailyMetric,
  isRemovedMetric,
  isRenderableDailyMetric,
  omittedDailyMetrics,
  removedMetricState,
  removedMetricStateFor,
  renamedMetricFor,
  toMetrics,
  type DailyMetricSample,
} from './metrics';

/* Provider ----------------------------------------------------------------- */

export {
  seoProvider,
  type KeywordImpressionsProvider,
  type ShoogleSeoProvider,
} from './provider';

/* AI layer ----------------------------------------------------------------- */

export * from './ai';
