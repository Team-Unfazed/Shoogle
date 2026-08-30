/**
 * features/audit — public surface. Owner: Pranay.
 *
 * The audit engine turns whatever is known about a business into a score plus
 * ranked, actionable findings. It is pure: data in, report out, no I/O, no
 * React, no clock. `features/gbp/` supplies the observations; the Business tab
 * renders the run.
 *
 * Read docs/research/local-seo-methodology.md before changing any of it. The
 * two rules that are not negotiable:
 *
 *   - `fail` (we measured it and it is wrong) and `not_checked` (we could not
 *     measure it) are different outcomes with different consequences. A
 *     not_checked never scores as a fail and never scores as a pass.
 *   - A score is emitted only when enough weight was genuinely measurable.
 *     Below the gate the report is `unavailable('insufficient_data', …)` and the
 *     findings from checks that DID run are still returned.
 */

export { runAuditEngine, type AuditEngineOptions, type AuditRun } from './engine';

export {
  BREADTH_GATE,
  COVERAGE_GATE,
  FRESHNESS_MAX_DAYS,
  buildUncheckedAreas,
  computeScore,
} from './scoring';

export {
  TOP_FINDINGS_COUNT,
  computePriority,
  notifiableFindings,
  orderFindings,
  resolveFixMode,
  splitForDisplay,
} from './ordering';

export { ALL_CHECKS, CHECKS_BY_ID, GATE_CHECK_ID, validateRegistry } from './checks/registry';

export {
  coverageSentence,
  insufficientDataMessage,
  notCheckedReasonBody,
  notCheckedReasonLabel,
} from './copy';

export {
  INDIA_HOLIDAY_CALENDAR,
  findHolidaysInWindow,
  type HolidayCalendar,
  type HolidayEntry,
} from './data/india-holidays';

export {
  AREA_LABEL,
  AREA_WEIGHT,
  HEAVY_AREAS,
  formatKeywordImpressions,
  isFixableByShoogle,
  type AreaCoverage,
  type AuditArea,
  type AuditInput,
  type AuditKeywordImpressions,
  type AuditObservations,
  type AttributeCatalogObservation,
  type CheckDefinition,
  type CheckId,
  type CheckOutcome,
  type CheckResult,
  type Confidence,
  type FixCapability,
  type FixMode,
  type GateId,
  type GateResult,
  type GbpLocationDetail,
  type KeywordEvidenceObservation,
  type LocalPostsObservation,
  type MediaObservation,
  type NotCheckedReason,
  type ObservationKey,
  type ObservationValues,
  type OwnerContext,
  type ReviewsObservation,
  type ScoreOutcome,
  type Severity,
  type ShoogleFinding,
  type SourceId,
  type VerificationObservation,
  type WebsiteObservation,
} from './types';
