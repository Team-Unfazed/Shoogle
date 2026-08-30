/**
 * features/gbp/components/getReviews — the review-request generator.
 * Owner: Pranay.
 *
 * Consumed by `app/seo/get-reviews.tsx`. Everything here is pure logic or
 * presentation: nothing in this folder reads fixtures, calls a provider, or
 * decides whether a Google account is connected. That belongs to the screen,
 * which is also where the fixture banner lives.
 */

export { QrCode, QrUnavailable, type QrCodeProps } from './QrCode';
export {
  darkRects,
  encodeQr,
  QR_MAX_BYTES,
  QR_QUIET_ZONE_MODULES,
  type QrEncodeResult,
  type QrMatrix,
  type QrRect,
} from './qr';

export {
  describeReviewLink,
  GOOGLE_WRITE_REVIEW_PREFIX,
  parsePastedReviewLink,
  reviewLinkForPlaceId,
  type ReviewLink,
  type ReviewLinkKind,
  type ReviewLinkParse,
  type ReviewLinkRejection,
  type ReviewLinkSource,
} from './reviewLink';

export {
  formatNationalMobile,
  parseIndianMobile,
  reviewRequestMessage,
  type MessageTone,
  type PhoneParse,
} from './message';

export {
  copyToClipboard,
  openWhatsApp,
  whatsAppUrl,
  type ClipboardLike,
  type CopyOutcome,
  type LinkingLike,
  type WhatsAppHandoff,
} from './share';

export {
  loadRequestLog,
  parseRequestLog,
  recordConfirmedRequest,
  REVIEW_REQUEST_LOG_KEY,
  startOfWeek,
  summarise,
  SUGGESTED_WEEKLY_REQUESTS,
  type AsyncStorageLike,
  type RequestChannel,
  type ReviewRequestEntry,
  type WeeklyRequestSummary,
} from './requestLog';

export { ReviewLinkCard, ReviewQrCard, type ReviewLinkCardProps } from './ReviewLinkCard';
export { WeeklyRequestsCard, type WeeklyRequestsCardProps } from './WeeklyRequestsCard';
export { NewReviewsCard, type NewReviewsCardProps, type ReviewCountChange } from './NewReviewsCard';
export {
  ConfirmSendCard,
  SendRequestCard,
  type ConfirmSendCardProps,
  type SendRequestCardProps,
} from './SendRequestCard';
export { GoogleRulesCard, HowThisWorksCard } from './GuidanceCards';
