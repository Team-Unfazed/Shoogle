/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA. Google Business Profile reviews.
 *
 * Read fixtures/README.md before using anything here. Access is gated by
 * `isFixtureModeEnabled()` (requires `__DEV__` AND
 * `EXPO_PUBLIC_ENABLE_FIXTURES=1`), so a release build cannot reach any of it,
 * and every visible string carries `[FIXTURE]`.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `fixtures/gbp.ts`
 * -----------------------------------------------------
 * `fixtures/gbp.ts` holds one reviews WIRE response, which is the right shape
 * for testing the mapper. The reviews SCREENS need something different: the
 * seven states an owner can actually land in, each as a finished
 * `DataState<GbpReviewPage>`, so that every one of them can be walked and
 * reviewed before a single credential exists.
 *
 * EVERYTHING THAT CAN COME FROM THE REAL PIPELINE, DOES
 * ----------------------------------------------------
 * The loaded page is produced by running invented WIRE data through the real
 * `toReviewDetail` mapper — not by hand-writing domain objects. So the screen
 * renders exactly what a live response would produce, including the reviews the
 * mapper REFUSES (they land in `skipped`, and the screen has to say so).
 *
 * The verification and rate-limited states likewise come from the real
 * `classifyVoiceOfMerchant` → `voiceOfMerchantGate` and `gbpFailureState`
 * functions, given invented inputs. No screen state is a hand-written string.
 *
 * THE ONE EXCEPTION, AND WHY IT IS HONEST
 * ---------------------------------------
 * `REVIEW_REPLY_STATE_MEANINGS` in `features/gbp/types.ts` is deliberately
 * EMPTY — nobody has read the first-party `ReviewReplyState` reference yet — so
 * `classifyReply` currently cannot produce `published` or `pending_moderation`
 * from wire data at all. Every wire reply normalises to "submitted, state not
 * understood".
 *
 * That is correct behaviour and it stays. But it would leave the `published`
 * and `pending_moderation` presentations unbuilt and untested, and those are
 * exactly the two an owner must never see confused. So the two reviews carrying
 * them (`fixtureModeratedReviews`) are constructed as DOMAIN values directly,
 * and are labelled below as such. They are a UI fixture for a state the wire
 * path will reach the day someone fills in that table — not a claim that Google
 * reported them.
 */

import {
  classifyVoiceOfMerchant,
  gbpFailureState,
  type GbpTransportOutcome,
  type VoiceOfMerchantOutcome,
  voiceOfMerchantGate,
} from '@/features/gbp';
import { toReviewDetail } from '@/features/gbp/mappers';
import type {
  GbpReviewDetail,
  GbpReviewPage,
  GbpReviewWire,
  GbpVoiceOfMerchantStateWire,
} from '@/features/gbp/types';
import { isFixtureModeEnabled } from '@/lib/env';
import { ready, type DataState } from '@/lib/state/DataState';

/** Fixed timestamps so snapshots are stable and nothing looks "live". */
const FIXTURE_TIMESTAMP = '2020-01-01T00:00:00.000Z';
const FIXTURE_REPLY_TIMESTAMP = '2020-01-03T00:00:00.000Z';

/** The location these fixture reviews belong to, matching `fixtures/gbp.ts`. */
export const FIXTURE_REVIEWS_LOCATION_ID = 'fixture-0001';

const FIXTURE_PARENT = `accounts/fixture/locations/${FIXTURE_REVIEWS_LOCATION_ID}`;

/* -------------------------------------------------------------------------- */
/* Wire reviews — run through the real mapper                                 */
/* -------------------------------------------------------------------------- */

/**
 * Six invented reviews covering what a real page throws at the UI:
 *
 * 1. five stars, written, no reply at all
 * 2. two stars, written, a reply Google reported a state for that we have NOT
 *    verified the meaning of — must render "submitted", never "published"
 * 3. four stars, anonymous reviewer, a reply Google REJECTED with a policy
 *    violation
 * 4. three stars, RATING ONLY — Google returns no comment. That is a fact about
 *    the review, not a missing value
 * 5. `STAR_RATING_UNSPECIFIED` — a real Google value with no number behind it.
 *    It must not become 0 and must not be silently dropped
 * 6. a review with NO id — the mapper refuses it, and it lands in `skipped`, so
 *    the screen has to admit the list is short
 */
export const fixtureReviewWires: GbpReviewWire[] = [
  {
    name: `${FIXTURE_PARENT}/reviews/fixture-review-0001`,
    reviewId: 'fixture-review-0001',
    reviewer: { displayName: '[FIXTURE] Example Reviewer' },
    starRating: 'FIVE',
    comment: '[FIXTURE] Example review text. Not written by a real customer.',
    createTime: FIXTURE_TIMESTAMP,
    updateTime: FIXTURE_TIMESTAMP,
  },
  {
    name: `${FIXTURE_PARENT}/reviews/fixture-review-0002`,
    reviewId: 'fixture-review-0002',
    reviewer: { displayName: '[FIXTURE] Second Example Reviewer' },
    starRating: 'TWO',
    comment: '[FIXTURE] Example critical review text. The reply below is with Google.',
    createTime: FIXTURE_TIMESTAMP,
    updateTime: FIXTURE_TIMESTAMP,
    reviewReply: {
      comment: '[FIXTURE] Example reply awaiting Google moderation.',
      updateTime: FIXTURE_REPLY_TIMESTAMP,
      state: 'FIXTURE_UNVERIFIED_STATE',
    },
  },
  {
    name: `${FIXTURE_PARENT}/reviews/fixture-review-0003`,
    reviewId: 'fixture-review-0003',
    reviewer: { isAnonymous: true },
    starRating: 'FOUR',
    comment: '[FIXTURE] Example review from an anonymous reviewer.',
    createTime: FIXTURE_TIMESTAMP,
    reviewReply: {
      comment: '[FIXTURE] Example reply that Google rejected.',
      updateTime: FIXTURE_REPLY_TIMESTAMP,
      policyViolation: {
        violationType: 'FIXTURE_POLICY',
        description: '[FIXTURE] Example policy reason.',
        helpUri: 'https://example.invalid/fixture-policy',
      },
    },
  },
  {
    name: `${FIXTURE_PARENT}/reviews/fixture-review-0004`,
    reviewId: 'fixture-review-0004',
    reviewer: { displayName: '[FIXTURE] Rating Only Reviewer' },
    starRating: 'THREE',
    createTime: FIXTURE_TIMESTAMP,
  },
  {
    name: `${FIXTURE_PARENT}/reviews/fixture-review-0005`,
    reviewId: 'fixture-review-0005',
    reviewer: { displayName: '[FIXTURE] Unrated Reviewer' },
    starRating: 'STAR_RATING_UNSPECIFIED',
    comment: '[FIXTURE] Example review Google returned without a star rating.',
    createTime: FIXTURE_TIMESTAMP,
  },
  {
    // No `reviewId` and no parseable name — `toReviewDetail` refuses it.
    reviewer: { displayName: '[FIXTURE] Unmappable Reviewer' },
    starRating: 'ONE',
    comment: '[FIXTURE] Example review Google returned without an id.',
    createTime: FIXTURE_TIMESTAMP,
  },
];

/**
 * Two reply states the WIRE path cannot currently produce, built as domain
 * values on purpose. See the header of this file.
 *
 * `pending_moderation` and `published` are the two an owner must never see
 * confused with each other, so both presentations are built and tested now.
 */
export const fixtureModeratedReviews: GbpReviewDetail[] = [
  {
    reviewId: 'fixture-review-0006',
    authorDisplayName: '[FIXTURE] Pending Moderation Reviewer',
    isAnonymous: false,
    starRating: 1,
    comment: '[FIXTURE] Example review whose reply Google says it is still checking.',
    createTime: FIXTURE_TIMESTAMP,
    updateTime: FIXTURE_TIMESTAMP,
    replyComment: '[FIXTURE] Example reply Google has confirmed is in moderation.',
    replyModeration: { kind: 'pending_moderation', submittedAt: FIXTURE_REPLY_TIMESTAMP },
  },
  {
    reviewId: 'fixture-review-0007',
    authorDisplayName: '[FIXTURE] Published Reply Reviewer',
    isAnonymous: false,
    starRating: 5,
    comment: '[FIXTURE] Example review whose reply Google confirmed is live.',
    createTime: FIXTURE_TIMESTAMP,
    updateTime: FIXTURE_TIMESTAMP,
    replyComment: '[FIXTURE] Example reply Google confirmed is published.',
    replyModeration: { kind: 'published', updateTime: FIXTURE_REPLY_TIMESTAMP },
  },
];

function mapWires(wires: GbpReviewWire[]): Pick<GbpReviewPage, 'reviews' | 'skipped'> {
  const reviews: GbpReviewDetail[] = [];
  const skipped: GbpReviewPage['skipped'] = [];
  for (const wire of wires) {
    const mapped = toReviewDetail(wire);
    if (mapped.ok) reviews.push(mapped.review);
    else skipped.push({ reviewId: mapped.reviewId, reason: mapped.reason });
  }
  return { reviews, skipped };
}

/**
 * The loaded page.
 *
 * `averageRating` and `totalReviewCount` are values Google itself computes and
 * the research doc marks safe to render as-is. `totalReviewCount` is 8 while
 * seven reviews are mapped and one was refused — deliberately, so the screen
 * has to admit that what it shows is not everything.
 */
export function buildFixtureReviewPage(): GbpReviewPage {
  const mapped = mapWires(fixtureReviewWires);
  return {
    reviews: [...mapped.reviews, ...fixtureModeratedReviews],
    skipped: mapped.skipped,
    nextPageToken: null,
    averageRating: 3.4,
    totalReviewCount: 8,
  };
}

/**
 * A verified listing with genuinely NO reviews.
 *
 * Every count here is a MEASURED ZERO, which is a different fact from unknown
 * and must render as `0`, not as `—`. This fixture exists so that difference is
 * visible side by side with the not-connected state.
 */
export function buildFixtureEmptyReviewPage(): GbpReviewPage {
  return {
    reviews: [],
    skipped: [],
    nextPageToken: null,
    averageRating: null,
    totalReviewCount: 0,
  };
}

/**
 * A page where Google answered but told us nothing summary-level.
 *
 * `averageRating` and `totalReviewCount` are both absent. Neither may become 0
 * and neither may be recomputed from the loaded reviews and presented as
 * Google's own figure.
 */
export function buildFixtureUnsummarisedReviewPage(): GbpReviewPage {
  const mapped = mapWires(fixtureReviewWires.slice(0, 2));
  return {
    reviews: mapped.reviews,
    skipped: mapped.skipped,
    nextPageToken: 'fixture-next-page',
    averageRating: null,
    totalReviewCount: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Scenarios                                                                  */
/* -------------------------------------------------------------------------- */

export type ReviewsScenarioId =
  | 'loaded'
  | 'no_reviews'
  | 'no_summary'
  | 'verify'
  | 'wait'
  | 'ownership_conflict'
  | 'suspended'
  | 'rate_limited';

export interface ReviewsScenario {
  id: ReviewsScenarioId;
  /** Short chip label for the development switcher. */
  label: string;
  /** What this scenario is demonstrating, shown under the switcher. */
  note: string;
  state: DataState<GbpReviewPage>;
  /**
   * What Google said about the profile's standing, when we asked.
   *
   * Null means we did not ask — which is the truth for the rate-limited
   * scenario, where the failure happened before any verification answer was
   * useful. It is never a stand-in for "healthy".
   */
  verification: VoiceOfMerchantOutcome | null;
}

const VOICE_OF_MERCHANT_INPUTS: Readonly<
  Record<'verify' | 'wait' | 'ownership_conflict' | 'suspended', GbpVoiceOfMerchantStateWire>
> = Object.freeze({
  verify: { hasVoiceOfMerchant: false, hasBusinessAuthority: false, verify: {} },
  wait: { hasVoiceOfMerchant: false, hasBusinessAuthority: true, waitForVoiceOfMerchant: {} },
  ownership_conflict: {
    hasVoiceOfMerchant: false,
    hasBusinessAuthority: false,
    resolveOwnershipConflict: {},
  },
  suspended: {
    hasVoiceOfMerchant: false,
    hasBusinessAuthority: false,
    complyWithGuidelines: { recommendationReason: 'BUSINESS_LOCATION_SUSPENDED' },
  },
});

/** Google's real 429 shape, as `errors.ts` classifies it. */
const RATE_LIMITED_OUTCOME: GbpTransportOutcome = {
  outcome: 'http',
  status: 429,
  body: {
    error: {
      code: 429,
      message: 'Quota exceeded for quota metric requests.',
      status: 'RESOURCE_EXHAUSTED',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
          reason: 'RATE_LIMIT_EXCEEDED',
        },
      ],
    },
  },
};

function verificationScenario(
  id: 'verify' | 'wait' | 'ownership_conflict' | 'suspended',
  label: string,
  note: string,
): ReviewsScenario {
  const outcome = classifyVoiceOfMerchant(VOICE_OF_MERCHANT_INPUTS[id]);
  const gate = voiceOfMerchantGate(outcome);
  return {
    id,
    label,
    note,
    // `voiceOfMerchantGate` returns null only for a healthy profile, which none
    // of these are; the fallback keeps the types honest without an assertion.
    state:
      gate ??
      ready(buildFixtureReviewPage(), FIXTURE_TIMESTAMP, true),
    verification: outcome,
  };
}

/** The healthy outcome, produced by the real classifier rather than written out. */
const HEALTHY: VoiceOfMerchantOutcome = classifyVoiceOfMerchant({
  hasVoiceOfMerchant: true,
  hasBusinessAuthority: true,
});

export function buildReviewsScenarios(): ReviewsScenario[] {
  return [
    {
      id: 'loaded',
      label: 'Loaded',
      note: 'Seven reviews Shoogle could read, one it refused, and every reply state side by side.',
      state: ready(buildFixtureReviewPage(), FIXTURE_TIMESTAMP, true),
      verification: HEALTHY,
    },
    {
      id: 'no_reviews',
      label: 'No reviews yet',
      note: 'A verified listing with a MEASURED zero. Every count is 0, not a dash.',
      state: ready(buildFixtureEmptyReviewPage(), FIXTURE_TIMESTAMP, true),
      verification: HEALTHY,
    },
    {
      id: 'no_summary',
      label: 'No summary',
      note: 'Google sent reviews but no average and no total. Both stay unknown.',
      state: ready(buildFixtureUnsummarisedReviewPage(), FIXTURE_TIMESTAMP, true),
      verification: HEALTHY,
    },
    verificationScenario(
      'verify',
      'Not verified',
      'The likeliest real state for a small Indian business. Google blocks reading reviews at all.',
    ),
    verificationScenario(
      'wait',
      'Google processing',
      'Nothing for the owner to do, so nothing is offered to press.',
    ),
    verificationScenario(
      'ownership_conflict',
      'Someone else owns it',
      'A previous owner or an old agency still holds the listing.',
    ),
    verificationScenario(
      'suspended',
      'Suspended',
      'Google has restricted the profile. Reviews cannot be read.',
    ),
    {
      id: 'rate_limited',
      label: 'Rate limited',
      note: 'Google is throttling us. Temporary, and said so — not an empty list.',
      state: gbpFailureState(RATE_LIMITED_OUTCOME, { operation: 'reviews.list' }),
      verification: null,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Gated access                                                               */
/* -------------------------------------------------------------------------- */

export interface GbpReviewFixtures {
  locationId: string;
  scenarios: ReviewsScenario[];
  /** The page a reply composer reads a single review out of. */
  page: GbpReviewPage;
}

/**
 * The ONLY sanctioned way to read these fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()`, so the honest "nothing here"
 * path is always exercised too.
 */
export function getGbpReviewFixtures(): GbpReviewFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    locationId: FIXTURE_REVIEWS_LOCATION_ID,
    scenarios: buildReviewsScenarios(),
    page: buildFixtureReviewPage(),
  };
}
