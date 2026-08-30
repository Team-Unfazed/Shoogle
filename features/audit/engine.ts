/**
 * The audit engine. Owner: Pranay.
 *
 * PURE. Data in, report out. No network, no storage, no React, no `Date.now()` —
 * the current time is an input. Everything here is synchronously testable, and
 * `features/gbp/` is responsible for turning provider responses into the
 * `AuditObservations` this consumes.
 *
 * What the engine guarantees, and what the tests pin:
 *
 *  1. `fail` and `not_checked` are never confused. A check we could not run
 *     contributes nothing to the score in either direction and is named in
 *     `uncheckedAreas` instead.
 *  2. A measured zero produces a finding; an unknown never does. "You have no
 *     reviews" and "we could not read your reviews" are different sentences.
 *  3. A score is emitted only when all four gates in §3.3 pass. Otherwise the
 *     report is `unavailable('insufficient_data', …)` — and the findings from
 *     checks that DID run come back anyway, because a missing number must never
 *     suppress a real problem.
 *  4. Nothing is marked fixable by Shoogle unless the GBP capability matrix
 *     confirms the write exists AND the provider contract declares a method.
 */

import type { AuditFinding, AuditReport } from '@/lib/providers/contracts';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';

import { ALL_CHECKS } from './checks/registry';
import { insufficientDataMessage, notCheckedReasonLabel } from './copy';
import { orderFindings, computePriority, resolveFixMode } from './ordering';
import { buildUncheckedAreas, computeScore } from './scoring';
import {
  isFixableByShoogle,
  type AuditInput,
  type CheckDefinition,
  type CheckEvaluation,
  type CheckId,
  type CheckResult,
  type ScoreOutcome,
  type ShoogleFinding,
} from './types';

export interface AuditEngineOptions {
  /**
   * Resolves a route the owner can open to fix a finding.
   *
   * Defaults to "no route", deliberately. The engine does not know which screens
   * exist, and inventing an href to a route that has not been built is a dead
   * control (CONTRIBUTING rule 7) and a typed-routes failure waiting to happen.
   * The screen that renders findings passes this in.
   */
  fixHrefFor?: (checkId: CheckId) => string | null;
  /** Restrict the run to a subset of checks. Used by tests, not by the app. */
  only?: readonly CheckId[];
}

export interface AuditRun {
  /**
   * The contract-shaped report. `unavailable('insufficient_data', …)` when the
   * score gates fail — never a report carrying a fabricated or placeholder
   * score, because `AuditReport.score` is `number` and there is no honest number
   * to put there.
   */
  report: DataState<AuditReport>;
  /**
   * Findings from every check that actually ran, ordered. ALWAYS returned, even
   * when `report` is unavailable. §3.3: "a missing score never suppresses a real
   * problem."
   */
  findings: ShoogleFinding[];
  /** Every check with its outcome, for the per-area coverage strip and for tests. */
  results: CheckResult[];
  score: ScoreOutcome;
  /** Owner-facing "Reviews — not connected" lines. Never silently empty. */
  uncheckedAreas: string[];
  /** Feeds `<Score uncheckedCount={…} />`. */
  uncheckedCount: number;
}

/**
 * Runs one check, converting a thrown error into an honest `not_checked`.
 *
 * The reason is `check_error`, NOT `provider_error`: a bug in our own check is
 * not Google failing to answer, and telling the owner it was would be a false
 * statement about their listing. It is also not a fail — we learned nothing
 * about the business, so nothing about the business may be scored.
 */
function evaluateSafely(check: CheckDefinition, input: AuditInput): CheckEvaluation {
  try {
    return check.evaluate({ now: input.now, observations: input.observations });
  } catch (error) {
    return {
      outcome: {
        kind: 'not_checked',
        reason: 'check_error',
        detail: `This check could not complete: ${
          error instanceof Error ? error.message : 'unknown reason'
        }`,
      },
    };
  }
}

/** `fetchedAt` of the first observation this check leaned on, else the run time. */
function observedAtFor(check: CheckDefinition, input: AuditInput): string {
  for (const key of check.needs) {
    const state = input.observations[key];
    if (state.status === 'ready') return state.fetchedAt;
  }
  return input.now;
}

function anyContributingFixture(results: readonly CheckResult[], input: AuditInput): boolean {
  for (const r of results) {
    if (r.outcome.kind === 'not_checked' || r.outcome.kind === 'not_applicable') continue;
    for (const key of r.check.needs) {
      const state = input.observations[key];
      if (state.status === 'ready' && state.isFixture === true) return true;
    }
  }
  return false;
}

function dismissedCheckIds(input: AuditInput): readonly string[] {
  const owner = input.observations.owner;
  return owner.status === 'ready' ? owner.value.dismissedCheckIds : [];
}

export function runAuditEngine(input: AuditInput, options: AuditEngineOptions = {}): AuditRun {
  const fixHrefFor = options.fixHrefFor ?? (() => null);
  const checks =
    options.only === undefined
      ? ALL_CHECKS
      : ALL_CHECKS.filter((c) => options.only?.includes(c.id) === true);

  const dismissed = dismissedCheckIds(input);
  const results: CheckResult[] = [];

  for (const check of checks) {
    const evaluation = evaluateSafely(check, input);

    // Narrowing on `finding` rather than on the nested outcome kind: the two
    // union members that carry a finding are exactly the two that can produce
    // one, so a pass or a not_checked can never smuggle a finding through.
    if (!('finding' in evaluation)) {
      results.push({ check, outcome: evaluation.outcome, finding: null });
      continue;
    }

    const draft = evaluation.finding;
    const severity = draft.severity ?? check.severity;
    const confidence = draft.confidence ?? check.confidence;

    // §5.3.6 — dismissal is data. An inferred finding the owner has already
    // judged is removed from the denominator rather than re-raised: they
    // adjudicated it, so it is not applicable to them, and it is not a fail.
    if (confidence === 'inferred' && dismissed.includes(check.id)) {
      results.push({
        check,
        outcome: {
          kind: 'not_applicable',
          why: 'You told us this one is fine, so we stopped checking it.',
        },
        finding: null,
      });
      continue;
    }

    const fixable = isFixableByShoogle(check.capability);
    const fixMode = resolveFixMode(check, fixable);
    const finding: ShoogleFinding = {
      id: check.id,
      title: draft.title,
      detail: draft.detail,
      severity,
      fixHref: fixHrefFor(check.id),
      checkId: check.id,
      area: check.area,
      observation: draft.observation,
      evidence: draft.evidence,
      observedAt: observedAtFor(check, input),
      source: check.sources[0] ?? 'own',
      fixMode,
      failureCheck: check.failureCheck,
      leadingIndicator: check.leadingIndicator,
      confidence,
      fixableByShoogle: fixable,
      priority: computePriority({ severity, confidence, fixMode }),
    };

    results.push({ check, outcome: evaluation.outcome, finding });
  }

  const score = computeScore(results, input);
  const findings = orderFindings(
    results.map((r) => r.finding).filter((f): f is ShoogleFinding => f !== null),
  );
  const uncheckedAreas = buildUncheckedAreas(score.areas, notCheckedReasonLabel);
  const contractFindings: AuditFinding[] = findings.map((f) => ({
    id: f.id,
    title: f.title,
    detail: f.detail,
    severity: f.severity,
    fixHref: f.fixHref,
  }));

  const report: DataState<AuditReport> =
    score.score === null
      ? unavailable('insufficient_data', insufficientDataMessage(score.ranCount, score.applicableCount))
      : ready<AuditReport>(
          {
            score: score.score,
            uncheckedAreas,
            findings: contractFindings,
            generatedAt: input.now,
          },
          input.now,
          anyContributingFixture(results, input),
        );

  return {
    report,
    findings,
    results,
    score,
    uncheckedAreas,
    uncheckedCount: score.notCheckedCount,
  };
}
