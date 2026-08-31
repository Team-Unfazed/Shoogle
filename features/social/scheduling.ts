/**
 * Scheduling. Owner: Yash.
 *
 * ===================== THE ARCHITECTURAL DECISION ==========================
 *
 * SHOOGLE OWNS THE CLOCK. No platform is assumed to schedule anything.
 *
 * It is tempting to hand a future timestamp to a provider and let them hold
 * the post. Whether any of Instagram, Facebook, LinkedIn or Google Business
 * Profile will actually do that is UNVERIFIED (`platforms.ts`), and building
 * on an unverified capability means discovering at the worst moment that a
 * whole week of a customer's posts never existed anywhere but on their phone.
 *
 * So the model is:
 *
 *      owner schedules  ->  Shoogle stores a due instant
 *                       ->  a Shoogle-side runner wakes at due time
 *                       ->  the runner calls the provider's PUBLISH-NOW API
 *                       ->  the provider confirms, or it does not
 *
 * Only the last step touches a platform, and it only ever uses publish-now —
 * the one operation every publishing API has. If research later proves a
 * platform schedules reliably, `providerSideScheduling` flips to verified and
 * that platform's publisher can delegate. Nothing else changes.
 *
 * WHAT IS NOT BUILT, AND WHY THAT IS SAID OUT LOUD
 * ------------------------------------------------
 * The runner is server-side work. A phone that is asleep, offline or has the
 * app swiped away cannot publish anything, so an on-device timer would be a
 * promise Shoogle cannot keep. There is no runner yet — which is exactly why
 * `createSocialPublisher()` refuses to accept a schedule while no platform
 * publisher is wired up, instead of storing a due date nobody will ever act
 * on. See `publisher.ts`. This dependency is on Sunny (Supabase + scheduled
 * execution) and is recorded in docs/agent-memory/yash-changes.md.
 */

import type { Result } from '@/lib/providers/types';

import type { Schedule, SocialPost } from './types';

/* -------------------------------------------------------------------------- */
/* Shoogle-owned scheduling rules                                             */
/* -------------------------------------------------------------------------- */

/**
 * How far ahead a post must be scheduled.
 *
 * This is a SHOOGLE rule, not a platform limit: the runner polls, media may
 * need uploading, and a post due in ten seconds would race that work. It is
 * ours to choose, so it is safe to state as a number — unlike anything in
 * `platforms.ts`.
 */
export const MIN_SCHEDULE_LEAD_MINUTES = 5;

/** The furthest ahead the composer will let an owner schedule. Also ours. */
export const MAX_SCHEDULE_HORIZON_DAYS = 90;

export type ScheduleRejection =
  | 'invalid_instant'
  | 'unknown_timezone'
  | 'in_the_past'
  | 'too_soon'
  | 'beyond_horizon';

export type ScheduleValidation =
  | { ok: true; schedule: Schedule }
  | { ok: false; reason: ScheduleRejection; message: string };

function timeZoneIsUsable(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Turn an owner's chosen instant into a `Schedule`, or explain why not.
 *
 * Returns a rejection rather than throwing, because every one of these is
 * something the owner can fix in the composer and should be told about there.
 */
export function validateSchedule(
  dueAtIso: string,
  timeZone: string,
  now: Date = new Date(),
): ScheduleValidation {
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) {
    return { ok: false, reason: 'invalid_instant', message: 'That is not a valid date and time.' };
  }
  if (!timeZoneIsUsable(timeZone)) {
    return {
      ok: false,
      reason: 'unknown_timezone',
      message: 'Shoogle does not recognise that timezone, so it cannot schedule reliably.',
    };
  }

  const minutesAhead = (due.getTime() - now.getTime()) / 60_000;
  if (minutesAhead < 0) {
    return { ok: false, reason: 'in_the_past', message: 'That time has already passed.' };
  }
  if (minutesAhead < MIN_SCHEDULE_LEAD_MINUTES) {
    return {
      ok: false,
      reason: 'too_soon',
      message: `Schedule at least ${MIN_SCHEDULE_LEAD_MINUTES} minutes ahead, or post now instead.`,
    };
  }
  if (minutesAhead / (60 * 24) > MAX_SCHEDULE_HORIZON_DAYS) {
    return {
      ok: false,
      reason: 'beyond_horizon',
      message: `Shoogle schedules up to ${MAX_SCHEDULE_HORIZON_DAYS} days ahead.`,
    };
  }

  return {
    ok: true,
    schedule: { dueAt: due.toISOString(), timeZone, owner: 'shoogle' },
  };
}

/** True when the runner should pick this post up. */
export function isDue(schedule: Schedule, now: Date = new Date()): boolean {
  const due = new Date(schedule.dueAt).getTime();
  return !Number.isNaN(due) && due <= now.getTime();
}

/** Earliest-first. Posts with no schedule sort last, never as "now". */
export function bySoonestDue(a: SocialPost, b: SocialPost): number {
  const at = a.schedule ? new Date(a.schedule.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const bt = b.schedule ? new Date(b.schedule.dueAt).getTime() : Number.POSITIVE_INFINITY;
  return at - bt;
}

/**
 * The next post due, or null. Only considers posts that are actually
 * `scheduled` — a draft with a date on it is not going out.
 */
export function nextDuePost(posts: readonly SocialPost[]): SocialPost | null {
  return (
    [...posts]
      .filter((post) => post.state === 'scheduled' && post.schedule !== null)
      .sort(bySoonestDue)[0] ?? null
  );
}

/* -------------------------------------------------------------------------- */
/* The runner contract                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What a Shoogle-side scheduled runner must provide.
 *
 * Declared here so the composer, the publisher and the eventual server job all
 * agree on one shape. NOT implemented on-device: see the file header.
 */
export interface ScheduleRunner {
  /** Posts whose due instant has passed and which have not been attempted. */
  claimDue(now: string, limit: number): Result<SocialPost[]>;
  /** Mark a claimed post as being worked on, so two runners cannot double-post. */
  markInFlight(postId: string): Result<SocialPost>;
  /** Release a claim without publishing — used when a run is interrupted. */
  release(postId: string): Result<SocialPost>;
}
