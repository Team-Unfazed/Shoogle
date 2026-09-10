/**
 * Scheduling. Owner: Yash.
 *
 * ===================== THE ARCHITECTURAL DECISION ==========================
 *
 * SHOOGLE OWNS THE CLOCK. No platform is assumed to schedule anything.
 *
 * It is tempting to hand a future timestamp to a provider and let them hold
 * the post. Facebook and Google Business Profile genuinely will — both document
 * a scheduling field, and `providerSideScheduling` is verified true for each.
 * Instagram documents nothing of the kind. Building on an unverified capability
 * means discovering at the worst moment that a whole week of a customer's posts
 * never existed anywhere but on their phone.
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

import { capabilitiesFor, isEnforceable } from './platforms';
import { PLATFORM_LABEL, type Platform, type Schedule, type SocialPost } from './types';

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
 *
 * It is a FLOOR, not the answer. A platform that demands more notice wins:
 * Facebook requires 10 minutes, so a post targeting Facebook needs 10.
 */
export const MIN_SCHEDULE_LEAD_MINUTES = 5;

/**
 * The furthest ahead the composer will let an owner schedule. Also ours, and
 * also only a ceiling — every target narrows it.
 *
 * ⚠️ This number alone is NOT safe to validate against. Facebook's documented
 * maximum is at most 75 days and arguably 30; 90 exceeds both. Validating a
 * Facebook post against this constant would accept a schedule Facebook refuses
 * and show the owner a post that silently never goes out. That was a real
 * defect here, fixed on 2026-09-09 by making the window per-target.
 * Always go through `scheduleWindowFor()`.
 */
export const MAX_SCHEDULE_HORIZON_DAYS = 90;

/* -------------------------------------------------------------------------- */
/* The effective window                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The window a post may actually be scheduled in, given its targets.
 *
 * A multi-target post must satisfy EVERY target, so the window is the
 * intersection: the strictest minimum lead and the tightest horizon win. One
 * post going out at one instant cannot honour two different windows, and
 * splitting a post per platform to widen it would be Shoogle inventing a
 * publication the owner did not ask for.
 */
export interface ScheduleWindow {
  minLeadMinutes: number;
  maxHorizonDays: number;
  /** The platform that set `minLeadMinutes`, or null when Shoogle's floor did. */
  minLeadSetBy: Platform | null;
  /** The platform that set `maxHorizonDays`, or null when Shoogle's ceiling did. */
  maxHorizonSetBy: Platform | null;
  /**
   * Targets whose own window is undocumented, so only Shoogle's bounds were
   * applied to them. NOT a pass — the composer should say that a schedule near
   * the edge of the window has not been checked against these platforms.
   */
  unverifiedFor: Platform[];
}

/**
 * Intersect the scheduling windows of every target.
 *
 * With no targets this returns Shoogle's own bounds, which is the honest answer
 * for a post nobody has chosen a destination for yet.
 */
export function scheduleWindowFor(platforms: readonly Platform[] = []): ScheduleWindow {
  let minLeadMinutes = MIN_SCHEDULE_LEAD_MINUTES;
  let maxHorizonDays = MAX_SCHEDULE_HORIZON_DAYS;
  let minLeadSetBy: Platform | null = null;
  let maxHorizonSetBy: Platform | null = null;
  const unverifiedFor: Platform[] = [];

  for (const platform of platforms) {
    const caps = capabilitiesFor(platform);
    let known = false;

    // `isEnforceable`, not `isVerified`: a limit whose own documentation
    // contradicts itself still binds at its conservative end.
    const lead = caps.scheduleMinLeadMinutes;
    if (isEnforceable(lead)) {
      known = true;
      if (lead.value > minLeadMinutes) {
        minLeadMinutes = lead.value;
        minLeadSetBy = platform;
      }
    }

    const horizon = caps.scheduleMaxHorizonDays;
    if (isEnforceable(horizon)) {
      known = true;
      if (horizon.value < maxHorizonDays) {
        maxHorizonDays = horizon.value;
        maxHorizonSetBy = platform;
      }
    }

    if (!known) unverifiedFor.push(platform);
  }

  return { minLeadMinutes, maxHorizonDays, minLeadSetBy, maxHorizonSetBy, unverifiedFor };
}

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
 *
 * `platforms` are the post's targets. Pass them: the bounds tighten per target,
 * and a rejection names the platform responsible so the owner can act on it —
 * "Facebook needs at least 10 minutes' notice" is something they can fix,
 * "too soon" is not. Omitting them validates against Shoogle's own bounds only,
 * which is correct for a post with no targets chosen yet and wrong for one that
 * has them.
 */
export function validateSchedule(
  dueAtIso: string,
  timeZone: string,
  now: Date = new Date(),
  platforms: readonly Platform[] = [],
): ScheduleValidation {
  const window = scheduleWindowFor(platforms);
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
  if (minutesAhead < window.minLeadMinutes) {
    const who = window.minLeadSetBy;
    return {
      ok: false,
      reason: 'too_soon',
      message:
        who === null
          ? `Schedule at least ${window.minLeadMinutes} minutes ahead, or post now instead.`
          : `${PLATFORM_LABEL[who]} needs at least ${window.minLeadMinutes} minutes’ notice. Schedule further ahead, or post now instead.`,
    };
  }
  if (minutesAhead / (60 * 24) > window.maxHorizonDays) {
    const who = window.maxHorizonSetBy;
    return {
      ok: false,
      reason: 'beyond_horizon',
      message:
        who === null
          ? `Shoogle schedules up to ${window.maxHorizonDays} days ahead.`
          : `${PLATFORM_LABEL[who]} accepts posts scheduled up to ${window.maxHorizonDays} days ahead.`,
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
