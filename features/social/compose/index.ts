/**
 * features/social/compose — the compose flow's state and behaviour.
 * Owner: Yash.
 *
 * The screen in `app/social/compose.tsx` renders this and decides nothing
 * itself, the same split the Posts tab uses. That is what lets product rule 13
 * be asserted in a unit test rather than argued about in a screenshot.
 */

export {
  advanceBlockedReason,
  blockerFor,
  COMPOSE_STEPS,
  composeReducer,
  composedContent,
  contentFor,
  draftFor,
  initialComposeState,
  nextStep,
  previousStep,
  reviewFor,
  selectedDrafts,
  STEP_TITLE,
  toDraftPost,
  type ComposeDraft,
  type ComposeEvent,
  type ComposeState,
  type ComposeStep,
  type DraftStatus,
  type FacebookDraft,
  type GbpDraft,
  type InstagramDraft,
} from './state';

export { useCompose, type UseCompose, type UseComposeOptions } from './useCompose';
