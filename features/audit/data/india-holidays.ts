/**
 * Festival / holiday calendar for check D3 (special hours). Owner: Pranay.
 *
 * docs/research/local-seo-methodology.md §2 area D requires this to be a
 * versioned, dated data file carrying the year it covers, "so a stale calendar
 * is visible rather than silently wrong".
 *
 * ---------------------------------------------------------------------------
 * THIS CALENDAR IS DELIBERATELY INCOMPLETE, AND SAYS SO IN ITS TYPE.
 * ---------------------------------------------------------------------------
 *
 * Only holidays with FIXED Gregorian dates are listed. Every festival that
 * matters most to an Indian shop owner — Diwali, Holi, Eid, Ganesh Chaturthi,
 * Onam, Pongal, Durga Puja, Gudi Padwa — follows a lunar or solar-lunar
 * calendar whose Gregorian date changes every year and, for Eid, depends on a
 * moon sighting. Hard-coding dates for those from memory would be inventing
 * data, which is the one thing this codebase does not do.
 *
 * The consequence is encoded, not hidden: because `completeness` is `'partial'`,
 * D3 can never conclude "no festival is coming". With no entry in the window it
 * returns `not_checked('insufficient_data')` and the Hours area declares itself
 * partially unchecked. Only a calendar marked `'complete'` for the window may
 * produce `not_applicable`.
 *
 * Open question 5 in the research doc ("license a maintained state-aware Indian
 * holiday dataset, or curate one?") is the blocker on making this complete. It
 * is the highest-value low-effort check in the audit, so it is worth resolving.
 */

import type { IndiaStateCode } from '../types';

export interface HolidayEntry {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** Owner-facing name. */
  name: string;
  /** Null means it applies nationally. */
  states: IndiaStateCode[] | null;
  /**
   * Whether most neighbourhood shops actually close. `'varies'` still triggers
   * the check — the point is to ask the owner, not to assert their hours.
   */
  closureLikelihood: 'most_close' | 'varies';
}

export interface HolidayCalendar {
  /** Bump when entries change, so a cached audit can be invalidated. */
  version: string;
  /** The window this file makes any claim about at all. */
  coverage: { fromDate: string; toDate: string };
  /**
   * `'partial'` means: entries listed here are correct, but absence of an entry
   * proves nothing. Never set this to `'complete'` without a maintained source.
   */
  completeness: 'partial' | 'complete';
  entries: HolidayEntry[];
}

export const INDIA_HOLIDAY_CALENDAR: HolidayCalendar = {
  version: '2026.1',
  coverage: { fromDate: '2026-01-01', toDate: '2026-12-31' },
  completeness: 'partial',
  entries: [
    { date: '2026-01-26', name: 'Republic Day', states: null, closureLikelihood: 'varies' },
    { date: '2026-05-01', name: 'Maharashtra Day', states: ['MH'], closureLikelihood: 'varies' },
    { date: '2026-08-15', name: 'Independence Day', states: null, closureLikelihood: 'varies' },
    { date: '2026-10-02', name: 'Gandhi Jayanti', states: null, closureLikelihood: 'most_close' },
    {
      date: '2026-11-01',
      name: 'Kannada Rajyotsava',
      states: ['KA'],
      closureLikelihood: 'varies',
    },
    { date: '2026-12-25', name: 'Christmas', states: null, closureLikelihood: 'most_close' },
  ],
};

export interface HolidayLookup {
  /** Entries falling inside the window, soonest first. */
  upcoming: HolidayEntry[];
  /**
   * True when the calendar covers the whole window AND claims completeness, i.e.
   * when an empty `upcoming` genuinely means "no festival is coming".
   */
  windowFullyCovered: boolean;
}

/**
 * Holidays between `fromDate` (inclusive) and `toDate` (inclusive) that apply to
 * `stateCode`. A null `stateCode` returns national entries only — we do not
 * guess a business's state.
 */
export function findHolidaysInWindow(
  calendar: HolidayCalendar,
  fromDate: string,
  toDate: string,
  stateCode: IndiaStateCode | null,
): HolidayLookup {
  const covered =
    calendar.completeness === 'complete' &&
    calendar.coverage.fromDate <= fromDate &&
    calendar.coverage.toDate >= toDate;

  const upcoming = calendar.entries
    .filter((e) => e.date >= fromDate && e.date <= toDate)
    .filter((e) => e.states === null || (stateCode !== null && e.states.includes(stateCode)))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { upcoming, windowFullyCovered: covered };
}
