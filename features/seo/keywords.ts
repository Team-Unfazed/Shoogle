/**
 * Constructors, parsers and formatters for the search-keyword impressions
 * union. Owner: Pranay.
 *
 * The rule this file exists to enforce: a `below_threshold` reading is a BOUND,
 * not a count. It renders as `<15`. Never `15`, never `0`, never a bar on a
 * chart whose height claims to be 15.
 */

import type { KeywordImpressionRow, KeywordImpressions, RawInsightsValue } from './types';

/* -------------------------------------------------------------------------- */
/* Constructors                                                               */
/* -------------------------------------------------------------------------- */

/**
 * An exact count Google measured. `0` is legal and meaningful here: it is a
 * measured zero, which is a different fact from "we do not know".
 */
export function exactImpressions(value: number): KeywordImpressions | null {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return { kind: 'exact', value };
}

/**
 * A lower bound. `threshold` must be at least 1 — "below 0" is not a statement
 * any real API makes and would be indistinguishable from nonsense.
 */
export function belowThresholdImpressions(threshold: number): KeywordImpressions | null {
  if (!Number.isSafeInteger(threshold) || threshold < 1) return null;
  return { kind: 'below_threshold', threshold };
}

/* -------------------------------------------------------------------------- */
/* Parsing the wire shape                                                     */
/* -------------------------------------------------------------------------- */

function toFiniteInteger(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isSafeInteger(raw) ? raw : null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // int64 fields arrive as decimal strings. Reject anything else outright
  // rather than letting Number() coerce '' or '1e3' into a plausible-looking
  // count.
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Parse `SearchKeywordCount.insightsValue`.
 *
 * Returns `null` when the payload carries neither member, carries both, or
 * carries something unparseable. `null` means "we did not learn anything from
 * this row" and the caller must drop the row or surface an unavailable state —
 * it must NOT substitute a zero.
 */
export function parseInsightsValue(raw: RawInsightsValue | null | undefined): KeywordImpressions | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;

  const exact = toFiniteInteger(raw.value);
  const threshold = toFiniteInteger(raw.threshold);

  // Exactly one member is expected. Both present means we cannot tell which
  // Google meant, and guessing would fabricate precision.
  if (exact !== null && threshold !== null) return null;
  if (exact !== null) return exactImpressions(exact);
  if (threshold !== null) return belowThresholdImpressions(threshold);
  return null;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Thousands grouping done by hand rather than via `Intl`, because Hermes ships
 * a variable ICU surface across Android versions and a metric that renders
 * differently on two phones is a support ticket.
 */
export function groupThousands(value: number): string {
  if (!Number.isFinite(value)) return '';
  const negative = value < 0;
  const digits = Math.abs(Math.trunc(value)).toString();
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    out += digits[i] ?? '';
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ',';
  }
  return negative ? `-${out}` : out;
}

/**
 * The one sanctioned way to put keyword impressions on screen.
 *
 * `{ kind: 'exact', value: 1240 }`        -> `'1,240'`
 * `{ kind: 'exact', value: 0 }`           -> `'0'`      (measured zero — real)
 * `{ kind: 'below_threshold', 15 }`       -> `'<15'`
 */
export function formatKeywordImpressions(impressions: KeywordImpressions): string {
  switch (impressions.kind) {
    case 'exact':
      return groupThousands(impressions.value);
    case 'below_threshold':
      return `<${groupThousands(impressions.threshold)}`;
  }
}

/**
 * Longer form for accessibility labels and for the caption under a value, where
 * `<15` on its own would read as a broken number.
 */
export function describeKeywordImpressions(impressions: KeywordImpressions): string {
  switch (impressions.kind) {
    case 'exact':
      return impressions.value === 1
        ? '1 person searched this term'
        : `${groupThousands(impressions.value)} people searched this term`;
    case 'below_threshold':
      return `Fewer than ${groupThousands(impressions.threshold)} people — Google does not report exact counts this low`;
  }
}

/** True when the reading is a bound rather than a count. Drives the caption. */
export function isBelowThreshold(impressions: KeywordImpressions): boolean {
  return impressions.kind === 'below_threshold';
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sort keyword rows for display without pretending a bound is a number.
 *
 * Exact readings sort above bounded ones, because we know a bounded reading is
 * strictly below its threshold but not by how much — so `<15` cannot be
 * confidently placed against an exact `12`. Within each kind, larger first,
 * then alphabetically so the order is stable.
 */
export function compareKeywordRows(a: KeywordImpressionRow, b: KeywordImpressionRow): number {
  const rank = (row: KeywordImpressionRow): number => (row.impressions.kind === 'exact' ? 0 : 1);
  const rankDelta = rank(a) - rank(b);
  if (rankDelta !== 0) return rankDelta;

  const magnitude = (row: KeywordImpressionRow): number =>
    row.impressions.kind === 'exact' ? row.impressions.value : row.impressions.threshold;
  const magnitudeDelta = magnitude(b) - magnitude(a);
  if (magnitudeDelta !== 0) return magnitudeDelta;

  return a.keyword.localeCompare(b.keyword);
}

/**
 * How many rows in a report are bounded rather than exact.
 *
 * This is a count of ROWS, not an estimate of traffic. There is deliberately no
 * function here that sums a keyword report: adding `<15` to `1,240` produces a
 * number Google never reported.
 */
export function countBelowThreshold(rows: readonly KeywordImpressionRow[]): number {
  return rows.filter((row) => row.impressions.kind === 'below_threshold').length;
}
