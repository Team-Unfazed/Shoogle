/**
 * Publication summary — DERIVED, never stored. Owner: Yash.
 *
 * ================= WHY A PARTIAL POST IS THE DANGEROUS CASE =================
 *
 * A post aimed at Instagram, Facebook and Google where only two succeed is the
 * single easiest thing in this product to misreport. The post genuinely reached
 * two platforms, so `state` is `published` and `published` is terminal — you
 * cannot un-publish Instagram. But if the Posts list then shows it the way it
 * shows a clean success, the owner believes all three went out and finds out
 * from a customer that Facebook never did.
 *
 * So the overall outcome is COMPUTED from the per-target results every time it
 * is read, and is deliberately NOT a field on `SocialPost`:
 *
 *   - a stored summary can disagree with the targets it summarises, and the
 *     moment it does, one of the two is lying to the owner;
 *   - the targets are the record of what the providers actually said, so they
 *     are the only thing that can be the source of truth;
 *   - `all_succeeded` therefore cannot be set — it can only be earned, by every
 *     target carrying a provider-issued remote id.
 *
 * ===================== THE FOUR THINGS AN OWNER IS TOLD ====================
 *
 *   Published            confirmed, with the provider's own id
 *   Reconnect required   permission is gone, or the platform is unreachable
 *   Failed               the platform refused this post; retrying may work
 *   Skipped by you       the owner's own choice, and not a problem
 *   Not attempted        nothing has happened to this target yet
 *
 * Reconnect and Failed are kept apart because they need different actions. See
 * `PublishFailureKind`.
 */

import {
  isConfirmedPublished,
  PLATFORM_LABEL,
  type Platform,
  type PublishTarget,
  type SocialPost,
} from './types';

/* -------------------------------------------------------------------------- */
/* One target's result                                                        */
/* -------------------------------------------------------------------------- */

export type TargetResultKind =
  | 'published'
  | 'publishing'
  | 'reconnect_required'
  | 'failed'
  | 'skipped_by_owner'
  | 'not_attempted';

/** What the owner can do about it. `null` when there is nothing to do. */
export type TargetAction = 'reconnect' | 'retry';

export interface TargetResult {
  readonly platform: Platform;
  readonly kind: TargetResultKind;
  /** Owner-facing, e.g. "Reconnect required". Never an enum value. */
  readonly label: string;
  /** The provider's own reason, when there is one. Never invented. */
  readonly detail: string | null;
  readonly action: TargetAction | null;
  /** Proof of publication. Null for everything that did not publish. */
  readonly remoteId: string | null;
  readonly permalink: string | null;
}

export const TARGET_RESULT_LABEL: Record<TargetResultKind, string> = {
  published: 'Published',
  publishing: 'Publishing…',
  reconnect_required: 'Reconnect required',
  failed: 'Failed',
  skipped_by_owner: 'Skipped by you',
  not_attempted: 'Not attempted',
};

/**
 * Classify ONE target. Reads only that target — never the post, never a sibling.
 *
 * The ordering matters. `isConfirmedPublished` is checked first and requires a
 * remote id, so a target marked `succeeded` with no id from the provider falls
 * through to `failed` rather than being reported as published. That is the one
 * case where a provider (or a bug) could otherwise manufacture a success.
 */
export function resultFor(target: PublishTarget): TargetResult {
  const base = {
    platform: target.platform,
    detail: target.failure?.message ?? null,
    remoteId: target.remoteId,
    permalink: target.permalink,
  };

  if (isConfirmedPublished(target)) {
    return { ...base, kind: 'published', label: TARGET_RESULT_LABEL.published, action: null };
  }

  if (target.status === 'in_flight') {
    return { ...base, kind: 'publishing', label: TARGET_RESULT_LABEL.publishing, action: null };
  }

  if (target.status === 'skipped') {
    /*
     * Two kinds of skip, separated by whether a reason was recorded.
     *
     * The owner's deliberate skip (product rule 5) carries none and is not a
     * problem — nagging them to reconnect something they chose to skip would be
     * worse than saying nothing. Shoogle's skip carries a reason, and means the
     * platform could not be reached.
     */
    if (target.failure === null) {
      return {
        ...base,
        kind: 'skipped_by_owner',
        label: TARGET_RESULT_LABEL.skipped_by_owner,
        action: null,
      };
    }
    return {
      ...base,
      kind: 'reconnect_required',
      label: TARGET_RESULT_LABEL.reconnect_required,
      action: 'reconnect',
    };
  }

  if (target.status === 'failed' || target.status === 'succeeded') {
    // `succeeded` reaching here means no remote id came back, so nothing
    // confirms it went out. It is not a success and must not read as one.
    const authorization = target.failure?.kind === 'authorization';
    return authorization
      ? {
          ...base,
          kind: 'reconnect_required',
          label: TARGET_RESULT_LABEL.reconnect_required,
          action: 'reconnect',
        }
      : { ...base, kind: 'failed', label: TARGET_RESULT_LABEL.failed, action: 'retry' };
  }

  return {
    ...base,
    kind: 'not_attempted',
    label: TARGET_RESULT_LABEL.not_attempted,
    action: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The whole post                                                             */
/* -------------------------------------------------------------------------- */

export type PublishSummaryOutcome =
  /** No target has been touched. */
  | 'not_attempted'
  /** At least one target is in flight. */
  | 'in_progress'
  /** EVERY target carries a provider-issued remote id. */
  | 'all_succeeded'
  /** Some published, some did not. The case that must never look complete. */
  | 'partial'
  /** Nothing published, and at least one target ended without publishing. */
  | 'all_failed';

export interface PublishSummary {
  readonly outcome: PublishSummaryOutcome;
  /** One entry per target, in target order. */
  readonly results: readonly TargetResult[];
  readonly published: readonly Platform[];
  readonly needsReconnect: readonly Platform[];
  readonly failed: readonly Platform[];
  readonly skippedByOwner: readonly Platform[];
  /**
   * True when some targets published and some did not, for any reason —
   * including a deliberate skip.
   *
   * Separate from `needsAttention` on purpose: a post the owner deliberately
   * kept off Facebook is partial but perfectly fine, and should not be flagged
   * as a problem.
   */
  readonly isPartial: boolean;
  /** True when something is genuinely wrong that the owner can act on. */
  readonly needsAttention: boolean;
}

/**
 * Derive the whole picture from the targets.
 *
 * Pure, and computed on every read. Nothing here is persisted — see the file
 * header for why a stored copy would be a liability rather than a cache.
 */
export function publishSummary(post: SocialPost): PublishSummary {
  const results = post.targets.map(resultFor);
  const of = (kind: TargetResultKind): Platform[] =>
    results.filter((result) => result.kind === kind).map((result) => result.platform);

  const published = of('published');
  const needsReconnect = of('reconnect_required');
  const failed = of('failed');
  const skippedByOwner = of('skipped_by_owner');
  const publishing = of('publishing');
  const notAttempted = of('not_attempted');

  const total = results.length;
  const needsAttention = needsReconnect.length > 0 || failed.length > 0;
  const isPartial = published.length > 0 && published.length < total;

  const outcome: PublishSummaryOutcome =
    total === 0
      ? 'not_attempted'
      : publishing.length > 0
        ? 'in_progress'
        : // EVERY target, with a real id from the provider. A deliberate skip
          // means not every target published, so this is not all_succeeded —
          // it is `partial`, which is accurate and not a problem.
          published.length === total
          ? 'all_succeeded'
          : published.length > 0
            ? 'partial'
            : notAttempted.length === total
              ? 'not_attempted'
              : 'all_failed';

  return {
    outcome,
    results,
    published,
    needsReconnect,
    failed,
    skippedByOwner,
    isPartial,
    needsAttention,
  };
}

/* -------------------------------------------------------------------------- */
/* Owner-facing sentences                                                     */
/* -------------------------------------------------------------------------- */

/**
 * "Instagram published · Google Business published · Facebook reconnect
 * required".
 *
 * Every platform is named with its own outcome, so a partial result cannot be
 * read as a whole one. There is deliberately no summarising phrase like
 * "2 of 3 published": a count tells the owner how many, and what she needs is
 * WHICH — she cannot reconnect a number.
 */
export function describeTargetResults(summary: PublishSummary): string {
  if (summary.results.length === 0) return 'No account chosen';
  return summary.results
    .map((result) => `${PLATFORM_LABEL[result.platform]} ${result.label.toLowerCase()}`)
    .join(' · ');
}

/**
 * The one-line headline for a post's publication.
 *
 * A partial post NEVER gets a bare "Published" line. That is the whole point of
 * this module: the published list must not be able to show a two-of-three post
 * the same way it shows a clean one.
 */
export function describeOutcome(summary: PublishSummary): string {
  switch (summary.outcome) {
    case 'all_succeeded':
      return 'Published everywhere';
    case 'partial':
      return summary.needsAttention
        ? `Partly published — ${describeTargetResults(summary)}`
        : `Published to ${summary.published.map((p) => PLATFORM_LABEL[p]).join(' and ')}`;
    case 'all_failed':
      return `Not published — ${describeTargetResults(summary)}`;
    case 'in_progress':
      return 'Publishing…';
    case 'not_attempted':
      return 'Not published yet';
  }
}

/** The action to offer, or null. Reconnect outranks retry: it blocks the retry. */
export function primaryAction(summary: PublishSummary): TargetAction | null {
  if (summary.needsReconnect.length > 0) return 'reconnect';
  if (summary.failed.length > 0) return 'retry';
  return null;
}

export const ACTION_LABEL: Record<TargetAction, string> = {
  reconnect: 'Reconnect',
  retry: 'Retry',
};

/**
 * The targets one action applies to — and ONLY those.
 *
 * Reconnecting must not re-attempt Instagram: it published, `published` is
 * terminal, and re-publishing would post twice. Retrying must not touch a
 * target whose problem is authorization, because it will fail identically until
 * the owner reconnects.
 */
export function targetsForAction(summary: PublishSummary, action: TargetAction): Platform[] {
  return action === 'reconnect' ? [...summary.needsReconnect] : [...summary.failed];
}
