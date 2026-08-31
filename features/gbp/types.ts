/**
 * Google Business Profile — wire types and the honest domain types they map to.
 * Owner: Pranay.
 *
 * RULES THIS FILE ENCODES
 * -----------------------
 * 1. Only what `docs/research/google-business-profile.md` verifies is modelled.
 *    Where the doc is silent, the field is typed as unknown-tolerant and the
 *    gap is marked UNVERIFIED — it is not guessed.
 * 2. Metrics Google permanently removed in 2023 have no type here at all, and
 *    `REMOVED_GBP_CAPABILITIES` names them so a screen can explain the absence
 *    instead of rendering `0`.
 * 3. Anything Google can legitimately not tell us is a discriminated union, not
 *    a nullable number. "Below threshold", "measured zero" and "not reported"
 *    are three different facts and all three survive to the pixel.
 */

import type { KeywordImpressions } from '@/features/seo';

/* -------------------------------------------------------------------------- */
/* Common wire shapes                                                         */
/* -------------------------------------------------------------------------- */

/** Google's `google.type.Date`. All three fields are ints, not strings. */
export interface GoogleDate {
  year?: number;
  month?: number;
  day?: number;
}

/** Google's `google.type.TimeOfDay`. */
export interface GoogleTimeOfDay {
  hours?: number;
  minutes?: number;
  seconds?: number;
  nanos?: number;
}

export interface GooglePostalAddress {
  regionCode?: string;
  languageCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  addressLines?: string[];
}

export interface GoogleLatLng {
  latitude?: number;
  longitude?: number;
}

/* -------------------------------------------------------------------------- */
/* Account Management v1                                                      */
/* -------------------------------------------------------------------------- */

export type GbpAccountType =
  | 'ACCOUNT_TYPE_UNSPECIFIED'
  | 'PERSONAL'
  | 'LOCATION_GROUP'
  | 'USER_GROUP'
  | 'ORGANIZATION';

export interface GbpAccountWire {
  /** `accounts/{accountId}`. */
  name?: string;
  accountName?: string;
  type?: GbpAccountType;
  /** UNVERIFIED enum members; treated as an opaque string. */
  role?: string;
  verificationState?: string;
  vettedState?: string;
}

export interface GbpListAccountsResponse {
  accounts?: GbpAccountWire[];
  nextPageToken?: string;
}

/* -------------------------------------------------------------------------- */
/* Business Information v1 — Location                                         */
/* -------------------------------------------------------------------------- */

export type GbpDayOfWeek =
  | 'DAY_OF_WEEK_UNSPECIFIED'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export interface GbpTimePeriod {
  openDay?: GbpDayOfWeek;
  openTime?: GoogleTimeOfDay;
  closeDay?: GbpDayOfWeek;
  closeTime?: GoogleTimeOfDay;
}

export interface GbpBusinessHours {
  periods?: GbpTimePeriod[];
}

/**
 * Special hours override regular hours. For Indian local businesses this is the
 * highest-value write in the whole API — festival closures are the single most
 * common reason a listing is wrong.
 */
export interface GbpSpecialHourPeriod {
  startDate?: GoogleDate;
  endDate?: GoogleDate;
  openTime?: GoogleTimeOfDay;
  closeTime?: GoogleTimeOfDay;
  closed?: boolean;
}

export interface GbpSpecialHours {
  specialHourPeriods?: GbpSpecialHourPeriod[];
}

export interface GbpCategory {
  /** `categories/gcid:hair_salon`. */
  name?: string;
  displayName?: string;
}

export interface GbpCategories {
  primaryCategory?: GbpCategory;
  additionalCategories?: GbpCategory[];
}

export interface GbpPhoneNumbers {
  primaryPhone?: string;
  additionalPhones?: string[];
}

export interface GbpOpenInfo {
  status?: 'OPEN_FOR_BUSINESS_UNSPECIFIED' | 'OPEN' | 'CLOSED_PERMANENTLY' | 'CLOSED_TEMPORARILY';
  canReopen?: boolean;
  openingDate?: GoogleDate;
}

export interface GbpProfile {
  /** The business description, "in your own voice". */
  description?: string;
}

/**
 * Output-only. Never send this back in a PATCH.
 *
 * `hasGoogleUpdated` is the flag that makes `locations.getGoogleUpdated` worth
 * calling: it says Google has its own version of this listing that differs from
 * the owner's.
 */
export interface GbpLocationMetadata {
  hasGoogleUpdated?: boolean;
  hasPendingEdits?: boolean;
  canDelete?: boolean;
  canOperateLocalPost?: boolean;
  canModifyServiceList?: boolean;
  canHaveFoodMenus?: boolean;
  placeId?: string;
  mapsUri?: string;
  newReviewUri?: string;
  /**
   * Present on the location resource, but it is a summary flag only. The
   * authoritative answer, including WHICH of the four remedial actions the
   * owner must take, comes from the Verifications API. Never branch UX on this
   * alone.
   */
  hasVoiceOfMerchant?: boolean;
}

export interface GbpLocationWire {
  /** `locations/{locationId}`. */
  name?: string;
  languageCode?: string;
  storeCode?: string;
  title?: string;
  phoneNumbers?: GbpPhoneNumbers;
  categories?: GbpCategories;
  storefrontAddress?: GooglePostalAddress;
  websiteUri?: string;
  regularHours?: GbpBusinessHours;
  specialHours?: GbpSpecialHours;
  openInfo?: GbpOpenInfo;
  profile?: GbpProfile;
  latlng?: GoogleLatLng;
  metadata?: GbpLocationMetadata;
}

export interface GbpListLocationsResponse {
  locations?: GbpLocationWire[];
  nextPageToken?: string;
  totalSize?: number;
}

/**
 * `locations.getGoogleUpdated` response.
 *
 * `diffMask` names the fields where Google's version differs from the owner's.
 * That list — not a score, not a guess — is the audit finding.
 */
export interface GbpGoogleUpdatedLocationWire {
  location?: GbpLocationWire;
  diffMask?: string;
  pendingMask?: string;
}

/** What an owner is actually told: which fields Google changed on them. */
export interface GbpGoogleUpdatedDiff {
  /** Field paths Google's copy differs on. Empty array = genuinely no diff. */
  changedFields: string[];
  /** Field paths with owner edits Google has not applied yet. */
  pendingFields: string[];
  googleVersion: GbpLocationWire;
}

/* -------------------------------------------------------------------------- */
/* Verifications v1 — Voice of Merchant                                       */
/* -------------------------------------------------------------------------- */

/**
 * Why Google is telling the owner to comply with guidelines. The research doc
 * confirms the two substantive reasons are suspension and disablement.
 */
export type GbpComplyReason =
  | 'RECOMMENDATION_REASON_UNSPECIFIED'
  | 'BUSINESS_LOCATION_SUSPENDED'
  | 'BUSINESS_LOCATION_DISABLED';

/**
 * `VoiceOfMerchantState` — the response of
 * `GET /v1/{name=locations/*}/VoiceOfMerchantState`.
 *
 * Exactly one of the four action fields is set when `hasVoiceOfMerchant` is
 * false. They are presence-flags, not booleans: an empty object means "this is
 * the recommended action".
 */
export interface GbpVoiceOfMerchantStateWire {
  hasVoiceOfMerchant?: boolean;
  hasBusinessAuthority?: boolean;
  /** Google is still processing; the owner does nothing but wait. */
  waitForVoiceOfMerchant?: Record<string, never>;
  /**
   * The owner must verify the listing.
   * `hasPendingVerification` is UNVERIFIED against the research doc, so it is
   * optional and its absence is treated as "we do not know", never as false.
   */
  verify?: { hasPendingVerification?: boolean };
  /** Someone else claims this listing. */
  resolveOwnershipConflict?: Record<string, never>;
  /** Suspended or disabled. */
  complyWithGuidelines?: { recommendationReason?: GbpComplyReason };
}

/* -------------------------------------------------------------------------- */
/* Legacy v4.9 — Reviews                                                      */
/* -------------------------------------------------------------------------- */

export type GbpStarRatingWire =
  | 'STAR_RATING_UNSPECIFIED'
  | 'ONE'
  | 'TWO'
  | 'THREE'
  | 'FOUR'
  | 'FIVE';

/** The only mapping. `STAR_RATING_UNSPECIFIED` deliberately has no number. */
export const STAR_RATING_TO_NUMBER: Readonly<Record<GbpStarRatingWire, 1 | 2 | 3 | 4 | 5 | null>> =
  Object.freeze({
    STAR_RATING_UNSPECIFIED: null,
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  });

export interface GbpReviewerWire {
  profilePhotoUrl?: string;
  displayName?: string;
  isAnonymous?: boolean;
}

/**
 * Why a submitted reply was rejected. Added 2026-07-01.
 * Field members beyond a human-readable reason are UNVERIFIED.
 */
export interface GbpPolicyViolationWire {
  /** Machine token, e.g. a policy id. Opaque to us. */
  violationType?: string;
  /** Owner-facing explanation, if Google supplies one. */
  description?: string;
  helpUri?: string;
}

export interface GbpReviewReplyWire {
  comment?: string;
  updateTime?: string;
  /**
   * Moderation status, added 2026-04-01.
   *
   * THE ENUM MEMBER NAMES ARE UNVERIFIED. The research doc records that the
   * field exists but does not quote its values, and this feature's rule is that
   * unverified means unknown. It is therefore typed as `string` and normalised
   * through `REVIEW_REPLY_STATE_MEANINGS` below, which is intentionally EMPTY
   * until someone reads the reference. Every value therefore normalises to
   * "state reported but not understood" — never to "published".
   */
  state?: string;
  policyViolation?: GbpPolicyViolationWire;
}

export interface GbpReviewWire {
  /** `accounts/*​/locations/*​/reviews/{reviewId}`. */
  name?: string;
  reviewId?: string;
  reviewer?: GbpReviewerWire;
  starRating?: GbpStarRatingWire;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: GbpReviewReplyWire;
}

export interface GbpListReviewsResponse {
  reviews?: GbpReviewWire[];
  nextPageToken?: string;
  /** Real, provider-computed values. Safe to render as-is. */
  averageRating?: number;
  totalReviewCount?: number;
}

/**
 * What we are willing to say about a reply that has been submitted.
 *
 * `published` is reachable ONLY through a verified mapping in
 * `REVIEW_REPLY_STATE_MEANINGS`. Because that table is empty today, no code
 * path can currently produce it — which is exactly right: Google moderates
 * replies, so a 200 from `updateReply` is not publication.
 *
 * `published` carries a REAL timestamp by construction. When Google says a
 * reply is live but sends no `updateTime`, the honest answer is
 * `published_time_unknown` — we will not manufacture a moment that Google
 * never reported, and we will not borrow the review's own timestamp for it.
 */
export type GbpReplyModeration =
  | { kind: 'published'; updateTime: string }
  /** Google says the reply is live but never said when. The time is UNKNOWN, not "now". */
  | { kind: 'published_time_unknown' }
  | { kind: 'pending_moderation'; submittedAt: string | null }
  | { kind: 'rejected'; reason: string | null; helpUri: string | null }
  /** Google reported a state token we have not verified the meaning of. */
  | { kind: 'state_not_understood'; raw: string; submittedAt: string | null }
  /** A reply exists but Google told us nothing about its moderation status. */
  | { kind: 'state_not_reported'; submittedAt: string | null }
  | { kind: 'no_reply' };

/**
 * Verified meanings of `ReviewReply.state`.
 *
 * DELIBERATELY EMPTY. Fill it in only from
 * https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
 * with the literal enum members quoted. Guessing here would let Shoogle claim a
 * reply is live on Google when it is sitting in moderation.
 */
export const REVIEW_REPLY_STATE_MEANINGS: Readonly<
  Record<string, 'published' | 'pending_moderation' | 'rejected'>
> = Object.freeze({});

/** Our own richer review shape. `lib` contracts get a lossy projection of it. */
export interface GbpReviewDetail {
  reviewId: string;
  authorDisplayName: string;
  isAnonymous: boolean;
  /** Null when Google sent `STAR_RATING_UNSPECIFIED`. Never defaulted to a number. */
  starRating: 1 | 2 | 3 | 4 | 5 | null;
  comment: string | null;
  createTime: string;
  updateTime: string | null;
  replyComment: string | null;
  replyModeration: GbpReplyModeration;
}

export interface GbpReviewPage {
  reviews: GbpReviewDetail[];
  nextPageToken: string | null;
  /** Null when Google omitted it — never 0. */
  averageRating: number | null;
  totalReviewCount: number | null;
  /**
   * Reviews Google returned that we refused to map, with why. Non-zero means
   * the page shown is incomplete and the UI must say so rather than quietly
   * showing fewer reviews than exist.
   */
  skipped: { reviewId: string | null; reason: string }[];
}

/* -------------------------------------------------------------------------- */
/* Legacy v4.9 — Local Posts (TYPES ONLY)                                     */
/* -------------------------------------------------------------------------- */

/**
 * TYPES ONLY, DELIBERATELY.
 *
 * `google_business` is already in `ProviderId` and Yash's `SocialPublisher`
 * already targets it. A composer or scheduler in this folder would create a
 * second source of truth for the same posts. These types exist so the adapter
 * can speak the API correctly; the authoring surface stays Yash's until the two
 * of us agree in writing who owns it.
 */
export type GbpLocalPostTopicType =
  | 'LOCAL_POST_TOPIC_TYPE_UNSPECIFIED'
  | 'STANDARD'
  | 'EVENT'
  | 'OFFER'
  | 'ALERT';

/**
 * Product posts are absent on purpose: Google documents that they CANNOT be
 * created through the API. There is no `PRODUCT` member to select, so no screen
 * can offer one.
 */
export type GbpCreatableTopicType = Exclude<
  GbpLocalPostTopicType,
  'LOCAL_POST_TOPIC_TYPE_UNSPECIFIED'
>;

/** `GET_OFFER` was discontinued in Q2 2021 and is not modelled. */
export type GbpCallToActionType =
  | 'ACTION_TYPE_UNSPECIFIED'
  | 'BOOK'
  | 'ORDER'
  | 'SHOP'
  | 'LEARN_MORE'
  | 'SIGN_UP'
  | 'CALL';

export type GbpLocalPostState =
  | 'LOCAL_POST_STATE_UNSPECIFIED'
  | 'REJECTED'
  | 'LIVE'
  | 'PROCESSING';

export type GbpAlertType = 'ALERT_TYPE_UNSPECIFIED' | 'COVID_19';

export interface GbpTimeInterval {
  startTime?: string;
  endTime?: string;
}

export interface GbpLocalPostEvent {
  title?: string;
  schedule?: GbpTimeInterval;
}

export interface GbpLocalPostOffer {
  couponCode?: string;
  redeemOnlineUrl?: string;
  termsConditions?: string;
}

/**
 * `sourceUrl` is the ONLY supported media field on a local post — a post takes
 * a publicly reachable URL, not a binary upload. Photos on the media resource
 * are a different path (`startUpload` → `dataRef` → `media.create`).
 */
export interface GbpLocalPostMedia {
  mediaFormat?: 'MEDIA_FORMAT_UNSPECIFIED' | 'PHOTO' | 'VIDEO';
  sourceUrl?: string;
}

export interface GbpLocalPostWire {
  name?: string;
  languageCode?: string;
  summary?: string;
  callToAction?: { actionType?: GbpCallToActionType; url?: string };
  createTime?: string;
  updateTime?: string;
  /** Native future publication. Shoogle does not simulate scheduling. */
  scheduledTime?: string;
  event?: GbpLocalPostEvent;
  offer?: GbpLocalPostOffer;
  alertType?: GbpAlertType;
  media?: GbpLocalPostMedia[];
  topicType?: GbpLocalPostTopicType;
  /** Output only. */
  state?: GbpLocalPostState;
  /** Output only. Present once the post is live. */
  searchUrl?: string;
}

/**
 * What we send to `localPosts.create`.
 *
 * No `summary` length cap is enforced: the character limit is UNVERIFIED, and
 * silently truncating an owner's words to a guessed limit is worse than letting
 * Google reject the request with its real message.
 */
export interface GbpCreateLocalPostBody {
  languageCode: string;
  summary: string;
  topicType: GbpCreatableTopicType;
  scheduledTime?: string;
  callToAction?: { actionType: GbpCallToActionType; url?: string };
  event?: GbpLocalPostEvent;
  offer?: GbpLocalPostOffer;
  alertType?: GbpAlertType;
  media?: GbpLocalPostMedia[];
}

/* -------------------------------------------------------------------------- */
/* Performance v1 — daily metrics                                             */
/* -------------------------------------------------------------------------- */

/**
 * THE METRIC REGISTRY LIVES IN `features/seo`, NOT HERE.
 *
 * `LIVE_DAILY_METRICS`, `LIVE_DAILY_METRIC_ORDER`, `DAILY_METRIC_UNKNOWN`,
 * `isRenderableDailyMetric` and `dailyMetricLabel` are all defined once, in
 * `features/seo/metrics.ts`, and imported from `@/features/seo`. This file
 * used to carry a second copy with a different shape and slightly different
 * labels, which meant two answers to "what are the eleven metrics and what is
 * this one called". There is now exactly one.
 *
 * `features/seo` is the leaf module — it performs no HTTP and imports nothing
 * from here — so `gbp → seo` is the correct direction and creates no cycle.
 */

/**
 * Things Google DELETED in 2023 with no replacement. These are not "coming
 * soon" and not "0" — they are gone, permanently, and a screen that wants one
 * must render `unavailable('not_supported', …)` using this copy.
 */
export const REMOVED_GBP_CAPABILITIES = Object.freeze({
  local_post_views: 'Google stopped reporting how many people saw a post in 2023, with no replacement.',
  local_post_cta_clicks:
    'Google stopped reporting post button clicks in 2023, with no replacement.',
  photo_views: 'Google stopped reporting photo views in 2023, with no replacement.',
  photo_counts: 'Google stopped reporting photo counts in 2023, with no replacement.',
  query_breakdown:
    'Google stopped splitting searches into direct, discovery and branded in 2023, with no replacement.',
  driving_direction_geography:
    'Google stopped reporting where direction requests came from in 2023. Only the total survives.',
  media_insights: 'Photo and video insights were removed in 2023, with no replacement.',
});

export type RemovedGbpCapability = keyof typeof REMOVED_GBP_CAPABILITIES;

/**
 * One day of one metric, as Google sends it. `value` is an int64 and therefore
 * arrives as a STRING when present.
 *
 * When `value` is absent we do not know whether the day was a measured zero or
 * simply not reported — proto3 omits default values, and the reference does not
 * say which happened. That ambiguity is UNVERIFIED and is resolved the only
 * honest way available: an absent day is UNKNOWN, never zero. See
 * `performance.ts`.
 */
export interface GbpDatedValueWire {
  date?: GoogleDate;
  value?: string;
}

export interface GbpTimeSeriesWire {
  datedValues?: GbpDatedValueWire[];
}

export interface GbpDailyMetricTimeSeriesWire {
  dailyMetric?: string;
  timeSeries?: GbpTimeSeriesWire;
}

export interface GbpMultiDailyMetricTimeSeriesWire {
  dailyMetricTimeSeries?: GbpDailyMetricTimeSeriesWire[];
}

export interface GbpFetchMultiDailyMetricsResponse {
  multiDailyMetricTimeSeries?: GbpMultiDailyMetricTimeSeriesWire[];
}

/** One day, after normalisation. The union keeps "zero" and "unknown" apart. */
export type GbpDailyPoint =
  | { date: string; kind: 'reported'; count: number }
  | { date: string; kind: 'not_reported' };

/**
 * A metric total over a window.
 *
 * `reportedDays < totalDays` means the total is a floor, not a fact, and the
 * caller must say so. `kind: 'unknown'` means Google reported nothing at all
 * for the window — the metric is then OMITTED from `Metric[]`, because
 * `Metric.value` is a non-nullable number and 0 would be a lie.
 */
export type GbpMetricTotal =
  | { kind: 'total'; total: number; reportedDays: number; totalDays: number }
  | { kind: 'unknown'; totalDays: number };

/* -------------------------------------------------------------------------- */
/* Performance v1 — search keywords                                           */
/* -------------------------------------------------------------------------- */

/**
 * `insightsValue` is a union on the wire: exactly one of `value` or
 * `threshold`. Both are int64 and therefore arrive as strings.
 */
export interface GbpInsightsValueWire {
  value?: string;
  threshold?: string;
}

export interface GbpSearchKeywordCountWire {
  searchKeyword?: string;
  insightsValue?: GbpInsightsValueWire;
}

export interface GbpSearchKeywordsResponse {
  searchKeywordsCounts?: GbpSearchKeywordCountWire[];
  nextPageToken?: string;
}

/**
 * THE most dangerous field in the API for Shoogle.
 *
 * For a neighbourhood salon most keywords come back as a lower bound, not a
 * number. Rendering a threshold as a value fabricates data; rendering it as 0
 * breaks "unknown is not zero" twice over. It renders as "<15".
 */
/**
 * Alias of the single union owned by `features/seo/keywords.ts`.
 *
 * This was previously a second, structurally-different declaration whose
 * formatter rendered 1240 where seo's rendered 1,240 — the same number shown
 * two ways depending on which module a screen happened to import. One union,
 * one formatter.
 */
export type GbpKeywordImpressions = KeywordImpressions;

export interface GbpKeywordRow {
  /** Google lowercases these. */
  keyword: string;
  impressions: GbpKeywordImpressions;
}

/**
 * A keyword list plus what it cost to build.
 *
 * `skipped` counts rows Google returned that carried no usable keyword, or an
 * `insightsValue` with neither a value nor a threshold. Those rows are real
 * keywords we cannot describe honestly, so they are not in `rows` — and a list
 * that is missing them is NOT a complete list. Anything rendering `rows` must
 * say so when `skipped > 0`; a shorter list presented as the whole truth is the
 * silent truncation this codebase forbids.
 */
export interface GbpKeywordReport {
  rows: GbpKeywordRow[];
  skipped: number;
}

/**
 * Re-exported from `features/seo`, which owns the one formatter. Do not
 * declare another: it groups thousands and handles the below-threshold case,
 * and a second implementation will drift from it.
 */
export { formatKeywordImpressions } from '@/features/seo';

/* -------------------------------------------------------------------------- */
/* Capabilities Google does not offer at all                                  */
/* -------------------------------------------------------------------------- */

/**
 * Not "not built yet" — not possible. Each maps to
 * `unavailable('not_supported', …)` permanently.
 */
export const UNSUPPORTED_GBP_CAPABILITIES = Object.freeze({
  search_rank_position:
    'Google does not publish where a business ranks in local search. No Google API returns a rank position, so Shoogle will not invent one.',
  competitor_data: 'Google does not share competitor data through any Business Profile API.',
  question_and_answer:
    'Google discontinued the Business Profile Q&A API in November 2025. Questions cannot be read or answered from here.',
  delete_review: 'Google does not allow a business to delete or flag a review through the API.',
  create_product_post: 'Google does not allow Product posts to be created through the API.',
});

export type UnsupportedGbpCapability = keyof typeof UNSUPPORTED_GBP_CAPABILITIES;
