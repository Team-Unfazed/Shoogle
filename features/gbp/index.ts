/**
 * features/gbp — public surface. Owner: Pranay.
 *
 * Other features import from '@/features/gbp' and nothing deeper.
 *
 * NOTE: this feature does NOT call `registerProvider('google_business', …)`,
 * and that is deliberate. See the header of `provider.ts`: registering a
 * provider that can only answer `not_connected` would make the shell claim a
 * Google integration exists. It does not, until an approved API quota and a
 * server-side token exchange do.
 */

export {
  createGoogleBusinessProfileProvider,
  describeGbpAvailability,
  googleBusinessProfileProvider,
  type GbpAdapter,
  type GbpHoursUpdateOutcome,
  type GbpPerformanceReport,
  type GbpProviderDeps,
  type GbpReplyOutcome,
  type GbpSession,
  type GbpTransport,
} from './provider';

export {
  classifyVoiceOfMerchant,
  describeVoiceOfMerchant,
  toContractVerificationState,
  voiceOfMerchantGate,
  type VoiceOfMerchantExplanation,
  type VoiceOfMerchantKind,
  type VoiceOfMerchantOutcome,
} from './voiceOfMerchant';

export {
  classifyGbpFailure,
  gbpFailureState,
  gbpFailureToDataState,
  type GbpFailure,
  type GbpFailureKind,
  type GbpTransportOutcome,
} from './errors';

export {
  GBP_PERMANENT_UNAVAILABLE_STATES,
  removedCapabilityState,
  unsupportedCapabilityState,
} from './capabilities';

export {
  describeReplyModeration,
  describeGoogleUpdatedField,
  type ReviewMapResult,
} from './mappers';

export {
  formatKeywordImpressions,
  isRenderableDailyMetric,
  DAILY_METRIC_LABELS,
  DAILY_METRIC_UNKNOWN,
  LIVE_DAILY_METRICS,
  REMOVED_GBP_CAPABILITIES,
  UNSUPPORTED_GBP_CAPABILITIES,
  type GbpDailyPoint,
  type GbpGoogleUpdatedDiff,
  type GbpKeywordImpressions,
  type GbpKeywordRow,
  type GbpLiveDailyMetric,
  type GbpReplyModeration,
  type GbpReviewDetail,
  type GbpReviewPage,
  type RemovedGbpCapability,
  type UnsupportedGbpCapability,
} from './types';

export { GBP_EDIT_QPM_PER_PROFILE, GBP_OAUTH_SCOPE, GBP_READ_QPM_PER_API } from './endpoints';
export { createGbpWriteQueue, type GbpWriteQueue } from './writeQueue';
