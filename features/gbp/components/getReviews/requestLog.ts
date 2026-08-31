/**
 * The weekly counter — and the single most important honesty decision on this
 * screen.
 *
 * WHAT GREXA SHOWS, AND WHY IT IS NOT TRUE
 * ----------------------------------------
 * Grexa's home screen carries "Get Reviews from Your Customers" with a 0/8
 * progress bar and "8 more to hit your weekly goal". A progress bar toward a
 * REVIEW goal states that the tool is producing reviews. It cannot know that.
 * Nothing in the Google Business Profile API links a review to a request: there
 * is no campaign id, no referrer, no attribution field, nothing. The bar is a
 * feeling, presented as a measurement.
 *
 * WHAT SHOOGLE COUNTS INSTEAD
 * ---------------------------
 * Two numbers, kept apart on purpose, because they are two different facts:
 *
 *   1. REQUESTS SENT — this file. Shoogle knows this because Shoogle sent them.
 *      Scoped honestly: requests the owner CONFIRMED sending, from Shoogle, on
 *      this phone. A zero here is a real measured zero, and renders as 0.
 *
 *   2. NEW REVIEWS — read from the profile, when one is connected, and rendered
 *      by a different card that says in words that the two are not linked.
 *
 * WHY CONFIRMATION, AND NOT "WE OPENED WHATSAPP"
 * ---------------------------------------------
 * Handing a prefilled message to WhatsApp is not sending it. The owner may pick
 * the wrong contact, change their mind, or lose the draft. Counting the handoff
 * would inflate the number in exactly the direction that flatters the product,
 * which is the direction to be most suspicious of. So a request is counted only
 * once the owner says it went, and everything between the two states is visible
 * on screen as "waiting for you to confirm".
 *
 * WHY LOCAL STORAGE
 * -----------------
 * There is no Shoogle backend for this yet. AsyncStorage is already a project
 * dependency and needs no permissions. The cost is real and is stated in the
 * UI: requests sent from another phone, or by hand, are not in this count.
 */

import { failed, ready, type DataState } from '@/lib/state/DataState';

/** Namespaced and versioned so a future shape change cannot be misread as data. */
export const REVIEW_REQUEST_LOG_KEY = 'shoogle.gbp.reviewRequests.v1';

/** Grexa's number, kept for comparability. A suggestion, never a measurement. */
export const SUGGESTED_WEEKLY_REQUESTS = 8;

/** Entries older than this are dropped; the screen only ever shows this week. */
const RETAIN_WEEKS = 8;

export type RequestChannel = 'whatsapp' | 'shared' | 'in_person';

export interface ReviewRequestEntry {
  readonly id: string;
  /** ISO instant at which the OWNER confirmed the request actually went out. */
  readonly confirmedAt: string;
  readonly channel: RequestChannel;
}

export interface WeeklyRequestSummary {
  /** ISO date (YYYY-MM-DD) of the Monday this week started on. */
  readonly weekStart: string;
  /** Confirmed requests inside this week. A genuine measured count. */
  readonly confirmed: number;
  readonly suggested: number;
  /** The full retained log, newest first. */
  readonly entries: readonly ReviewRequestEntry[];
}

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Weeks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Monday of the week containing `date`, as a local `YYYY-MM-DD` date.
 *
 * Local, not UTC: an owner in IST sending a request at 1am Monday means Monday
 * to them, and a UTC week boundary would file it under the previous week.
 */
export function startOfWeek(date: Date): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - daysSinceMonday);
  const month = `${local.getMonth() + 1}`.padStart(2, '0');
  const day = `${local.getDate()}`.padStart(2, '0');
  return `${local.getFullYear()}-${month}-${day}`;
}

function isInWeek(entry: ReviewRequestEntry, weekStart: string): boolean {
  const at = new Date(entry.confirmedAt);
  if (Number.isNaN(at.getTime())) return false;
  return startOfWeek(at) === weekStart;
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

const CHANNELS: readonly RequestChannel[] = ['whatsapp', 'shared', 'in_person'];

function isChannel(value: unknown): value is RequestChannel {
  return typeof value === 'string' && CHANNELS.includes(value as RequestChannel);
}

/**
 * Read one stored entry, or reject it.
 *
 * A partially-readable log is a corrupt log. Rather than silently dropping the
 * rows that will not parse — which would quietly under-report a number the
 * screen presents as exact — an unreadable payload becomes an error state.
 */
function parseEntry(value: unknown): ReviewRequestEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const record: Record<string, unknown> = { ...value };
  const { id, confirmedAt, channel } = record;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof confirmedAt !== 'string' || Number.isNaN(new Date(confirmedAt).getTime())) return null;
  if (!isChannel(channel)) return null;
  return { id, confirmedAt, channel };
}

export function parseRequestLog(raw: string | null): ReviewRequestEntry[] | 'corrupt' {
  if (raw === null || raw.trim().length === 0) return [];

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return 'corrupt';
  }
  if (!Array.isArray(decoded)) return 'corrupt';

  const entries: ReviewRequestEntry[] = [];
  for (const item of decoded) {
    const entry = parseEntry(item);
    if (entry === null) return 'corrupt';
    entries.push(entry);
  }
  return entries;
}

function prune(entries: readonly ReviewRequestEntry[], now: Date): ReviewRequestEntry[] {
  const cutoff = new Date(now.getTime() - RETAIN_WEEKS * 7 * 24 * 60 * 60 * 1000).getTime();
  return entries
    .filter((entry) => new Date(entry.confirmedAt).getTime() >= cutoff)
    .sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1));
}

export function summarise(entries: readonly ReviewRequestEntry[], now: Date): WeeklyRequestSummary {
  const weekStart = startOfWeek(now);
  return {
    weekStart,
    confirmed: entries.filter((entry) => isInWeek(entry, weekStart)).length,
    suggested: SUGGESTED_WEEKLY_REQUESTS,
    entries: prune(entries, now),
  };
}

/* -------------------------------------------------------------------------- */
/* Reading and writing                                                        */
/* -------------------------------------------------------------------------- */

const CORRUPT_MESSAGE =
  'Shoogle could not read the record of requests it sent from this phone, so it will not show a count it cannot stand behind. Sending a new request starts the count again.';

const READ_FAILED_MESSAGE =
  'Shoogle could not read the record of requests it sent from this phone. The count is unknown, not zero.';

/**
 * Load the log.
 *
 * Every failure path returns an error state rather than an empty log, because
 * "we could not read it" and "you have sent none" are different facts and a
 * zero would be a lie about the owner's own effort.
 */
export async function loadRequestLog(
  storage: AsyncStorageLike,
  now: Date,
): Promise<DataState<WeeklyRequestSummary>> {
  let raw: string | null;
  try {
    raw = await storage.getItem(REVIEW_REQUEST_LOG_KEY);
  } catch {
    return failed('review_request_log_read_failed', READ_FAILED_MESSAGE, true);
  }

  const entries = parseRequestLog(raw);
  if (entries === 'corrupt') {
    return failed('review_request_log_corrupt', CORRUPT_MESSAGE, false);
  }

  return ready(summarise(entries, now), now.toISOString());
}

export interface RecordResult {
  readonly summary: WeeklyRequestSummary;
  /** False when the entry could not be persisted. The count is still shown. */
  readonly persisted: boolean;
}

/**
 * Append a confirmed request and persist the pruned log.
 *
 * `persisted: false` is surfaced to the owner rather than swallowed: a counter
 * that silently forgets on the next launch is a counter that lies later.
 */
export async function recordConfirmedRequest(
  storage: AsyncStorageLike,
  entry: ReviewRequestEntry,
  now: Date,
  existing: readonly ReviewRequestEntry[],
): Promise<RecordResult> {
  const next = prune([entry, ...existing], now);
  const summary = summarise(next, now);
  try {
    await storage.setItem(REVIEW_REQUEST_LOG_KEY, JSON.stringify(next));
    return { summary, persisted: true };
  } catch {
    return { summary, persisted: false };
  }
}
