/**
 * features/gbp/components/performance — the parts of `app/seo/performance.tsx`.
 * Owner: Pranay.
 *
 * Everything here is PRESENTATIONAL plus one pure model module. Nothing fetches
 * and nothing can reach `fixtures/` (ESLint blocks that outside `app/` and
 * tests), so the decision about where data came from — and the fixture banner
 * that must accompany it — stays with the screen.
 *
 * These are composed from `@/components/ui` and `@/components/shared`. They are
 * not a second design system: no colour, radius, font size or spacing is
 * written here that did not come from `@/theme`, except the chart's plot
 * geometry, which the token scale does not cover and which is declared as named
 * constants in `DailySeriesChart.tsx`.
 */

export { DailySeriesChart, type DailySeriesChartProps } from './DailySeriesChart';
export {
  MetricReadingCard,
  explanationFor,
  statusChipFor,
  valueFor,
  type MetricReadingCardProps,
} from './MetricReadingCard';
export { PerformanceView, type PerformanceViewProps } from './PerformanceView';
export { RemovedMetricsCard, type RemovedMetricsCardProps } from './RemovedMetricsCard';

export {
  DEFAULT_PERIOD,
  FOOD_METRICS,
  GROUP_COPY,
  GROUP_ORDER,
  UNKNOWN_PROFILE_CAPABILITIES,
  buildSnapshot,
  chartableMetrics,
  combinedImpressions,
  describeSeries,
  formatRange,
  formatReadOn,
  formatShortDay,
  notApplicableObservation,
  periodLabelFor,
  rowFor,
  rowsInGroup,
  seriesFor,
  shortPeriodLabel,
  snapshotFromReport,
  snapshotFromResponse,
  type BuildSnapshotOptions,
  type CombinedImpressions,
  type MetricCoverage,
  type MetricReading,
  type PerformanceRow,
  type PerformanceSeries,
  type PerformanceSnapshot,
  type ProfileCapabilities,
  type SeriesShape,
} from './model';
