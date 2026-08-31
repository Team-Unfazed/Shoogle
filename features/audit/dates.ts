/**
 * The single home for date arithmetic across Pranay's three features.
 *
 * WHY THIS EXISTS
 * ---------------
 * `daysBetween` and `addDays` were each implemented more than once, with
 * DIFFERENT behaviour on bad input:
 *
 *   daysBetween  features/audit/checks/helpers.ts   returned NaN
 *                features/gbp/components/media/     returned null
 *   addDays      features/audit/checks/helpers.ts   threw
 *                features/gbp/.../hoursModel.ts     returned a string
 *                features/gbp/performance.ts        (as addDaysIso)
 *
 * That is the same failure this codebase already hit with three copies of
 * `formatKeywordImpressions`: a shared concept with several homes drifts, and
 * the drift shows up as two screens disagreeing about the same fact. A NaN
 * leaking into a comparison is worse still — `NaN >= 7` is false, so a corrupt
 * timestamp silently passed the audit's freshness gate.
 *
 * This module lives in `features/audit/` because the dependency graph already
 * runs gbp -> audit (hoursModel imports the India holiday data), and audit
 * imports neither gbp nor seo. Putting it here keeps the graph acyclic.
 *
 * THE CONTRACT: unparseable input returns `null`, never NaN and never a
 * fabricated date. Callers must handle null — which is the point, because an
 * unreadable date is unknown, and unknown is never zero.
 */

export const MS_PER_DAY = 86_400_000;

/**
 * Whole days from `fromIso` to `toIso`, negative when `toIso` is earlier.
 * Returns null when either timestamp cannot be parsed.
 *
 * Null rather than NaN deliberately: NaN survives every comparison as `false`,
 * so a corrupt date quietly behaves like a fresh one. Null forces the caller to
 * decide what an unreadable date means.
 */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / MS_PER_DAY);
}

/**
 * Adds whole days to a `YYYY-MM-DD` date or an RFC 3339 timestamp, returning
 * `YYYY-MM-DD`. Returns null when the input cannot be parsed or `days` is not
 * a finite integer.
 *
 * UTC throughout: these dates come from Google and are compared against other
 * Google dates, so introducing a local timezone would shift a day boundary and
 * make "closed tomorrow" wrong for exactly the businesses this app serves.
 */
export function addDays(from: string, days: number): string | null {
  if (!Number.isInteger(days)) return null;
  const parsed = Date.parse(from);
  if (Number.isNaN(parsed)) return null;
  const shifted = new Date(parsed + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}

/** True when `iso` parses. Useful where a caller only needs the yes/no. */
export function isParsableDate(iso: string): boolean {
  return !Number.isNaN(Date.parse(iso));
}
