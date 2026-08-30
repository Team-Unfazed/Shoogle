/**
 * Opening hours and festival closures, as facts rather than as a form.
 * Owner: Pranay.
 *
 * WHY SPECIAL HOURS ARE THE WHOLE POINT
 * -------------------------------------
 * `docs/research/google-business-profile.md` §9 calls `specialHours` "the
 * highest-value automation for Indian festival closures", and it is right for a
 * blunt reason: Google keeps showing "Open now" from `regularHours` unless a
 * special-hours entry overrides it. A salon shut for Ganpati with nothing set is
 * actively telling customers to come. They arrive, find a shut door, and the
 * one-star review lands the same evening.
 *
 * WHAT THIS MODULE REFUSES TO DO
 * ------------------------------
 * 1. It never turns "Google returned no hours" into "closed all week". Those are
 *    different facts. `regularHours` absent means hours are NOT SET; a day with
 *    no period inside a set of hours means CLOSED that day. Both are rendered,
 *    differently.
 * 2. It never silently drops a period it cannot read. A period with no day, or
 *    with an unreadable time, is COUNTED, and the count travels with the result
 *    so a screen can say the table is incomplete.
 * 3. It never says "no festival is coming". `INDIA_HOLIDAY_CALENDAR` is marked
 *    `completeness: 'partial'` — every festival that actually closes an Indian
 *    shop (Diwali, Ganpati, Eid, Onam, Pongal, Gudi Padwa) moves against the
 *    Gregorian calendar, and Shoogle has no maintained source for those dates.
 *    So an empty result means "Shoogle does not know", and this module makes
 *    that impossible to render as reassurance.
 *
 * The holiday calendar is imported from its data module rather than through
 * `@/features/audit`, whose barrel also exports React components this file has
 * no business pulling in.
 */

import {
  findHolidaysInWindow,
  INDIA_HOLIDAY_CALENDAR,
  type HolidayCalendar,
  type HolidayEntry,
} from '@/features/audit/data/india-holidays';

import type {
  GbpDayOfWeek,
  GbpLocationWire,
  GbpSpecialHourPeriod,
  GbpTimePeriod,
  GoogleDate,
  GoogleTimeOfDay,
} from '../../types';

/**
 * The state code type without importing a name `features/audit` does not
 * export. Derived from the function that consumes it, so it cannot drift.
 */
export type HolidayStateCode = Parameters<typeof findHolidaysInWindow>[3];

/* -------------------------------------------------------------------------- */
/* Time formatting                                                            */
/* -------------------------------------------------------------------------- */

export const WEEK_ORDER: readonly GbpDayOfWeek[] = Object.freeze([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export const DAY_LABEL: Readonly<Record<GbpDayOfWeek, string>> = Object.freeze({
  DAY_OF_WEEK_UNSPECIFIED: 'Unspecified day',
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
});

/**
 * `google.type.TimeOfDay` omits zero fields, so an absent `hours` is genuinely
 * midnight — not a missing value. An out-of-range field is not: it is returned
 * as null so the caller counts the period as unreadable instead of clamping it.
 */
export function formatTimeOfDay(time: GoogleTimeOfDay | undefined): string | null {
  if (time === undefined) return null;
  const hours = time.hours ?? 0;
  const minutes = time.minutes ?? 0;
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;

  const suffix = hours < 12 ? 'am' : 'pm';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${`${minutes}`.padStart(2, '0')} ${suffix}`;
}

/** `google.type.Date` to `YYYY-MM-DD`, or null when Google sent a partial date. */
export function formatGoogleDate(date: GoogleDate | undefined): string | null {
  if (date === undefined) return null;
  const { year, month, day } = date;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year === undefined ||
    month === undefined ||
    day === undefined
  ) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Regular hours                                                              */
/* -------------------------------------------------------------------------- */

export interface HoursSlot {
  open: string;
  close: string;
  /** True when the period runs past midnight into the following day. */
  crossesMidnight: boolean;
}

export interface DayHours {
  day: GbpDayOfWeek;
  label: string;
  /** Empty means CLOSED on this day — a measurement, not an absence. */
  slots: readonly HoursSlot[];
}

export type RegularHoursReading =
  /** Google was asked and returned no regular hours. Hours are not set at all. */
  | { kind: 'not_set' }
  | {
      kind: 'set';
      days: readonly DayHours[];
      /** Periods Google sent that Shoogle could not read. The table is short by this many. */
      unreadablePeriods: number;
    };

function readPeriod(period: GbpTimePeriod): { day: GbpDayOfWeek; slot: HoursSlot } | null {
  const openDay = period.openDay;
  if (openDay === undefined || openDay === 'DAY_OF_WEEK_UNSPECIFIED') return null;
  const open = formatTimeOfDay(period.openTime);
  const close = formatTimeOfDay(period.closeTime);
  if (open === null || close === null) return null;
  const closeDay = period.closeDay;
  const crossesMidnight = closeDay !== undefined && closeDay !== openDay;
  return { day: openDay, slot: { open, close, crossesMidnight } };
}

export function readRegularHours(wire: GbpLocationWire): RegularHoursReading {
  const periods = wire.regularHours?.periods ?? [];
  if (periods.length === 0) return { kind: 'not_set' };

  const byDay = new Map<GbpDayOfWeek, HoursSlot[]>();
  let unreadablePeriods = 0;
  for (const period of periods) {
    const parsed = readPeriod(period);
    if (parsed === null) {
      unreadablePeriods += 1;
      continue;
    }
    const existing = byDay.get(parsed.day);
    if (existing === undefined) byDay.set(parsed.day, [parsed.slot]);
    else existing.push(parsed.slot);
  }

  const days: DayHours[] = WEEK_ORDER.map((day) => ({
    day,
    label: DAY_LABEL[day],
    slots: byDay.get(day) ?? [],
  }));

  return { kind: 'set', days, unreadablePeriods };
}

/** "Closed" vs "9:00 am – 8:00 pm". Never "0" and never blank. */
export function describeDay(day: DayHours): string {
  if (day.slots.length === 0) return 'Closed';
  return day.slots
    .map((slot) => `${slot.open} – ${slot.close}${slot.crossesMidnight ? ' (next day)' : ''}`)
    .join(', ');
}

/* -------------------------------------------------------------------------- */
/* Special hours                                                              */
/* -------------------------------------------------------------------------- */

export interface SpecialHourEntry {
  startDate: string;
  endDate: string;
  /** True when the business is shut for the whole day. */
  closed: boolean;
  /** Null when closed, or when Google sent no readable times. */
  open: string | null;
  close: string | null;
}

export type SpecialHoursReading =
  /** Google was asked and returned none. No holiday dates are set. */
  | { kind: 'none_set' }
  | {
      kind: 'set';
      entries: readonly SpecialHourEntry[];
      unreadableEntries: number;
    };

function readSpecialPeriod(period: GbpSpecialHourPeriod): SpecialHourEntry | null {
  const startDate = formatGoogleDate(period.startDate);
  if (startDate === null) return null;
  // Google omits `endDate` for single-day overrides; the start date is then
  // also the end date. That is the message's own convention, not a guess.
  const endDate = formatGoogleDate(period.endDate) ?? startDate;
  const closed = period.closed === true;
  return {
    startDate,
    endDate,
    closed,
    open: closed ? null : formatTimeOfDay(period.openTime),
    close: closed ? null : formatTimeOfDay(period.closeTime),
  };
}

export function readSpecialHours(wire: GbpLocationWire): SpecialHoursReading {
  const periods = wire.specialHours?.specialHourPeriods ?? [];
  if (periods.length === 0) return { kind: 'none_set' };

  const entries: SpecialHourEntry[] = [];
  let unreadableEntries = 0;
  for (const period of periods) {
    const parsed = readSpecialPeriod(period);
    if (parsed === null) unreadableEntries += 1;
    else entries.push(parsed);
  }
  entries.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return { kind: 'set', entries, unreadableEntries };
}

export function describeSpecialHourEntry(entry: SpecialHourEntry): string {
  if (entry.closed) return 'Closed all day';
  if (entry.open !== null && entry.close !== null) return `${entry.open} – ${entry.close}`;
  // Google said this is not a closure but gave no usable times. We will not
  // guess "normal hours" — that is exactly the day an owner gets caught out.
  return 'Google set special hours here but did not report the times.';
}

/* -------------------------------------------------------------------------- */
/* Festival prompts                                                           */
/* -------------------------------------------------------------------------- */

export type FestivalCoverage =
  /** A special-hours entry covers this date. */
  | { kind: 'covered'; entry: SpecialHourEntry }
  /** Special hours were read, and none of them covers this date. A measurement. */
  | { kind: 'not_covered' }
  /** Special hours could not be read, so coverage cannot be established. */
  | { kind: 'unknown' };

export interface FestivalPrompt {
  holiday: HolidayEntry;
  coverage: FestivalCoverage;
}

export interface FestivalPromptSet {
  prompts: readonly FestivalPrompt[];
  /**
   * True only when the calendar claims completeness across the whole window.
   * While it is false — which is today, and will be until someone resolves open
   * question 5 in the research doc — an EMPTY `prompts` proves nothing, and the
   * screen must say so instead of reading as "you are all set".
   */
  windowFullyCovered: boolean;
  calendarVersion: string;
  windowFrom: string;
  windowTo: string;
}

/** ISO date `days` after `fromDate`, computed in UTC so no timezone drifts it. */
export function addDays(fromDate: string, days: number): string {
  const parsed = Date.parse(`${fromDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return fromDate;
  const moved = new Date(parsed + days * 86_400_000);
  const year = moved.getUTCFullYear();
  const month = `${moved.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${moved.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface FestivalPromptOptions {
  /** Today, as `YYYY-MM-DD`. Injected so this stays pure and testable. */
  today: string;
  /** How far ahead to look. */
  horizonDays?: number;
  /** Null returns national holidays only — the business's state is never guessed. */
  stateCode: HolidayStateCode;
  specialHours: SpecialHoursReading;
  calendar?: HolidayCalendar;
}

function coverageFor(date: string, specialHours: SpecialHoursReading): FestivalCoverage {
  if (specialHours.kind === 'none_set') return { kind: 'not_covered' };
  if (specialHours.unreadableEntries > 0) {
    // Some of the owner's holiday dates could not be read. One of them might be
    // this one, so "not covered" would be a claim we cannot support.
    const found = specialHours.entries.find(
      (entry) => entry.startDate <= date && date <= entry.endDate,
    );
    return found === undefined ? { kind: 'unknown' } : { kind: 'covered', entry: found };
  }
  const found = specialHours.entries.find(
    (entry) => entry.startDate <= date && date <= entry.endDate,
  );
  return found === undefined ? { kind: 'not_covered' } : { kind: 'covered', entry: found };
}

export function buildFestivalPrompts(options: FestivalPromptOptions): FestivalPromptSet {
  const calendar = options.calendar ?? INDIA_HOLIDAY_CALENDAR;
  const horizonDays = options.horizonDays ?? 90;
  const windowFrom = options.today;
  const windowTo = addDays(options.today, horizonDays);

  const lookup = findHolidaysInWindow(calendar, windowFrom, windowTo, options.stateCode);

  return {
    prompts: lookup.upcoming.map((holiday) => ({
      holiday,
      coverage: coverageFor(holiday.date, options.specialHours),
    })),
    windowFullyCovered: lookup.windowFullyCovered,
    calendarVersion: calendar.version,
    windowFrom,
    windowTo,
  };
}

/**
 * The sentence that stops an empty festival list from reading as reassurance.
 *
 * This is the honest core of the whole hours screen: Shoogle knows the fixed
 * dates and openly does not know the moving ones.
 */
export const PARTIAL_CALENDAR_CAVEAT =
  'This list only covers holidays with a fixed date. Diwali, Ganpati, Eid, Onam, Pongal and Gudi Padwa move ' +
  'every year, and Shoogle has no maintained source for those dates yet — so it cannot tell you one is ' +
  'coming, and an empty list here does not mean you are clear. Add those dates yourself.';

export const COMPLETE_CALENDAR_NOTE =
  'This calendar covers the whole window, so an empty list here genuinely means no holiday is coming.';
