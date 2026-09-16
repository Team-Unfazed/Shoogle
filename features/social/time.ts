/**
 * Schedule formatting, in the business's timezone. Owner: Yash.
 *
 * A shop owner in Nerul schedules a post for 9am. If they open the app from a
 * train in Ahmedabad, or their phone is set to UTC, that post must still say
 * 9am. So every label here is computed in `Schedule.timeZone` — the IANA zone
 * stored with the post — and never in the device's zone.
 *
 * `Intl.DateTimeFormat` with a `timeZone` is the only correct way to do this.
 * Hermes on Android provides it. If a build ever lands where it does not, or
 * the stored zone is not one this device knows, `zonedParts` falls back to UTC
 * and every label is suffixed " UTC" — a visibly wrong-looking label the owner
 * can report, rather than a plausible-looking time that is silently five and a
 * half hours out.
 */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  /** Three-letter weekday, e.g. "Wed". */
  weekday: string;
  /** 1-12, matching the 12-hour clock the labels use. */
  hour12: number;
  minute: string;
  /** "AM" or "PM". */
  dayPeriod: string;
  /** True when the timezone could not be applied and this is UTC instead. */
  fellBackToUtc: boolean;
}

const UTC_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function utcParts(date: Date): ZonedParts {
  const rawHour = date.getUTCHours();
  const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: UTC_WEEKDAYS[date.getUTCDay()] ?? '',
    hour12,
    minute: String(date.getUTCMinutes()).padStart(2, '0'),
    dayPeriod: rawHour < 12 ? 'AM' : 'PM',
    fellBackToUtc: true,
  };
}

/**
 * Break an instant into calendar parts as seen in `timeZone`.
 *
 * Returns UTC parts with `fellBackToUtc: true` when the instant is invalid or
 * the zone is unusable. Callers must surface that rather than hide it.
 */
export function zonedParts(iso: string, timeZone: string): ZonedParts {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return utcParts(new Date(0));

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);
  } catch {
    // Unknown zone, or a runtime without timezone-aware Intl.
    return utcParts(date);
  }

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const hour = Number.parseInt(read('hour'), 10);
  const year = Number.parseInt(read('year'), 10);
  const month = Number.parseInt(read('month'), 10);
  const day = Number.parseInt(read('day'), 10);

  if (Number.isNaN(hour) || Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return utcParts(date);
  }

  return {
    year,
    month,
    day,
    weekday: read('weekday'),
    // `hour12: true` already yields 1-12; guard anyway so a 24-hour locale
    // fallback cannot render "0:00 AM".
    hour12: hour % 12 === 0 ? 12 : hour % 12,
    minute: read('minute') || '00',
    dayPeriod: (read('dayPeriod') || (hour < 12 ? 'AM' : 'PM')).toUpperCase(),
    fellBackToUtc: false,
  };
}

/** 0-23, reconstructed from the 12-hour parts. */
function hour24(parts: ZonedParts): number {
  const base = parts.hour12 % 12;
  return parts.dayPeriod === 'PM' ? base + 12 : base;
}

/**
 * The instant at which a wall clock in `timeZone` reads the given date and
 * time — the inverse of `zonedParts`.
 *
 * The composer needs this: an owner picks "Wednesday, 9:00 am" and Shoogle has
 * to store a UTC instant. Doing it by adding a fixed offset would be a claim
 * about that zone's rules; instead this converges on the answer by asking the
 * platform what its own conversion produced and correcting the difference.
 * Two passes are enough to land on either side of a DST change.
 */
export function instantAtZonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): string {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = zonedParts(new Date(guess).toISOString(), timeZone);
    const produced = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      hour24(parts),
      Number.parseInt(parts.minute, 10),
    );
    if (produced === wanted) break;
    guess += wanted - produced;
  }
  return new Date(guess).toISOString();
}

/** The calendar date `days` after today, as seen in `timeZone`. */
export function zonedDateAhead(
  now: Date,
  days: number,
  timeZone: string,
): { year: number; month: number; day: number } {
  const today = zonedParts(now.toISOString(), timeZone);
  const shifted = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** "9:00 AM", suffixed " UTC" when the timezone could not be applied. */
export function formatClock(parts: ZonedParts): string {
  const base = `${parts.hour12}:${parts.minute} ${parts.dayPeriod}`;
  return parts.fellBackToUtc ? `${base} UTC` : base;
}

/**
 * A list row's schedule label: "Wed · 9:00 AM".
 *
 * Deliberately has no date. A post more than a week out is rare in this
 * product, and the composer shows the full date; the list optimises for the
 * question the owner actually asks, which is "what goes out next".
 */
export function formatScheduleLabel(iso: string, timeZone: string): string {
  const parts = zonedParts(iso, timeZone);
  return `${parts.weekday} · ${formatClock(parts)}`;
}

/** Calendar days from `from` to `to`, both read in `timeZone`. */
export function calendarDayDelta(fromIso: string, toIso: string, timeZone: string): number {
  const from = zonedParts(fromIso, timeZone);
  const to = zonedParts(toIso, timeZone);
  const asDay = (p: ZonedParts): number => Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
  return Math.round(asDay(to) - asDay(from));
}

/**
 * The next-up banner: "NEXT UP · TOMORROW 9:00 AM".
 *
 * "TODAY" / "TOMORROW" are computed against the real clock in the business's
 * timezone, so the words are true whenever they appear. Anything further out
 * names the weekday instead of guessing at a friendlier phrasing.
 */
export function formatNextUpLabel(iso: string, timeZone: string, now: Date): string {
  const parts = zonedParts(iso, timeZone);
  const delta = calendarDayDelta(now.toISOString(), iso, timeZone);

  let day: string;
  if (delta === 0) day = 'TODAY';
  else if (delta === 1) day = 'TOMORROW';
  else day = parts.weekday.toUpperCase();

  return `NEXT UP · ${day} ${formatClock(parts)}`;
}
