/**
 * Voice of Merchant — the state that actually governs a Google Business
 * Profile. Owner: Pranay.
 *
 * WHY THIS IS FIRST-CLASS AND NOT AN ERROR PATH
 * ---------------------------------------------
 * Google documents `reviews.list` as "only valid if the specified location is
 * verified", and edits only propagate to Maps once `hasVoiceOfMerchant` is
 * true. For a small Indian salon, gym or repair shop, "not in Voice of
 * Merchant" is not the unhappy edge — it is the LIKELIEST state we will meet.
 * A profile can be unverified, awaiting Google's own processing, claimed by a
 * previous owner or an agency, or suspended. Each needs a different sentence
 * and a different next step. Collapsing all four into "couldn't load" would
 * leave the owner with a broken app and no idea why.
 *
 * So: call `getVoiceOfMerchantState` FIRST, classify it here, and drive the
 * whole GBP surface off the result.
 */

import { unavailable, type UnavailableState } from '@/lib/state/DataState';

import type { GbpComplyReason, GbpVoiceOfMerchantStateWire } from './types';

/* -------------------------------------------------------------------------- */
/* The five outcomes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Google documents four recommended actions plus the healthy state. The fifth
 * member here, `indeterminate`, is ours: it is what we say when Google returns
 * neither Voice of Merchant nor any action. We do not assume healthy.
 */
export type VoiceOfMerchantOutcome =
  | { kind: 'has_voice_of_merchant'; hasBusinessAuthority: boolean }
  /** The owner must verify the listing. */
  | { kind: 'verify'; hasPendingVerification: boolean | null }
  /** Google is still processing. Nothing for the owner to do. */
  | { kind: 'wait_for_voice_of_merchant' }
  /** Someone else holds this listing. */
  | { kind: 'resolve_ownership_conflict' }
  /** Suspended or disabled. */
  | { kind: 'comply_with_guidelines'; reason: GbpComplyReason }
  /** Google told us nothing usable. Never treated as healthy. */
  | { kind: 'indeterminate' };

export type VoiceOfMerchantKind = VoiceOfMerchantOutcome['kind'];

/**
 * Normalise the wire response.
 *
 * Order matters. `hasVoiceOfMerchant` wins, because when it is true Google sets
 * no action. Otherwise exactly one action field is present; if more than one
 * somehow is, the most blocking is reported.
 */
export function classifyVoiceOfMerchant(
  state: GbpVoiceOfMerchantStateWire,
): VoiceOfMerchantOutcome {
  if (state.hasVoiceOfMerchant === true) {
    return {
      kind: 'has_voice_of_merchant',
      hasBusinessAuthority: state.hasBusinessAuthority === true,
    };
  }

  if (state.complyWithGuidelines !== undefined) {
    return {
      kind: 'comply_with_guidelines',
      reason: state.complyWithGuidelines.recommendationReason ?? 'RECOMMENDATION_REASON_UNSPECIFIED',
    };
  }

  if (state.resolveOwnershipConflict !== undefined) {
    return { kind: 'resolve_ownership_conflict' };
  }

  if (state.verify !== undefined) {
    return {
      kind: 'verify',
      // Absent means Google did not say. It does NOT mean "no pending
      // verification" — the owner may have a postcard in the post.
      hasPendingVerification: state.verify.hasPendingVerification ?? null,
    };
  }

  if (state.waitForVoiceOfMerchant !== undefined) {
    return { kind: 'wait_for_voice_of_merchant' };
  }

  return { kind: 'indeterminate' };
}

/* -------------------------------------------------------------------------- */
/* What each outcome means to an owner                                        */
/* -------------------------------------------------------------------------- */

export interface VoiceOfMerchantExplanation {
  /** Short heading. English UI, per product rule 12. */
  title: string;
  /** Plain English, no Google jargon, no blame. */
  body: string;
  /**
   * The one thing the owner can do, or null when there is genuinely nothing —
   * "wait" is not an action and must not be rendered as a button (rule 7).
   */
  ownerAction: string | null;
  /**
   * Reviews are DOCUMENTED as gated on verification. False here means listing
   * reviews will fail, so do not call it and do not render "0 reviews".
   */
  reviewsReadable: boolean;
  /**
   * Google does not document a per-method verification gate for
   * `localPosts.create` or `media.create`, but does say edits only reach Maps
   * once Voice of Merchant is held. So we WARN rather than block: attempting a
   * post is allowed, promising it will appear is not.
   */
  writesMayNotReachGoogle: boolean;
}

const COMPLY_BODY: Readonly<Record<GbpComplyReason, string>> = Object.freeze({
  BUSINESS_LOCATION_SUSPENDED:
    'Google has suspended this Business Profile. Until it is reinstated the listing is hidden and Shoogle cannot read or change anything on it.',
  BUSINESS_LOCATION_DISABLED:
    'Google has disabled this Business Profile. The listing is not live, and Shoogle cannot read or change anything on it.',
  RECOMMENDATION_REASON_UNSPECIFIED:
    'Google says this Business Profile needs to be brought in line with its guidelines, but did not say why. Google Business Profile support can tell you the specific reason.',
});

export function describeVoiceOfMerchant(
  outcome: VoiceOfMerchantOutcome,
): VoiceOfMerchantExplanation {
  switch (outcome.kind) {
    case 'has_voice_of_merchant':
      return {
        title: 'Profile is live on Google',
        body: outcome.hasBusinessAuthority
          ? 'Google recognises you as the owner of this listing, and your changes go live on Search and Maps.'
          : 'This listing is live on Google. You can manage it, though Google has not given this account full owner authority over it.',
        ownerAction: null,
        reviewsReadable: true,
        writesMayNotReachGoogle: false,
      };

    case 'verify':
      return {
        title: 'Not verified with Google yet',
        body:
          outcome.hasPendingVerification === true
            ? 'Google has a verification in progress for this listing. Until it finishes, reviews and posts stay hidden from Shoogle.'
            : 'Google has not verified that this business is yours. Until it does, reviews and posts stay hidden, and anything Shoogle changes will not appear on Search or Maps.',
        ownerAction: 'Verify this business with Google',
        reviewsReadable: false,
        writesMayNotReachGoogle: true,
      };

    case 'wait_for_voice_of_merchant':
      return {
        title: 'Google is still processing this profile',
        body: 'Google has the listing but has not finished setting it up. This is on Google’s side — there is nothing to fix and nothing to submit.',
        ownerAction: null,
        reviewsReadable: false,
        writesMayNotReachGoogle: true,
      };

    case 'resolve_ownership_conflict':
      return {
        title: 'Someone else manages this listing',
        body: 'Another Google account already claims this business — often a previous owner, a franchise head office or an old agency. Google needs that settled before this account can manage it.',
        ownerAction: 'Request ownership from Google',
        reviewsReadable: false,
        writesMayNotReachGoogle: true,
      };

    case 'comply_with_guidelines':
      return {
        title: 'Google has restricted this profile',
        body: COMPLY_BODY[outcome.reason],
        ownerAction: 'Appeal with Google Business Profile support',
        reviewsReadable: false,
        writesMayNotReachGoogle: true,
      };

    case 'indeterminate':
      return {
        title: 'Google did not report this profile’s status',
        body: 'Google answered without saying whether this listing is live or what to do about it. Shoogle will not guess, so nothing that depends on the listing is shown.',
        ownerAction: null,
        reviewsReadable: false,
        writesMayNotReachGoogle: true,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Mapping to DataState                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The gate every GBP read passes through.
 *
 * Returns `null` when the profile holds Voice of Merchant and the call may
 * proceed, or the exact `UnavailableState` to return otherwise.
 *
 * `wait_for_voice_of_merchant` maps to `no_data_yet` because that is literally
 * true — Google has the profile and has not produced anything for it yet. The
 * other three map to `not_supported`, which is the closest reason
 * `lib/state/DataState.ts` offers today. See `BLOCKERS` in this feature's
 * README: `not_supported` reads as "Google never offers this", when the truth
 * is "Google will not offer this until the profile is sorted out". The message
 * carries the real meaning; the reason code is a lossy approximation we do not
 * own the type for.
 */
export function voiceOfMerchantGate(outcome: VoiceOfMerchantOutcome): UnavailableState | null {
  if (outcome.kind === 'has_voice_of_merchant') return null;

  const explanation = describeVoiceOfMerchant(outcome);
  const message =
    explanation.ownerAction === null
      ? explanation.body
      : `${explanation.body} ${explanation.ownerAction}.`;

  switch (outcome.kind) {
    case 'wait_for_voice_of_merchant':
      return unavailable('no_data_yet', message);
    case 'indeterminate':
      return unavailable('insufficient_data', message);
    case 'verify':
    case 'resolve_ownership_conflict':
    case 'comply_with_guidelines':
      return unavailable('not_supported', message);
  }
}

/**
 * Projection onto the shared `GbpLocation.verificationState` field, which only
 * has four values and cannot express ownership conflicts or suspensions.
 *
 * Everything that is not clearly verified, clearly pending or clearly
 * unverified becomes `'unknown'` — never `'verified'`. The full outcome stays
 * available on this feature's own richer location type.
 */
export function toContractVerificationState(
  outcome: VoiceOfMerchantOutcome,
): 'verified' | 'unverified' | 'pending' | 'unknown' {
  switch (outcome.kind) {
    case 'has_voice_of_merchant':
      return 'verified';
    case 'verify':
      return outcome.hasPendingVerification === true ? 'pending' : 'unverified';
    case 'wait_for_voice_of_merchant':
      return 'pending';
    case 'resolve_ownership_conflict':
    case 'comply_with_guidelines':
    case 'indeterminate':
      return 'unknown';
  }
}
