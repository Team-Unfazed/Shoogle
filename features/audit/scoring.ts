/**
 * Scoring and the four gates. docs/research/local-seo-methodology.md §3.
 *
 * ===========================================================================
 * THE DIRECTION OF THE COVERAGE GATE, STATED ONCE, IN WORDS
 * ===========================================================================
 *
 *     coverage = (weight we could actually MEASURE) / (weight that APPLIES)
 *
 * So coverage is HIGH when we know a lot and LOW when we know little, and the
 * gate is `coverage >= 0.70`: **more measurement lets a score out, less
 * measurement holds it back.** An earlier version of this spec had that
 * backwards, which would emit a confident number exactly when the app knew
 * least. `scoring.test.ts` pins the direction with an explicit monotonicity
 * assertion — measuring one more thing can never turn a scoreable audit into an
 * unscoreable one.
 *
 * The other invariant this file exists to hold: a `not_checked` check is in
 * NEITHER the numerator nor the denominator. It cannot pull the score down (that
 * would fabricate a problem) and cannot push it up (that would fabricate
 * health). It leaves the arithmetic entirely and is named out loud instead.
 */

import {
  AREA_LABEL,
  AREA_WEIGHT,
  HEAVY_AREAS,
  type AreaCoverage,
  type AuditArea,
  type AuditInput,
  type CheckResult,
  type GateId,
  type GateResult,
  type NotCheckedReason,
  type ScoreOutcome,
} from './types';
import { daysBetween } from './checks/helpers';
import { GATE_CHECK_ID } from './checks/registry';

/** Minimum share of applicable weight that must have been measured. §3.3 G-coverage. */
export const COVERAGE_GATE = 0.7;
/** Minimum coverage inside each area heavy enough to swing a score. §3.3 G-breadth. */
export const BREADTH_GATE = 0.5;
/** Contributing observations older than this make the score a claim about the past. */
export const FRESHNESS_MAX_DAYS = 7;

/** pass = 1, warn = its ratio, fail = 0. Nothing else earns anything. */
function credit(result: CheckResult): number {
  switch (result.outcome.kind) {
    case 'pass':
      return 1;
    case 'warn':
      return result.outcome.ratio;
    default:
      return 0;
  }
}

const isApplicable = (r: CheckResult): boolean => r.outcome.kind !== 'not_applicable';
/** "Ran" means we got an answer: pass, warn or fail. not_checked did not run. */
const ran = (r: CheckResult): boolean =>
  r.outcome.kind === 'pass' || r.outcome.kind === 'warn' || r.outcome.kind === 'fail';

function coverageForArea(area: AuditArea, results: readonly CheckResult[]): AreaCoverage {
  const inArea = results.filter((r) => r.check.area === area && r.check.scored);
  const applicable = inArea.filter(isApplicable);
  const measured = applicable.filter(ran);

  const applicableWeight = applicable.reduce((s, r) => s + r.check.weight, 0);
  const earnableWeight = measured.reduce((s, r) => s + r.check.weight, 0);
  const earnedWeight = measured.reduce((s, r) => s + r.check.weight * credit(r), 0);

  const notCheckedReasons: NotCheckedReason[] = [];
  for (const r of applicable) {
    if (r.outcome.kind === 'not_checked' && !notCheckedReasons.includes(r.outcome.reason)) {
      notCheckedReasons.push(r.outcome.reason);
    }
  }

  return {
    area,
    label: AREA_LABEL[area],
    applicableWeight,
    earnableWeight,
    earnedWeight,
    // Null, never 0: "nothing here applies to you" is not "we measured nothing here".
    coverage: applicableWeight > 0 ? earnableWeight / applicableWeight : null,
    // Null, never 0: a score of zero has to be earned by failing, not by absence.
    areaScore: earnableWeight > 0 ? earnedWeight / earnableWeight : null,
    checkedCount: measured.length,
    applicableCount: applicable.length,
    notCheckedReasons,
  };
}

/** Every observation a contributing check leaned on, with its age in days. */
function contributingObservationAges(
  results: readonly CheckResult[],
  input: AuditInput,
): { key: string; ageDays: number }[] {
  const ages = new Map<string, number>();
  for (const r of results) {
    if (!ran(r)) continue;
    for (const key of r.check.needs) {
      if (ages.has(key)) continue;
      const state = input.observations[key];
      if (state.status !== 'ready') continue;
      ages.set(key, daysBetween(state.fetchedAt, input.now));
    }
  }
  return [...ages.entries()].map(([key, ageDays]) => ({ key, ageDays }));
}

export function computeScore(results: readonly CheckResult[], input: AuditInput): ScoreOutcome {
  const areas = (Object.keys(AREA_WEIGHT) as AuditArea[]).map((a) => coverageForArea(a, results));

  const totalApplicableWeight = areas.reduce((s, a) => s + a.applicableWeight, 0);
  const totalEarnableWeight = areas.reduce((s, a) => s + a.earnableWeight, 0);
  const totalEarnedWeight = areas.reduce((s, a) => s + a.earnedWeight, 0);

  // Null, never 0: "no check applies to this business" is a different fact from
  // "we measured 0% of what applies". A 0 here would read as total ignorance.
  const overallCoverage =
    totalApplicableWeight > 0 ? totalEarnableWeight / totalApplicableWeight : null;

  const scored = results.filter((r) => r.check.scored);
  const applicableChecks = scored.filter(isApplicable);
  const ranChecks = applicableChecks.filter(ran);
  const notCheckedCount = applicableChecks.length - ranChecks.length;

  /* ---------------------------------------------------------------------- */
  /* The four gates (§3.3)                                                  */
  /* ---------------------------------------------------------------------- */

  const gates: GateResult[] = [];

  // G-identity — are we auditing a business at all?
  const gate = results.find((r) => r.check.id === GATE_CHECK_ID);
  const identityChecks = results.filter((r) => r.check.id === 'A2' || r.check.id === 'A3');
  const identityRan = identityChecks.some(ran);
  const gatePassed = gate !== undefined && gate.outcome.kind === 'pass';
  gates.push({
    id: 'G-identity',
    passed: gatePassed && identityRan,
    detail: !gatePassed
      ? 'No connected Google listing, so there is no business to score.'
      : identityRan
        ? 'A Google listing is connected and we could read something about it.'
        : 'A Google listing is connected, but we could not read a single thing about it.',
  });

  // G-coverage — is the number built on enough of the picture?
  // With nothing applicable there is no ratio to state, so the sentence has to
  // change rather than printing "0% of what applies to you", which is false.
  gates.push({
    id: 'G-coverage',
    passed: overallCoverage !== null && overallCoverage >= COVERAGE_GATE,
    detail:
      overallCoverage === null
        ? 'Nothing we check applies to this business yet, so there is nothing to build a score from.'
        : `We measured ${Math.round(overallCoverage * 100)}% of what applies to you; a score needs at least ${Math.round(
            COVERAGE_GATE * 100,
          )}%.`,
  });

  // G-breadth — is it spread across the areas that matter, or one loud corner?
  // An area where nothing applies (coverage === null) is exempt: a service-area
  // business with no address has not "failed to measure" its address.
  const thinAreas = areas.filter(
    (a) => HEAVY_AREAS.includes(a.area) && a.coverage !== null && a.coverage < BREADTH_GATE,
  );
  gates.push({
    id: 'G-breadth',
    passed: thinAreas.length === 0,
    detail:
      thinAreas.length === 0
        ? 'Every big area had enough measured to count.'
        : `We know too little about ${thinAreas.map((a) => a.label).join(', ')} for a single number to mean anything.`,
  });

  // G-freshness — is this a claim about now, or about last month?
  //
  // A timestamp we cannot parse produces a NaN age, and NaN fails every
  // comparison — so filtering `ageDays >= MAX` silently lets a corrupt
  // timestamp through as if it were fresh. An age we could not work out is an
  // UNKNOWN age, and an unknown age can never be evidence that the score is
  // about today. It fails the gate in its own right, with its own sentence.
  const ages = contributingObservationAges(results, input);
  const stale = ages.filter((o) => !Number.isNaN(o.ageDays) && o.ageDays >= FRESHNESS_MAX_DAYS);
  const undated = ages.filter((o) => Number.isNaN(o.ageDays));
  const freshnessProblems: string[] = [];
  if (stale.length > 0) {
    freshnessProblems.push(
      `some of it is over a week old (${stale.map((s) => `${s.key}: ${s.ageDays}d`).join(', ')})`,
    );
  }
  if (undated.length > 0) {
    freshnessProblems.push(
      `we could not tell how old some of it is (${undated.map((u) => u.key).join(', ')})`,
    );
  }
  gates.push({
    id: 'G-freshness',
    passed: freshnessProblems.length === 0,
    detail:
      freshnessProblems.length === 0
        ? 'Everything the score rests on was read in the last week.'
        : `This score rests on readings where ${freshnessProblems.join(', and ')}.`,
  });

  const failedGates = gates.filter((g) => !g.passed).map((g) => g.id as GateId);

  const score =
    failedGates.length === 0 && totalEarnableWeight > 0
      ? Math.round(100 * (totalEarnedWeight / totalEarnableWeight))
      : null;

  return {
    score,
    overallCoverage,
    totalApplicableWeight,
    totalEarnableWeight,
    totalEarnedWeight,
    areas,
    gates,
    failedGates,
    ranCount: ranChecks.length,
    applicableCount: applicableChecks.length,
    notCheckedCount,
  };
}

/**
 * The `uncheckedAreas` contract field (§3.4): every area we could not fully
 * measure, with the reason, in owner-facing words. Never silently empty — it is
 * empty only when every applicable check genuinely ran, and `uncheckedCount`
 * agreeing with it is asserted by a test.
 */
export function buildUncheckedAreas(
  areas: readonly AreaCoverage[],
  label: (reason: NotCheckedReason) => string,
): string[] {
  return areas
    .filter((a) => a.notCheckedReasons.length > 0)
    .map((a) => `${a.label} — ${a.notCheckedReasons.map(label).join(', ')}`);
}
