/**
 * The Shoogle Agent surface. Owner: Pranay.
 *
 * `app/seo/agent.tsx` imports from here and nothing deeper, so the screen sees
 * one public surface rather than five file paths.
 *
 * The pure model (`model.ts`) sits beside the components on purpose: every
 * status string, every result label and every runway rule is presentation of a
 * fact, and keeping them together means a screen cannot render a state the
 * model does not define, or define one the screen cannot render.
 */

export { ActionsFeed, AgentFeedEmpty } from './ActionsFeed';
export { AgentStateLedger, AgentStatusCard } from './AgentStatusCard';
export { PauseCard } from './PauseCard';
export { RunwayCard } from './RunwayCard';

export type { ActionsFeedProps } from './ActionsFeed';
export type { AgentStatusCardProps } from './AgentStatusCard';
export type { PauseCardProps } from './PauseCard';
export type { RunwayCardProps } from './RunwayCard';

export {
  AGENT_ACTION_KIND_ORDER,
  AGENT_PLANNED_WORK,
  AGENT_STATUS_LEDGER,
  PAUSE_DOES_NOT_STOP,
  PAUSE_STOPS,
  agentWorkLabel,
  computeRunway,
  describeActionResult,
  describeAgentStatus,
  describeRunway,
  formatAgentDay,
  formatAgentTimelineDay,
  resolveAgentStatus,
  sortActionsNewestFirst,
  summariseActions,
  type AgentAction,
  type AgentActionKind,
  type AgentActionLink,
  type AgentActionResult,
  type AgentActionResultKind,
  type AgentLastPublished,
  type AgentPausePreference,
  type AgentQuota,
  type AgentRunway,
  type AgentScheduledItem,
  type AgentStatus,
  type AgentStatusDescription,
  type AgentStatusInputs,
  type AgentStatusKind,
  type AgentStatusResolution,
  type AgentTarget,
  type AgentWorkDefinition,
  type RunwayDescription,
  type RunwayInputs,
} from './model';

export {
  AGENT_PAUSE_STORAGE_KEY,
  deviceAgentPauseStorage,
  parsePausePreference,
  useAgentPause,
  type AgentPauseStorage,
  type PauseWriteOutcome,
  type UseAgentPauseOptions,
  type UseAgentPauseResult,
} from './pausePreference';
