/**
 * features/social — public surface. Owner: Yash.
 *
 * Other features import from '@/features/social' and nothing deeper.
 *
 * NOTE: this feature does NOT call `registerProvider()` for Instagram, and that
 * is deliberate — the same reasoning `features/gbp` records for Google.
 * `app/(tabs)/business.tsx` shows "Integration not built yet" precisely when
 * the provider is unregistered. Registering an implementation that can only
 * answer `not_connected` would delete that true statement and replace it with
 * the claim that a Meta integration exists. Register the day `connect()`
 * completes a real OAuth flow — not before.
 *
 * SCOPE: Instagram, Facebook and Google Business Profile, in any combination
 * the owner chooses. That is the whole of it — LinkedIn left publishing scope
 * on 2026-09-01 and was removed from the product entirely on 2026-09-16, so it
 * is no longer a `ProviderId`.
 */

/* -- Domain -------------------------------------------------------------- */
export {
  aspectRatio,
  CAPTION_LANGUAGE_LABEL,
  describeInsights,
  describeMedia,
  describeTargets,
  IMAGE_FORMATS,
  isConfirmedPublished,
  newTarget,
  PLATFORM_LABEL,
  PLATFORM_SHORT_LABEL,
  SOCIAL_PLATFORMS,
  targetPlatforms,
  targetsNeedingAttention,
  VIDEO_FORMATS,
  wasSkippedForUnavailability,
  type BusinessBrief,
  type Caption,
  type CaptionLanguage,
  type CaptionOrigin,
  type MediaAsset,
  type MediaFormat,
  type MediaKind,
  type Platform,
  type PostInsights,
  type PublishFailure,
  type PublishFailureKind,
  type PublishStatus,
  type PublishTarget,
  type Schedule,
  type SocialPost,
} from './types';

/* -- Per-platform content (three genuinely different objects) ------------ */
export {
  facebookContent,
  facebookMedia,
  GBP_CTA_TYPES,
  gbpContent,
  hasAnyContent,
  instagramAltText,
  instagramContent,
  instagramMedia,
  missingContentFor,
  platformsWithContent,
  primaryText,
  publishablePlatforms,
  reviewFacebookContent,
  reviewGbpContent,
  reviewInstagramContent,
  reviewPlatformContent,
  reviewPostContent,
  type ContentIssue,
  type ContentReview,
  type FacebookContent,
  type FacebookFormat,
  type GbpAlertType,
  type GbpCallToAction,
  type GbpContent,
  type GbpCtaType,
  type GbpEvent,
  type GbpOffer,
  type GbpTopic,
  type InstagramCarouselItem,
  type InstagramContent,
  type InstagramFormat,
  type PlatformContent,
  type PostContent,
} from './content';

/* -- Generation (no key is read anywhere in this feature) ---------------- */
export * from './generation';

/* -- The compose flow ---------------------------------------------------- */
export * from './compose';

/* -- Media: device file -> prepared -> hosted, publishable URL ----------- */
export * from './media';

/* -- Per-platform media specs -------------------------------------------- */
export {
  checkMediaAgainstSpec,
  INSTAGRAM_STORY_VIDEO,
  MEDIA_SPECS,
  mediaSpecFor,
  type ImageSpec,
  type PlatformMediaSpec,
  type VideoSpec,
} from './mediaSpecs';

/* -- Per-platform availability (product rule 13) ------------------------- */
export {
  availabilityFor,
  availabilityForAll,
  availablePlatforms,
  REQUIRED_SCOPES,
  selectableTargets,
  type OwnerAction,
  type PlatformAvailability,
  type PlatformConnection,
  type PlatformInputs,
  type UnavailableReason,
} from './availability';

/* -- Lifecycle ----------------------------------------------------------- */
export {
  canTransition,
  DRAFT_LIKE_STATES,
  isTerminal,
  NEEDS_OWNER_STATES,
  nextState,
  POST_EVENTS,
  POST_STATE_LABEL,
  POST_STATES,
  toSharedStatus,
  transition,
  TRANSITIONS,
  type PostEvent,
  type PostState,
} from './postState';

/* -- Captions ------------------------------------------------------------ */
export {
  allHashtags,
  captionLength,
  editCaption,
  extractInlineHashtags,
  generatedCaption,
  normaliseHashtags,
  ownerCaption,
  renderCaption,
  reviewCaption,
  type CaptionIssue,
  type CaptionProblem,
  type CaptionReview,
} from './captions';

/* -- Platform capabilities (partly verified — read the header of platforms.ts) */
export {
  capabilitiesFor,
  checkCaptionLength,
  checkHashtagCount,
  checkMediaFormat,
  checkSlideCount,
  conflicted,
  hasResearchedCapabilities,
  isEnforceable,
  isVerified,
  KNOWN_FORMATS,
  PLATFORM_CAPABILITIES,
  unsourcedLimits,
  unverified,
  verified,
  type CheckOutcome,
  type CheckResult,
  type Limit,
  type PlatformCapabilities,
} from './platforms';

/* -- Scheduling ---------------------------------------------------------- */
export {
  bySoonestDue,
  isDue,
  MAX_SCHEDULE_HORIZON_DAYS,
  MIN_SCHEDULE_LEAD_MINUTES,
  nextDuePost,
  scheduleWindowFor,
  validateSchedule,
  type ScheduleRejection,
  type ScheduleRunner,
  type ScheduleValidation,
  type ScheduleWindow,
} from './scheduling';

export {
  calendarDayDelta,
  formatClock,
  formatNextUpLabel,
  formatScheduleLabel,
  instantAtZonedTime,
  zonedDateAhead,
  zonedParts,
  type ZonedParts,
} from './time';

/* -- Generation ---------------------------------------------------------- */
export {
  getSocialContentGenerator,
  isGenerationAvailable,
  setSocialContentGenerator,
  unconfiguredGenerator,
  type CaptionRequest,
  type GeneratedCaption,
  type GeneratedSlideCopy,
  type SlideCopyRequest,
  type SocialContentGenerator,
} from './generator';

/* -- Publishing ---------------------------------------------------------- */
export {
  applyPublishOutcome,
  createSocialPublisher,
  toDomainPost,
  type PlatformPublisher,
  type PlatformPublishRequest,
  type PublishOutcome,
  type ShooglePublisher,
  type SocialPublisherDeps,
} from './publisher';

export { createInMemoryPostStore, type PostQuery, type PostStore } from './store';

/* -- The Posts tab ------------------------------------------------------- */
export {
  buildPostsView,
  isPostsViewEmpty,
  type AttentionView,
  type FailedRowView,
  type NextUpView,
  type PostsView,
  type PublishedRowView,
  type ScheduledRowView,
} from './view';

export {
  NO_POSTS_BODY,
  NO_POSTS_TITLE,
  postsViewState,
  usePostsView,
} from './usePostsView';

/* -- Publication summary (derived, never stored) -------------------------- */
export {
  ACTION_LABEL,
  describeOutcome,
  describeTargetResults,
  primaryAction,
  publishSummary,
  resultFor,
  TARGET_RESULT_LABEL,
  targetsForAction,
  type PublishSummary,
  type PublishSummaryOutcome,
  type TargetAction,
  type TargetResult,
  type TargetResultKind,
} from './summary';
