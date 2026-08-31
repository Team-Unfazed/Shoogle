/**
 * features/audit/components — the audit's view layer. Owner: Pranay.
 *
 * These render an `AuditRun` and nothing else: they take no props that are not
 * on the run, they do no fetching, and they do no re-ordering. `orderFindings`
 * has already applied the §5.3 hard rules, so a component that sorted would
 * silently undo them.
 *
 * Each state of the report has its own component so the four cannot converge
 * into one apologetic grey box:
 *
 *   AuditSkeleton           we are still reading
 *   AuditNotRun             there is nothing to read yet
 *   InsufficientDataPanel   we read some of it, and it is not enough to score
 *   ScoreHero               we read enough, and here is the number
 *
 * `UncheckedAreasCard` and `CoverageByArea` are shared by the last two: a score
 * built on partial signals has to say so just as loudly as a missing one.
 */

export { AuditNotRun, type AuditNotRunProps } from './AuditNotRun';
export { AuditSkeleton } from './AuditSkeleton';
export { AuditSummaryCard, type AuditSummaryCardProps } from './AuditSummaryCard';
export { CoverageByArea, type CoverageByAreaProps } from './CoverageByArea';
export { FindingCard, type FindingCardProps } from './FindingCard';
export { FindingsList, type FindingsListProps } from './FindingsList';
export {
  InsufficientDataPanel,
  type InsufficientDataPanelProps,
} from './InsufficientDataPanel';
export { ScoreHero, type ScoreHeroProps } from './ScoreHero';
export { UncheckedAreasCard, type UncheckedAreasCardProps } from './UncheckedAreasCard';
