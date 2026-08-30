/**
 * Business Information EDIT queue. Owner: Pranay.
 *
 * WHAT THIS IS AND WHAT IT IS NOT
 * -------------------------------
 * Google's Business Information API allows **10 edits per minute per Google
 * Business Profile**, and states that ceiling "cannot be increased". Every
 * other limit in the family is 300 queries per minute per API, which no
 * realistic Shoogle session approaches.
 *
 * So this queue exists for EDITS ONLY, keyed by profile. READS ARE NOT QUEUED.
 * An earlier draft of the research applied the 10/minute figure to reads; it
 * does not. Serialising reads behind a one-per-six-seconds gate would make the
 * Business tab take a minute to paint for no reason at all. If you are about to
 * push a read through here, re-read `endpoints.ts` § Quota first.
 *
 * The queue is a rolling-window limiter, not a fixed-bucket one: ten edits at
 * 12:00:59 must not be joined by ten more at 12:01:00.
 */

import { GBP_EDIT_QPM_PER_PROFILE } from './endpoints';

export interface GbpWriteQueueOptions {
  /** Max edits per rolling window, per profile. Defaults to Google's 10. */
  maxPerWindow?: number;
  /** Rolling window in milliseconds. Defaults to 60_000. */
  windowMs?: number;
  /** Injected for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Injected for tests. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

export interface GbpWriteQueue {
  /**
   * Run `task` no sooner than the per-profile edit ceiling allows.
   * Tasks for one profile run in submission order; different profiles do not
   * block each other.
   */
  enqueue<T>(profileKey: string, task: () => Promise<T>): Promise<T>;
  /** How many edit slots remain in the current window. Diagnostics only. */
  slotsRemaining(profileKey: string): number;
  /** Whether anything is waiting. Lets the UI say "queued", honestly. */
  pendingCount(profileKey: string): number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface ProfileLane {
  /** Timestamps of edits started inside the current window. */
  starts: number[];
  /** Serialises this profile's tasks so order is preserved. */
  tail: Promise<unknown>;
  pending: number;
}

export function createGbpWriteQueue(options: GbpWriteQueueOptions = {}): GbpWriteQueue {
  const maxPerWindow = options.maxPerWindow ?? GBP_EDIT_QPM_PER_PROFILE;
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;

  const lanes = new Map<string, ProfileLane>();

  function lane(profileKey: string): ProfileLane {
    const existing = lanes.get(profileKey);
    if (existing !== undefined) return existing;
    const created: ProfileLane = { starts: [], tail: Promise.resolve(), pending: 0 };
    lanes.set(profileKey, created);
    return created;
  }

  function prune(target: ProfileLane): void {
    const cutoff = now() - windowMs;
    target.starts = target.starts.filter((at) => at > cutoff);
  }

  async function waitForSlot(target: ProfileLane): Promise<void> {
    // Loop rather than compute once: `sleep` may overshoot or undershoot, and
    // another lane's task may have consumed the slot we were waiting for.
    for (;;) {
      prune(target);
      if (target.starts.length < maxPerWindow) return;
      const oldest = target.starts[0];
      if (oldest === undefined) return;
      const waitMs = oldest + windowMs - now();
      await sleep(waitMs > 0 ? waitMs : 1);
    }
  }

  return {
    enqueue<T>(profileKey: string, task: () => Promise<T>): Promise<T> {
      const target = lane(profileKey);
      target.pending += 1;

      const run = target.tail.then(async (): Promise<T> => {
        await waitForSlot(target);
        target.starts.push(now());
        try {
          return await task();
        } finally {
          target.pending -= 1;
        }
      });

      // Keep the lane alive after a rejection so one failed edit does not wedge
      // every later edit for that profile.
      target.tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },

    slotsRemaining(profileKey: string): number {
      const target = lanes.get(profileKey);
      if (target === undefined) return maxPerWindow;
      prune(target);
      return Math.max(0, maxPerWindow - target.starts.length);
    },

    pendingCount(profileKey: string): number {
      return lanes.get(profileKey)?.pending ?? 0;
    },
  };
}
