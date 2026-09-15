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
  centredCrop,
  createExpoMediaPreparer,
  expoImageManipulatorModule,
  expoMediaPreparer,
  PREPARE_FAILED,
  PREPARE_MEASURE_FAILED,
  QUALITY_LADDER,
  saveableFormat,
  type ExpoPreparerDeps,
  type ImageManipulatorModule,
  type ManipulatedImage,
  type ManipulationRequest,
  type MeasureBytes,
  type SaveableFormat,
} from './expoPreparer';

export {
  createExpoMediaSource,
  expoImagePickerModule,
  expoMediaSource,
  formatFromMime,
  kindFromPicked,
  PICKER_FAILED,
  PICKER_PERMISSION_BLOCKED,
  PICKER_PERMISSION_DENIED,
  toMediaAsset,
  type ExpoMediaSourceDeps,
  type ExpoPickerModule,
  type PickedAsset,
  type PickerLaunchOptions,
  type PickerPermission,
  type PickerResult,
} from './expoPicker';

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
