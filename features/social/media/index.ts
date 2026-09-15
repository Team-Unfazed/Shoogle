/**
 * features/social/media — from a file on the phone to a URL a platform can
 * fetch. Owner: Yash.
 *
 *   MediaAsset  ──probe──▶ measured ──plan──▶ prepare ──▶ PreparedMedia
 *                                                              │
 *                                                     MediaHost.publish()
 *                                                              ▼
 *                                                       PublishableMedia
 *
 * Only the last of those can reach a `PlatformPublisher`, and only a
 * `MediaHost` can mint one. Nothing in this folder uploads anything today.
 */

export {
  isLocalUri,
  mintPublishableMedia,
  type MediaProblem,
  type MediaProblemCode,
  type MintPublishableInput,
  type PreparationChange,
  type PreparationPlan,
  type PreparedMedia,
  type PublishableMedia,
} from './types';

export {
  cropToRatioRange,
  getMediaPreparer,
  planPreparation,
  planStoryVideo,
  PREPARER_NOT_CONFIGURED,
  scaleToWidth,
  setMediaPreparer,
  unconfiguredPreparer,
  validateForPlatform,
  type MediaPreparer,
} from './prepare';

export {
  getMediaHost,
  hostForPlatform,
  isMediaHostingAvailable,
  MEDIA_HOST_NOT_CONFIGURED,
  setMediaHost,
  unconfiguredMediaHost,
  type HostedForPlatform,
  type MediaHost,
} from './host';

export {
  getMediaSource,
  isMeasured,
  MEDIA_SOURCE_NOT_CONFIGURED,
  setMediaSource,
  unconfiguredMediaSource,
  unmeasuredFields,
  type MediaSource,
  type PickOptions,
} from './probe';
