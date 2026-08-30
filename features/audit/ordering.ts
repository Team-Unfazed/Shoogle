/**
 * Ordering. docs/research/local-seo-methodology.md §5.
 *
 * "The owner will act on two or three things. Ordering is the feature."
 *
 * The formula from §5.2 is:
 *
 *     priority = severityWeight × confidenceFactor × fixability ÷ effort
 *
 * `fixability` deliberately rewards what Shoogle can do FOR the owner, and
 * `effort` is measured in minutes of the owner's time — a one-tap fix and a trip
 * to the bank are not the same recommendation at identical severity.
 *
 * The formula orders findings WITHIN a severity band, not across them. §5.1
 * defines `critical` as "a customer is being lost or misled today" and `minor`
 * as "never surfaced above the fold", so a one-tap `important` must not be
 * allowed to outrank an unanswered 1-star review just because it is cheap. The
 * hard rules in §5.3 then override everything.
 */

import type { CheckDefinition, Confidence, FixMode, Severity, ShoogleFinding } from './types';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 100,
  important: 40,
  minor: 10,
};

const CONFIDENCE_FACTOR: Record<Confidence, number> = {
  observed: 1.0,
  inferred: 0.6,
};

const FIXABILITY: Record<FixMode, number> = {
  auto: 1.3,
  assisted: 1.2,
  guided: 1.0,
  owner: 0.8,
};

/** Minutes of the owner's time. */
const EFFORT_MINUTES: Record<FixMode, number> = {
  auto: 1,
  assisted: 2,
  guided: 5,
  owner: 15,
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, important: 1, minor: 2 };
const CONFIDENCE_RANK: Record<Confidence, number> = { observed: 0, inferred: 1 };

/** §5.3.5 — the Business tab shows three, then "{n} more things to check". */
export const TOP_FINDINGS_COUNT = 3;

export function computePriority(input: {
  severity: Severity;
  confidence: Confidence;
  fixMode: FixMode;
}): number {
  const value =
    (SEVERITY_WEIGHT[input.severity] *
      CONFIDENCE_FACTOR[input.confidence] *
      FIXABILITY[input.fixMode]) /
    EFFORT_MINUTES[input.fixMode];
  return Math.round(value * 100) / 100;
}

/**
 * Degrades the intended fix mode to what Shoogle can honestly offer.
 *
 * `owner` never degrades — no API supplies a real-world fact only the owner has.
 * Everything else falls back to `guided` unless BOTH the GBP capability matrix
 * confirms the write exists AND the provider contract declares a method for it.
 * §5.3.7: never surface a fix whose write path does not exist.
 */
export function resolveFixMode(check: CheckDefinition, fixable: boolean): FixMode {
  if (check.intendedFixMode === 'owner') return 'owner';
  return fixable ? check.intendedFixMode : 'guided';
}

/** §5.3.1 — the connect finding is the precondition for everything else. */
const isGateFinding = (f: ShoogleFinding): boolean => f.checkId === 'A1';
/** §5.3.2 — an unverified listing blocks most writes, so it outranks everything. */
const isBlockingVerification = (f: ShoogleFinding): boolean =>
  f.checkId === 'A2' && f.severity === 'critical';

function pinRank(f: ShoogleFinding): number {
  if (isGateFinding(f)) return 0;
  if (isBlockingVerification(f)) return 1;
  return 2;
}

/**
 * §5.3.3 — one category-change proposal per run. Two at once is a coin flip
 * presented as advice. Keeps the highest-priority one.
 */
function keepOneCategoryProposal(findings: readonly ShoogleFinding[]): ShoogleFinding[] {
  const proposals = findings.filter((f) => f.checkId === 'C2');
  if (proposals.length <= 1) return [...findings];
  const best = proposals.reduce((a, b) => (b.priority > a.priority ? b : a));
  return findings.filter((f) => f.checkId !== 'C2' || f === best);
}

/**
 * Total order over findings. Transitive by construction — every term is a number
 * compared in a fixed sequence, so no pair of findings can disagree about which
 * comes first depending on what else is in the list.
 */
export function orderFindings(findings: readonly ShoogleFinding[]): ShoogleFinding[] {
  return keepOneCategoryProposal(findings).sort((a, b) => {
    const pin = pinRank(a) - pinRank(b);
    if (pin !== 0) return pin;

    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;

    // §5.3.4 — observed beats inferred at equal severity, regardless of formula.
    const confidence = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    if (confidence !== 0) return confidence;

    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.checkId.localeCompare(b.checkId);
  });
}

/** §5.3.5 — top three, then a fold. The count is the product decision, not the UI's. */
export function splitForDisplay(findings: readonly ShoogleFinding[]): {
  top: ShoogleFinding[];
  remaining: ShoogleFinding[];
} {
  return {
    top: findings.slice(0, TOP_FINDINGS_COUNT),
    remaining: findings.slice(TOP_FINDINGS_COUNT),
  };
}

/**
 * §5.3.5 — notifications fire only for `critical`, at most one per day. Exported
 * so the decision lives with the ordering rules rather than in a screen.
 */
export function notifiableFindings(findings: readonly ShoogleFinding[]): ShoogleFinding[] {
  return findings.filter((f) => f.severity === 'critical').slice(0, 1);
}
