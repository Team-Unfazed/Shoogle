/**
 * Shared machinery for the check registry. Pure functions only.
 *
 * The most important thing in this file is `need()`. Every check begins by
 * asking for the observations it declares, and if any of them is not `ready` the
 * check returns `not_checked` WITH THE REASON and stops. A check can therefore
 * not accidentally read a missing value as absent — the type system will not
 * hand it a value at all.
 */

import { type DataState } from '@/lib/state/DataState';

import type {
  CheckContext,
  CheckEvaluation,
  FindingDraft,
  FixCapability,
  NotCheckedReason,
  ObservationKey,
  ObservationValues,
  ReadCollection,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Outcome constructors                                                       */
/* -------------------------------------------------------------------------- */

export const pass = (): CheckEvaluation => ({ outcome: { kind: 'pass' } });

export const fail = (finding: FindingDraft): CheckEvaluation => ({
  outcome: { kind: 'fail' },
  finding,
});

/**
 * Partial credit. `ratio` must be strictly inside (0, 1): a `warn` that scores
 * like a pass or like a fail should have been a pass or a fail.
 */
export function warn(ratio: number, finding: FindingDraft): CheckEvaluation {
  if (!(ratio > 0 && ratio < 1)) {
    throw new Error(`warn() ratio must be strictly between 0 and 1, got ${ratio}`);
  }
  return { outcome: { kind: 'warn', ratio }, finding };
}

export const notApplicable = (why: string): CheckEvaluation => ({
  outcome: { kind: 'not_applicable', why },
});

export const notChecked = (reason: NotCheckedReason, detail: string): CheckEvaluation => ({
  outcome: { kind: 'not_checked', reason, detail },
});

/* -------------------------------------------------------------------------- */
/* Reading observations                                                       */
/* -------------------------------------------------------------------------- */

/** Maps a non-ready `DataState` onto the reason a check could not run. */
export function notCheckedFor<T>(
  state: Exclude<DataState<T>, { status: 'ready' }>,
): { reason: NotCheckedReason; detail: string } {
  switch (state.status) {
    case 'loading':
      return { reason: 'still_loading', detail: 'The value had not arrived when the audit ran.' };
    case 'unavailable':
      return { reason: state.reason, detail: state.message };
    case 'error':
      // Deliberately NOT collapsed into 'no_data_yet'. "Google did not answer"
      // and "there is nothing there" are different facts about the business.
      return { reason: 'provider_error', detail: state.message };
  }
}

export type Needed<K extends ObservationKey> = {
  [P in K]: ObservationValues[P];
} & {
  /** `fetchedAt` of the first requested observation, for `observedAt`. */
  observedAt: string;
  fixture: boolean;
};

type NeedResult<K extends ObservationKey> =
  | { ok: true; data: Needed<K> }
  | { ok: false; evaluation: CheckEvaluation };

/**
 * Ask for every observation a check needs. Returns the unwrapped values, or a
 * ready-made `not_checked` evaluation naming the first thing that was missing
 * and why.
 */
export function need<K extends ObservationKey>(ctx: CheckContext, ...keys: K[]): NeedResult<K> {
  const data: Record<string, unknown> = {};
  let observedAt: string | null = null;
  let fixture = false;

  for (const key of keys) {
    const state = ctx.observations[key];
    if (state.status !== 'ready') {
      const { reason, detail } = notCheckedFor(state);
      return { ok: false, evaluation: notChecked(reason, detail) };
    }
    data[key] = state.value;
    if (observedAt === null) observedAt = state.fetchedAt;
    if (state.isFixture === true) fixture = true;
  }

  data.observedAt = observedAt ?? ctx.now;
  data.fixture = fixture;
  return { ok: true, data: data as Needed<K> };
}

type CollectionResult<T> =
  | { ok: true; items: readonly T[] }
  | { ok: false; evaluation: CheckEvaluation };

/**
 * Unwrap a `ReadCollection`, or hand back a ready-made `not_checked` carrying
 * the reason Google never gave us the list.
 *
 * This is the collection-level twin of `need()`, and it exists for the same
 * reason: a check must not be able to read "we were never told" as "there are
 * none". An empty `items` here IS a measurement and a check may fail on it.
 */
export function readList<T>(collection: ReadCollection<T>): CollectionResult<T> {
  if (collection.kind === 'read') return { ok: true, items: collection.items };
  return { ok: false, evaluation: notChecked(collection.why, collection.detail) };
}

/** `items` when the list was read, `null` when it was not. For optional evidence. */
export function itemsIfRead<T>(collection: ReadCollection<T>): readonly T[] | null {
  return collection.kind === 'read' ? collection.items : null;
}

/* -------------------------------------------------------------------------- */
/* Capability presets — every one of these cites the GBP matrix               */
/* -------------------------------------------------------------------------- */

const MATRIX = 'docs/research/google-business-profile.md';

/** No Google API writes this at all. The fix is always guided. */
export const CAP_NO_API_WRITE = (why: string): FixCapability => ({
  apiSupportsWrite: false,
  providerMethod: null,
  matrixNote: `${MATRIX}: ${why}`,
});

/**
 * The Business Information API v1 `locations.patch` can write this field
 * (matrix §9), but `GoogleBusinessProfileProvider` declares no method for it, so
 * Shoogle cannot actually perform the write today. Degrades to `guided`; the
 * missing methods are a documented PR request to Sunny, not an edit.
 */
export const CAP_PATCHABLE_NO_METHOD = (field: string): FixCapability => ({
  apiSupportsWrite: true,
  providerMethod: null,
  matrixNote: `${MATRIX} §9: locations.patch writes \`${field}\`, but contracts.ts declares no provider method for it.`,
});

/** `updateBusinessHours` exists on the contract, and §9 confirms `regularHours` is writable. */
export const CAP_REGULAR_HOURS: FixCapability = {
  apiSupportsWrite: true,
  providerMethod: 'updateBusinessHours',
  matrixNote: `${MATRIX} §9: regularHours writable via locations.patch; contract declares updateBusinessHours.`,
};

/** `replyToReview` exists on the contract; §5 confirms reviews.updateReply. */
export const CAP_REVIEW_REPLY: FixCapability = {
  apiSupportsWrite: true,
  providerMethod: 'replyToReview',
  matrixNote: `${MATRIX} §5: accounts.locations.reviews.updateReply creates or replaces a reply.`,
};

/**
 * There is deliberately NO shared `CAP_LOCAL_POST` here.
 *
 * `createLocalPost` does exist on the provider contract, but the surface that
 * AUTHORS a Google post is `SocialPublisher`'s `google_business` target, which
 * this feature does not own and has no agreed handoff into. A capability record
 * naming `createLocalPost` would make G1/G2 `fixableByShoogle` and put a one-tap
 * button on a composer that does not exist here. Area G declares its own
 * capability with `providerMethod: null` and says so in the matrix note.
 */

/* -------------------------------------------------------------------------- */
/* Small pure utilities                                                       */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;

/** Whole days from `fromIso` to `toIso`. Negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.NaN;
  return Math.floor((to - from) / MS_PER_DAY);
}

/** Newest ISO timestamp in a list, or null for an empty list (a measured zero). */
export function newestTimestamp(times: readonly string[]): string | null {
  let newest: string | null = null;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const t of times) {
    const ms = Date.parse(t);
    if (Number.isNaN(ms)) continue;
    if (ms > newestMs) {
      newestMs = ms;
      newest = t;
    }
  }
  return newest;
}

/**
 * Normalises a trading name before comparing two of them: case, punctuation,
 * and the suffixes Indian businesses use inconsistently across a shopfront, a
 * GST certificate and a website footer.
 */
export function normaliseBusinessName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(pvt|private)\b\.?/g, '')
    .replace(/\b(ltd|limited)\b\.?/g, '')
    .replace(/\b(llp|inc|co)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A very rough "is this title stuffed with keywords?" test: Google's own naming
 * guideline is that the name is the real-world name, nothing else. We only flag
 * the unambiguous case — a marketing superlative in the title.
 */
const STUFFING_MARKERS = [
  'best',
  'cheapest',
  'no 1',
  'no1',
  'number 1',
  '#1',
  'top rated',
  'near me',
];

export function looksKeywordStuffed(title: string): string[] {
  const haystack = ` ${normaliseBusinessName(title)} `;
  return STUFFING_MARKERS.filter((m) => haystack.includes(` ${normaliseBusinessName(m)} `));
}

/**
 * Indian phone plausibility. Deliberately permissive about formatting and
 * strict only about the things that make a number un-callable: a mobile number
 * must be 10 digits starting 6-9; a landline is an STD code plus subscriber
 * number, 8 to 11 digits in total after the country code.
 */
export function isPlausibleIndianPhone(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, '');
  const national = digits.startsWith('91') && digits.length > 10 ? digits.slice(2) : digits;
  if (national.length === 10) return /^[6-9]\d{9}$/.test(national);
  if (national.length >= 8 && national.length <= 11) return /^0?\d{7,10}$/.test(national);
  return false;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres. Used by B3 to compare pin against address. */
export function haversineMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** ISO date (YYYY-MM-DD) of an ISO timestamp, in UTC. */
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Adds whole days to an ISO date string, returning YYYY-MM-DD. */
export function addDays(isoDateString: string, days: number): string {
  const ms = Date.parse(`${isoDateString}T00:00:00.000Z`);
  return new Date(ms + days * MS_PER_DAY).toISOString().slice(0, 10);
}
