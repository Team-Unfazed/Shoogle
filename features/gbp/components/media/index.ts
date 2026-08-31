/**
 * features/gbp/components/media — the Photos surface. Owner: Pranay.
 *
 * Consumed by `app/seo/photos.tsx`. Nothing in here fetches: the screen owns
 * the `DataState`, these components render what it hands them, and the model
 * module below is pure so every rule it encodes is testable without a clock or
 * a network.
 *
 * The one rule the whole folder exists to hold: there is no type here that can
 * carry a photo view count, because Google deleted photo views and photo counts
 * from the API on 2023-02-20 and shipped no replacement. `PhotoViewsNotice`
 * renders that absence as `unavailable('not_supported')` — never 0, never
 * "coming soon".
 */

export { AddMediaSheet } from './AddMediaSheet';
export { AgentMediaBanner, type MediaAgentState } from './AgentMediaBanner';
export { MediaCoverageCard } from './MediaCoverageCard';
export { MediaStrip } from './MediaStrip';
export { MediaWriteGateNotice } from './MediaWriteGateNotice';
export { PhotoViewsNotice } from './PhotoViewsNotice';
export { ScheduledMediaTimeline } from './ScheduledMediaTimeline';
export { WhyPublishCard } from './WhyPublishCard';

export {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_HINT,
  MEDIA_CATEGORY_LABEL,
  MEDIA_COVERAGE_BUCKETS,
  MEDIA_INSIGHTS_UNAVAILABLE,
  MEDIA_REQUIREMENTS,
  MIN_FILE_BYTES,
  MIN_SHORT_EDGE_PX,
  PHOTO_COUNTS_UNAVAILABLE,
  PHOTO_INSIGHTS_REMOVED_ON,
  PHOTO_VIEWS_UNAVAILABLE,
  SIZE_EXEMPT_CATEGORIES,
  computeMediaCoverage,
  coverageEvidenceSentence,
  daysBetween,
  describeMediaAge,
  describeSchedule,
  describeValidation,
  formatBytes,
  validateMediaCandidate,
  type GbpMediaCategory,
  type GbpMediaFormat,
  type GbpMediaItem,
  type MediaAge,
  type MediaCandidate,
  type MediaCoverageBucket,
  type MediaCoverageBucketDefinition,
  type MediaCoverageObservation,
  type MediaValidation,
  type MediaValidationGap,
  type MediaValidationProblem,
  type ScheduledMediaItem,
} from './model';
