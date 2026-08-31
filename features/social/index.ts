/**
 * features/social — public surface. Owner: Yash.
 *
 * Other features import from '@/features/social' and nothing deeper.
 *
 * NOTE: this feature does NOT call `registerProvider()` for Instagram,
 * Facebook or LinkedIn, and that is deliberate — the same reasoning
 * `features/gbp` records for Google. `app/(tabs)/business.tsx` shows
 * "Integration not built yet" precisely when the provider is unregistered.
 * Registering an implementation that can only answer `not_connected` would
 * delete that true statement and replace it with the claim that a Meta or
 * LinkedIn integration exists. Register the day `connect()` completes a real
 * OAuth flow — not before.
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
  VIDEO_FORMATS,
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
  type PublishStatus,
  type PublishTarget,
  type Schedule,
  type SocialPost,
} from './types';

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

/* -- Platform capabilities (all UNVERIFIED — see platforms.ts) ------------ */
export {
  assumesFormatAccepted,
  capabilitiesFor,
  checkCaptionLength,
  checkHashtagCount,
  checkMediaFormat,
  checkSlideCount,
  hasResearchedCapabilities,
  isVerified,
  KNOWN_FORMATS,
  PLATFORM_CAPABILITIES,
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
  validateSchedule,
  type ScheduleRejection,
  type ScheduleRunner,
  type ScheduleValidation,
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
