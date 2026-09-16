/**
 * The post lifecycle state machine. Owner: Yash.
 *
 * A post moves between exactly these states, and only along the edges declared
 * in `TRANSITIONS`. Nothing in this feature sets `post.state` directly — it
 * goes through `transition()`, so an illegal move is a caught error rather
 * than a corrupt row.
 *
 * WHY A TABLE RATHER THAN `if` STATEMENTS
 * ---------------------------------------
 * The dishonest states this product must not reach are all reachable by an
 * `if`: a post that shows "Published" because a request was sent, a post that
 * goes from `generating` straight to `ready` when generation failed, a
 * `published` post that quietly returns to `draft` and loses the fact that it
 * is live. The table makes each of those a missing edge instead of a code
 * review question.
 *
 * `published` is TERMINAL. You cannot un-publish something that is public.
 * Deleting the remote object is a separate operation against the provider, and
 * it does not move this post backwards.
 *
 * SEPARATE AXES — do not merge these:
 *   - `PostState`      (here)              where the post is in Shoogle's flow
 *   - `PublishStatus`  (types.ts)          what one provider did with it
 *   - `ConnectionStatus` (@/types/domain)  whether the account is linked at all
 */

import type { PostStatus } from '@/types/domain';

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export const POST_STATES = [
  /** Being written. Incomplete by definition — may have no caption or media. */
  'draft',
  /** A generator is working. Indeterminate: no percentage, ever (rule 10). */
  'generating',
  /** Complete and valid, but nobody has scheduled it. */
  'ready',
  /** Has a schedule. Shoogle owns the clock; nothing has been sent. */
  'scheduled',
  /** A publish attempt is in flight against at least one target. */
  'publishing',
  /** At least one provider confirmed publication with a remote id. */
  'published',
  /** Every attempted target failed. The reason is on the target, not here. */
  'failed',
  /** The owner skipped this occurrence. One tap, per product rule 5. */
  'skipped',
] as const;

export type PostState = (typeof POST_STATES)[number];

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export const POST_EVENTS = [
  'generation_started',
  'generation_succeeded',
  'generation_failed',
  'generation_cancelled',
  /** Validation passed — see `validatePost` in `validation.ts`. */
  'validated',
  'content_edited',
  'scheduled',
  'unscheduled',
  'publish_started',
  'publish_succeeded',
  'publish_failed',
  'retry_requested',
  'skipped',
  'unskipped',
] as const;

export type PostEvent = (typeof POST_EVENTS)[number];

/* -------------------------------------------------------------------------- */
/* The table                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every legal edge. A missing entry is a deliberate refusal, not an oversight:
 *
 * - `generating -> ready` requires `generation_succeeded`. A failure returns to
 *   `draft` with whatever the owner already had; it never fabricates content.
 * - `scheduled -> published` does not exist. A post must pass through
 *   `publishing`, which is the only state a provider call can be made from.
 * - `published` has no outgoing edges at all.
 * - `content_edited` sends a `ready`, `scheduled` or `failed` post back to
 *   `draft`, because edited content has not been validated against its targets
 *   any more. The caller is responsible for telling the owner their post was
 *   unscheduled — silently keeping the slot would be the dishonest option.
 */
export const TRANSITIONS: Record<PostState, Partial<Record<PostEvent, PostState>>> = {
  draft: {
    generation_started: 'generating',
    content_edited: 'draft',
    validated: 'ready',
    skipped: 'skipped',
  },
  generating: {
    generation_succeeded: 'ready',
    generation_failed: 'draft',
    generation_cancelled: 'draft',
  },
  ready: {
    scheduled: 'scheduled',
    content_edited: 'draft',
    generation_started: 'generating',
    skipped: 'skipped',
  },
  scheduled: {
    publish_started: 'publishing',
    unscheduled: 'ready',
    content_edited: 'draft',
    skipped: 'skipped',
  },
  publishing: {
    publish_succeeded: 'published',
    publish_failed: 'failed',
  },
  published: {},
  failed: {
    retry_requested: 'scheduled',
    content_edited: 'draft',
    skipped: 'skipped',
  },
  skipped: {
    unskipped: 'ready',
  },
};

/** True when no event can move this post any further. */
export function isTerminal(state: PostState): boolean {
  return Object.keys(TRANSITIONS[state]).length === 0;
}

export function canTransition(state: PostState, event: PostEvent): boolean {
  return TRANSITIONS[state][event] !== undefined;
}

/** The next state, or null when the event is not legal from here. */
export function nextState(state: PostState, event: PostEvent): PostState | null {
  return TRANSITIONS[state][event] ?? null;
}

/**
 * Apply an event, or throw. Use this on any path where an illegal transition
 * would mean a bug in Shoogle rather than something the owner did — for
 * everything the owner drives, check `canTransition` first and disable the
 * control instead of throwing at them.
 */
export function transition(state: PostState, event: PostEvent): PostState {
  const next = nextState(state, event);
  if (next === null) {
    throw new Error(`Illegal post transition: ${state} cannot handle "${event}".`);
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

/** Owner-facing state names. English UI, per product rule 12. */
export const POST_STATE_LABEL: Record<PostState, string> = {
  draft: 'Draft',
  generating: 'Writing',
  ready: 'Ready',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
  skipped: 'Skipped',
};

/**
 * Map onto the shared `PostStatus` that `PostStatusBadge` and the Home tab
 * understand. `generating` and `ready` both narrow to 'draft' because the
 * shared badge has no fifth colour and adding one is a change to
 * `components/ui/Badge.tsx`, which is shared and not mine to widen alone.
 *
 * Where the difference matters — the composer, the list row — this feature
 * renders `POST_STATE_LABEL` next to the badge rather than forking the
 * primitive.
 */
export function toSharedStatus(state: PostState): PostStatus {
  switch (state) {
    case 'draft':
    case 'generating':
    case 'ready':
      return 'draft';
    case 'scheduled':
      return 'scheduled';
    case 'publishing':
      return 'publishing';
    case 'published':
      return 'published';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
  }
}

/** States the owner still has to act on. Drives the "Needs attention" section. */
export const NEEDS_OWNER_STATES: readonly PostState[] = ['draft', 'failed'];

/** States that count towards "Draft" on the stat tiles. */
export const DRAFT_LIKE_STATES: readonly PostState[] = ['draft', 'generating', 'ready'];
