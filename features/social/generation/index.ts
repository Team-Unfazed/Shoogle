/**
 * features/social/generation — platform-specific content generation.
 * Owner: Yash.
 *
 * No file in here reads, names or holds an API key. Generation goes through
 * Pranay's `AiProvider` seam, which is the single door out to a model in this
 * repository and the place the data-classification guards stand.
 */

export {
  assertableFacts,
  hasOffer,
  OBJECTIVE_LABEL,
  placeLabel,
  type BusinessContext,
  type BusinessOffer,
  type ContentObjective,
  type ContentObjectiveKind,
} from './context';

export {
  AI_CLICHES,
  burstiness,
  HOLLOW_OPENERS,
  KEYWORD_FREE_USES,
  MAX_KEYWORD_SHARE,
  MIN_BURSTINESS,
  reviewHumanness,
  sentences,
  words,
  type HumanizeCode,
  type HumanizeFinding,
  type HumanizeReport,
} from './humanize';

export {
  namesUnlistedService,
  reviewFabrication,
  type FabricationCode,
  type FabricationFinding,
  type FabricationReport,
} from './fabrication';

export { facebookPrompt } from './prompts/facebook';
export { gbpPrompt } from './prompts/gbp';
export { instagramPrompt } from './prompts/instagram';
export { factSheet, factsFor, languageLine, objectiveLine } from './prompts/shared';

export {
  createSocialGenerator,
  GENERATION_REFUSED_MESSAGE,
  judgeDraft,
  promptFor,
  type DraftVerdict,
  type PlatformDraft,
  type PromptOptions,
  type SocialGeneratorDeps,
} from './generator';

export {
  createDevProxyAiProvider,
  defaultDevProxyRuntime,
  DEV_PROXY_URL_VARIABLE,
  REFUSAL_MISSING_MARKER as DEV_PROXY_REFUSAL_MISSING_MARKER,
  REFUSAL_NO_PROXY_URL,
  REFUSAL_NOT_DEV as DEV_PROXY_REFUSAL_NOT_DEV,
  REFUSAL_NOT_FIXTURE_DATA as DEV_PROXY_REFUSAL_NOT_FIXTURE_DATA,
  type DevProxyRuntime,
  type ProxyFetch,
} from './devProxyProvider';
