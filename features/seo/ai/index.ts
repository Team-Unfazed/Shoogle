/**
 * features/seo/ai — the AI layer. Owner: Pranay.
 *
 * Four of the five surfaces here need no model, no credentials and no money:
 * the visibility check, the schema generator, the directory checklist and the
 * readability observations are deterministic analyses. Only `generateText` on
 * `AiProvider` involves a model, and today the only implementation of that is a
 * development-only client that refuses real customer data.
 */

export {
  AI_READY,
  FIXTURE_MARKER,
  NO_AI_PROVIDER_MESSAGE,
  aiBlocked,
  customerInput,
  fixtureInput,
  noAiProvider,
  readinessToUnavailable,
  type AiDataClassification,
  type AiProvider,
  type AiProviderId,
  type AiReadiness,
  type AiRequestEnvelope,
  type AiTask,
  type AiTextRequest,
  type AiTextResult,
} from './contract';

export {
  DEFAULT_GEMINI_MODEL,
  FORBIDDEN_PUBLIC_KEY_VARIABLE,
  GEMINI_KEY_VARIABLE,
  REFUSAL_FIXTURE_MODE_OFF,
  REFUSAL_MISSING_MARKER,
  REFUSAL_NOT_DEV,
  REFUSAL_NOT_FIXTURE_DATA,
  REFUSAL_NO_KEY,
  REFUSAL_PUBLIC_KEY,
  assertNoPublicGeminiKey,
  createGeminiAiProvider,
  defaultGeminiRuntime,
  geminiAiProvider,
  type GeminiRuntime,
} from './gemini';

export {
  NO_WEBSITE_MESSAGE,
  checkAiVisibility,
  fetchPageSnapshot,
  runAiVisibilityCheck,
  type AiVisibilityReport,
  type FetchLike,
  type MinimalResponse,
} from './visibility';

export {
  SCHEMA_HONEST_FRAMING,
  SCHEMA_TYPE_ALTERNATIVES,
  SCHEMA_TYPE_BY_CATEGORY,
  buildLocalBusinessSchema,
  hasSufficientGeoPrecision,
  inspectJsonLd,
  isIndianE164,
  isIndianPin,
  serializeLocalBusinessSchema,
  type DayOfWeek,
  type GeoPoint,
  type JsonLdInspection,
  type JsonLdVerdict,
  type LocalBusinessSchemaInput,
  type LocalBusinessSchemaResult,
  type LocalBusinessType,
  type OpeningHoursSpec,
} from './schema';

export {
  INDIA_DIRECTORIES,
  describeDirectoryCoverage,
  directoriesFor,
  directoryChecklist,
  directoryCoverage,
  type CrawlerEvidence,
  type DirectoryChecklistRow,
  type DirectoryCoverage,
  type DirectoryEntry,
  type DirectoryId,
  type DirectoryPresence,
} from './directories';

export {
  CITED_PASSAGE_WORD_BAND,
  observeReadability,
  type ReadabilityInput,
  type ReadabilityObservation,
  type ReadabilityResult,
} from './readability';

export {
  AI_SEARCH_CRAWLERS,
  aiCrawlerAccess,
  blockedSearchCrawlers,
  crawlerAccess,
  parseRobotsTxt,
  type AiCrawlerId,
  type CrawlerAccess,
  type CrawlerDescription,
  type RobotsFile,
} from './robots';

export type { Heading, PageSnapshot } from './html';
