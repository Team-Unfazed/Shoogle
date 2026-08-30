/**
 * Opening-hours validation. Owner: Pranay.
 *
 * `BusinessProvider.updateBusinessHours(locationId, hours: unknown)` takes
 * `unknown` on the shared contract, so this feature is the last line of defence
 * before an owner's opening hours are PATCHed onto a live Google listing. A
 * malformed period silently dropped here becomes a shop that Google says is
 * closed on Saturday.
 *
 * So: validate strictly, reject loudly, never coerce. No `any`, no casts.
 */

import type { GbpBusinessHours, GbpDayOfWeek, GbpTimePeriod, GoogleTimeOfDay } from './types';

const DAYS: readonly GbpDayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDay(value: unknown): value is GbpDayOfWeek {
  return typeof value === 'string' && DAYS.includes(value as GbpDayOfWeek);
}

function parseTimeOfDay(value: unknown, field: string): GoogleTimeOfDay | string {
  if (!isRecord(value)) return `${field} must be an object with hours and minutes.`;
  const hours = value['hours'];
  const minutes = value['minutes'];

  // Google's TimeOfDay omits zero fields, so an absent `hours` legitimately
  // means midnight. An absent value is only rejected when BOTH are missing.
  if (hours === undefined && minutes === undefined) {
    return `${field} has neither hours nor minutes.`;
  }
  if (hours !== undefined && (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 0 || hours > 23)) {
    return `${field}.hours must be a whole number from 0 to 23.`;
  }
  if (
    minutes !== undefined &&
    (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 0 || minutes > 59)
  ) {
    return `${field}.minutes must be a whole number from 0 to 59.`;
  }

  const parsed: GoogleTimeOfDay = {};
  if (typeof hours === 'number') parsed.hours = hours;
  if (typeof minutes === 'number') parsed.minutes = minutes;
  return parsed;
}

export type ParsedHours =
  | { ok: true; hours: GbpBusinessHours }
  | { ok: false; reason: string };

/**
 * Validate an opening-hours payload into the exact shape Business Information
 * expects. Every failure names the field, because the resulting error is shown
 * to whoever is building the screen, not swallowed.
 */
export function parseBusinessHours(input: unknown): ParsedHours {
  if (!isRecord(input)) {
    return { ok: false, reason: 'Opening hours must be an object with a periods array.' };
  }
  const rawPeriods = input['periods'];
  if (!Array.isArray(rawPeriods)) {
    return { ok: false, reason: 'Opening hours must contain a periods array.' };
  }
  // An empty array is a real instruction ("no regular hours"), not a mistake,
  // and Google accepts it. Do not reject it.

  const periods: GbpTimePeriod[] = [];
  for (let index = 0; index < rawPeriods.length; index += 1) {
    const raw: unknown = rawPeriods[index];
    if (!isRecord(raw)) {
      return { ok: false, reason: `periods[${index}] must be an object.` };
    }
    const openDay = raw['openDay'];
    const closeDay = raw['closeDay'];
    if (!isDay(openDay)) {
      return { ok: false, reason: `periods[${index}].openDay must be a day of the week.` };
    }
    if (!isDay(closeDay)) {
      return { ok: false, reason: `periods[${index}].closeDay must be a day of the week.` };
    }

    const openTime = parseTimeOfDay(raw['openTime'], `periods[${index}].openTime`);
    if (typeof openTime === 'string') return { ok: false, reason: openTime };
    const closeTime = parseTimeOfDay(raw['closeTime'], `periods[${index}].closeTime`);
    if (typeof closeTime === 'string') return { ok: false, reason: closeTime };

    periods.push({ openDay, openTime, closeDay, closeTime });
  }

  return { ok: true, hours: { periods } };
}
