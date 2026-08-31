/**
 * The business-profile editor's internal surface. Owner: Pranay.
 *
 * `app/seo/profile.tsx`, `app/seo/hours.tsx` and `app/seo/areas.tsx` import from
 * here. Nothing outside `features/gbp/` should: the feature's public surface is
 * `@/features/gbp`, and these pieces are deliberately not on it — they are the
 * inside of one screen group, not a contract.
 */

export {
  buildProfileFields,
  completenessSentence,
  describeProvenance,
  describeWritePath,
  FIELD_UNKNOWN_COPY,
  PROFILE_FIELD_SPECS,
  PROFILE_FIELD_SPEC_BY_ID,
  provenanceFor,
  readFieldValue,
  REQUESTED_LOCATION_FIELDS,
  summariseCompleteness,
  summariseWriteCoverage,
  writeCoverageSentence,
  writePathFor,
  type FieldProvenance,
  type FieldUnknownReason,
  type FieldValue,
  type GoogleWriteMethod,
  type ProfileCompleteness,
  type ProfileFieldId,
  type ProfileFieldSpec,
  type ProfileFieldView,
  type ProfileWriteMethod,
  type WriteCoverage,
  type WritePath,
} from './fields';

/**
 * Re-exported so the screens in `app/seo/` reach one import path rather than
 * two. `mappers.ts` is this feature's own file; the barrel is just the door.
 */
export { toGoogleUpdatedDiff } from '../../mappers';

export {
  describeBusinessType,
  readServiceArea,
  type ServiceAreaBusinessType,
  type ServiceAreaObservation,
  type ServiceAreaPlace,
} from './serviceArea';

export {
  addDays,
  buildFestivalPrompts,
  COMPLETE_CALENDAR_NOTE,
  DAY_LABEL,
  describeDay,
  describeSpecialHourEntry,
  formatGoogleDate,
  formatTimeOfDay,
  PARTIAL_CALENDAR_CAVEAT,
  readRegularHours,
  readSpecialHours,
  WEEK_ORDER,
  type DayHours,
  type FestivalCoverage,
  type FestivalPrompt,
  type FestivalPromptSet,
  type HolidayStateCode,
  type HoursSlot,
  type RegularHoursReading,
  type SpecialHourEntry,
  type SpecialHoursReading,
} from './hoursModel';

export {
  ACCEPTED_NOT_LIVE_NOTE,
  describeEditStatus,
  planSentence,
  QUEUE_EXPLAINER,
  readQueueBudget,
  runEditPlan,
  summarisePlan,
  type EditAcceptance,
  type EditProgress,
  type EditStatus,
  type PlanSummary,
  type PlannedEdit,
  type QueueBudget,
  type RunEditPlanOptions,
} from './writePlan';

export {
  CompletenessCard,
  CountChip,
  GoogleChangedCard,
  ProfileFieldCard,
  ProfileNavRow,
  VerificationNotice,
  WritePlanCard,
} from './ProfileParts';

export {
  FestivalPromptsCard,
  GuidedSteps,
  RegularHoursCard,
  SpecialHoursCard,
} from './HoursParts';

export { ServiceAreaCard } from './AreaParts';
