/**
 * Google Business Profile — wire → domain mapping. Owner: Pranay.
 *
 * Pure functions. Every one of them is allowed to REFUSE: a record Google sent
 * that we cannot represent honestly is reported as skipped, with a reason, so
 * the caller can say "3 reviews could not be shown" instead of quietly
 * returning a shorter list.
 */

import type { GbpLocation, GbpReview } from '@/lib/providers/contracts';
import type { Post, PostStatus } from '@/types/domain';

import type {
  GbpGoogleUpdatedDiff,
  GbpGoogleUpdatedLocationWire,
  GbpLocalPostWire,
  GbpLocationWire,
  GbpReplyModeration,
  GbpReviewDetail,
  GbpReviewReplyWire,
  GbpReviewWire,
  GooglePostalAddress,
} from './types';
import { REVIEW_REPLY_STATE_MEANINGS, STAR_RATING_TO_NUMBER } from './types';

/* -------------------------------------------------------------------------- */
/* Resource names                                                             */
/* -------------------------------------------------------------------------- */

/** `locations/12345` → `12345`. Returns null for anything else. */
export function locationIdFromName(name: string | undefined): string | null {
  if (typeof name !== 'string') return null;
  const match = /(?:^|\/)locations\/([^/]+)$/.exec(name);
  return match?.[1] ?? null;
}

/** `accounts/1/locations/2/reviews/abc` → `abc`. */
export function reviewIdFromName(name: string | undefined): string | null {
  if (typeof name !== 'string') return null;
  const match = /\/reviews\/([^/]+)$/.exec(name);
  return match?.[1] ?? null;
}

export function accountIdFromName(name: string | undefined): string | null {
  if (typeof name !== 'string') return null;
  const match = /^accounts\/([^/]+)$/.exec(name);
  return match?.[1] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Locations                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One display line. Returns null when Google has no storefront address, which
 * is a real and common state — service-area businesses (mobile salons, repair
 * shops that come to you) deliberately have none. Null must render as "no
 * street address", never as an empty string sitting where an address should be.
 */
export function formatStorefrontAddress(address: GooglePostalAddress | undefined): string | null {
  if (address === undefined) return null;
  const parts = [
    ...(address.addressLines ?? []),
    address.locality,
    address.administrativeArea,
    address.postalCode,
  ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
  return parts.length > 0 ? parts.join(', ') : null;
}

export type LocationMapResult =
  | { ok: true; location: GbpLocation }
  | { ok: false; reason: string };

export function toGbpLocation(
  wire: GbpLocationWire,
  verificationState: GbpLocation['verificationState'],
): LocationMapResult {
  const locationId = locationIdFromName(wire.name);
  if (locationId === null) {
    return { ok: false, reason: 'Google returned a listing with no usable id.' };
  }
  const title = wire.title;
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, reason: 'Google returned a listing with no business name.' };
  }

  return {
    ok: true,
    location: {
      locationId,
      title,
      storefrontAddress: formatStorefrontAddress(wire.storefrontAddress),
      primaryCategory: wire.categories?.primaryCategory?.displayName ?? null,
      verificationState,
    },
  };
}

/**
 * Verification state inferable from a LIST response alone.
 *
 * `metadata.hasVoiceOfMerchant === true` genuinely means the listing is live.
 * `false` does NOT tell us which of the four remedial states applies, so it
 * stays `'unknown'` until `getVoiceOfMerchantState` is called for that one
 * location. Guessing `'unverified'` from a false flag would put the wrong
 * instruction in front of an owner whose real problem is an ownership conflict.
 */
export function verificationStateFromMetadata(
  wire: GbpLocationWire,
): GbpLocation['verificationState'] {
  return wire.metadata?.hasVoiceOfMerchant === true ? 'verified' : 'unknown';
}

/**
 * What Google changed behind the owner's back.
 *
 * An empty `changedFields` is a real, useful finding ("Google has not touched
 * your listing"), which is why this returns a diff rather than null.
 */
export function toGoogleUpdatedDiff(wire: GbpGoogleUpdatedLocationWire): GbpGoogleUpdatedDiff {
  const split = (mask: string | undefined): string[] =>
    typeof mask === 'string' && mask.trim().length > 0
      ? mask
          .split(',')
          .map((field) => field.trim())
          .filter((field) => field.length > 0)
      : [];

  return {
    changedFields: split(wire.diffMask),
    pendingFields: split(wire.pendingMask),
    googleVersion: wire.location ?? {},
  };
}

/** Owner-facing English for a diff mask field path. */
export const GOOGLE_UPDATED_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  regularHours: 'your opening hours',
  specialHours: 'your holiday hours',
  phoneNumbers: 'your phone number',
  websiteUri: 'your website link',
  storefrontAddress: 'your address',
  categories: 'your business category',
  title: 'your business name',
  profile: 'your business description',
  openInfo: 'whether you are open',
  serviceArea: 'the areas you serve',
});

export function describeGoogleUpdatedField(fieldPath: string): string {
  const head = fieldPath.split('.')[0] ?? fieldPath;
  return GOOGLE_UPDATED_FIELD_LABELS[head] ?? head;
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What we are prepared to claim about a submitted reply.
 *
 * Google MODERATES review replies. HTTP 200 from `updateReply` means
 * "accepted for review", not "published". Because the `ReviewReplyState` enum
 * members are unverified (see `types.ts`), `REVIEW_REPLY_STATE_MEANINGS` is
 * empty and every reported state currently normalises to
 * `state_not_understood`. That is the honest floor: we know a reply exists, we
 * do not claim it is live on Google.
 */
export function classifyReply(reply: GbpReviewReplyWire | undefined): GbpReplyModeration {
  if (reply === undefined) return { kind: 'no_reply' };

  const submittedAt = typeof reply.updateTime === 'string' ? reply.updateTime : null;

  if (reply.policyViolation !== undefined) {
    return {
      kind: 'rejected',
      reason: reply.policyViolation.description ?? null,
      helpUri: reply.policyViolation.helpUri ?? null,
    };
  }

  if (typeof reply.state === 'string' && reply.state.length > 0) {
    const meaning = REVIEW_REPLY_STATE_MEANINGS[reply.state];
    if (meaning === 'published') {
      return { kind: 'published', updateTime: submittedAt ?? '' };
    }
    if (meaning === 'pending_moderation') return { kind: 'pending_moderation', submittedAt };
    if (meaning === 'rejected') return { kind: 'rejected', reason: null, helpUri: null };
    return { kind: 'state_not_understood', raw: reply.state, submittedAt };
  }

  return { kind: 'state_not_reported', submittedAt };
}

/** Owner-facing English for a reply's moderation state. Never says "Published" on a guess. */
export function describeReplyModeration(moderation: GbpReplyModeration): string {
  switch (moderation.kind) {
    case 'no_reply':
      return 'No reply yet';
    case 'published':
      return 'Reply is live on Google';
    case 'pending_moderation':
      return 'Reply submitted — Google is reviewing it';
    case 'rejected':
      return moderation.reason === null
        ? 'Google rejected this reply'
        : `Google rejected this reply: ${moderation.reason}`;
    case 'state_not_understood':
    case 'state_not_reported':
      return 'Reply submitted — Google has not confirmed whether it is live';
  }
}

export type ReviewMapResult =
  | { ok: true; review: GbpReviewDetail }
  | { ok: false; reviewId: string | null; reason: string };

export function toReviewDetail(wire: GbpReviewWire): ReviewMapResult {
  const reviewId =
    typeof wire.reviewId === 'string' && wire.reviewId.length > 0
      ? wire.reviewId
      : reviewIdFromName(wire.name);
  if (reviewId === null || reviewId.length === 0) {
    return { ok: false, reviewId: null, reason: 'Google returned a review with no id.' };
  }
  const createTime = wire.createTime;
  if (typeof createTime !== 'string' || createTime.length === 0) {
    return { ok: false, reviewId, reason: 'Google returned a review with no date.' };
  }

  const rating =
    typeof wire.starRating === 'string' ? (STAR_RATING_TO_NUMBER[wire.starRating] ?? null) : null;

  return {
    ok: true,
    review: {
      reviewId,
      // Google omits the name for anonymous reviewers; that is a fact about the
      // review, not a missing value to paper over.
      authorDisplayName:
        typeof wire.reviewer?.displayName === 'string' && wire.reviewer.displayName.length > 0
          ? wire.reviewer.displayName
          : 'Someone on Google',
      isAnonymous:
        wire.reviewer?.isAnonymous === true || typeof wire.reviewer?.displayName !== 'string',
      starRating: rating ?? null,
      comment:
        typeof wire.comment === 'string' && wire.comment.length > 0 ? wire.comment : null,
      createTime,
      updateTime: typeof wire.updateTime === 'string' ? wire.updateTime : null,
      replyComment:
        typeof wire.reviewReply?.comment === 'string' && wire.reviewReply.comment.length > 0
          ? wire.reviewReply.comment
          : null,
      replyModeration: classifyReply(wire.reviewReply),
    },
  };
}

/**
 * Lossy projection onto the shared `GbpReview` contract.
 *
 * Two things do not survive and both are recorded as blockers:
 *   - `starRating` is `1|2|3|4|5`, so a rating-only review Google marked
 *     `STAR_RATING_UNSPECIFIED` cannot be represented and is dropped.
 *   - `reply` is `{comment, updateTime} | null`, so moderation state is lost.
 *     We still populate it whenever a reply exists, because "a reply exists" is
 *     true whether or not Google has published it — reporting null there would
 *     invite the owner to reply twice. The moderation state stays available on
 *     `GbpReviewDetail`.
 */
export function toContractReview(detail: GbpReviewDetail): GbpReview | null {
  if (detail.starRating === null) return null;
  return {
    reviewId: detail.reviewId,
    authorDisplayName: detail.authorDisplayName,
    starRating: detail.starRating,
    comment: detail.comment,
    createTime: detail.createTime,
    reply:
      detail.replyComment === null
        ? null
        : {
            comment: detail.replyComment,
            updateTime:
              detail.replyModeration.kind === 'published'
                ? detail.replyModeration.updateTime
                : (detail.updateTime ?? detail.createTime),
          },
  };
}

/* -------------------------------------------------------------------------- */
/* Local posts                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Map a Google post onto Shoogle's `Post`.
 *
 * Status comes from what Google REPORTED, never from the fact that our request
 * succeeded. `LOCAL_POST_STATE_UNSPECIFIED` and an absent state both mean
 * Google took the post and has not said what became of it — which is
 * `publishing` (in flight), or `scheduled` when a future `scheduledTime` is
 * set. Neither is `published`. Only `LIVE` is `published`.
 */
export function toPost(wire: GbpLocalPostWire, nowIso: string): Post {
  const id = typeof wire.name === 'string' ? wire.name : '';
  const scheduledFor = typeof wire.scheduledTime === 'string' ? wire.scheduledTime : null;
  const isFuture = scheduledFor !== null && scheduledFor > nowIso;

  let status: PostStatus;
  switch (wire.state) {
    case 'LIVE':
      status = 'published';
      break;
    case 'REJECTED':
      status = 'failed';
      break;
    case 'PROCESSING':
      status = isFuture ? 'scheduled' : 'publishing';
      break;
    default:
      status = isFuture ? 'scheduled' : 'publishing';
      break;
  }

  return {
    id,
    status,
    body: typeof wire.summary === 'string' ? wire.summary : '',
    scheduledFor,
    targets: [
      {
        provider: 'google_business',
        status,
        // A permalink only exists once the post is genuinely live.
        url: status === 'published' && typeof wire.searchUrl === 'string' ? wire.searchUrl : null,
      },
    ],
  };
}
