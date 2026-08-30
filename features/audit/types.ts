/**
 * features/audit — the audit engine's vocabulary. Owner: Pranay.
 *
 * Implements §1.1, §2 and §3.1 of docs/research/local-seo-methodology.md.
 *
 * These types are a feature-local SUPERSET of the shared contract. They compose
 * `AuditFinding` from `lib/providers/contracts.ts` (Sunny's file) and narrow back
 * to it at the provider boundary — nothing here asks for a change to `lib/`.
 *
 * The single rule the whole file exists to serve: a value we measured and a
 * value we could not measure are DIFFERENT FACTS, and both have to survive to
 * the pixel. `CheckOutcome` therefore has five members, not three, and
 * `not_checked` carries the reason it could not be checked.
 */

import type { AuditFinding, GbpReview } from '@/lib/providers/contracts';
import type { ConnectionInfo } from '@/lib/providers/types';
import type { DataState, UnavailableReason } from '@/lib/state/DataState';
import type { Business } from '@/types/domain';

/* -------------------------------------------------------------------------- */
/* Areas and weights (§3.1)                                                   */
/* -------------------------------------------------------------------------- */

export type AuditArea =
  | 'foundation'
  | 'nap'
  | 'categories'
  | 'hours'
  | 'media'
  | 'reviews'
  | 'posts'
  | 'description'
  | 'website';

/** §3.1. Sums to 100. Asserted by a test, not by a comment. */
export const AREA_WEIGHT: Record<AuditArea, number> = {
  foundation: 10,
  nap: 14,
  categories: 18,
  hours: 13,
  media: 9,
  reviews: 18,
  posts: 7,
  description: 7,
  website: 4,
};

/** Owner-facing area names. No jargon — §5.4 bans "NAP", "schema", "citations". */
export const AREA_LABEL: Record<AuditArea, string> = {
  foundation: 'Verification',
  nap: 'Address and phone',
  categories: 'Categories and services',
  hours: 'Hours',
  media: 'Photos',
  reviews: 'Reviews',
  posts: 'Google posts',
  description: 'Description',
  website: 'Website',
};

/** Areas heavy enough to individually gate a score (§3.3, G-breadth: weight >= 10). */
export const HEAVY_AREAS: readonly AuditArea[] = (Object.keys(AREA_WEIGHT) as AuditArea[]).filter(
  (a) => AREA_WEIGHT[a] >= 10,
);

/* -------------------------------------------------------------------------- */
/* Outcomes (§3.1)                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Why a check could not run.
 *
 * Reuses `UnavailableReason` verbatim so the audit's honesty vocabulary is the
 * app's honesty vocabulary, and adds the states `DataState` expresses
 * structurally rather than as a reason. Collapsing an `error` into
 * `'no_data_yet'` would tell the owner their profile is empty when in fact
 * Google did not answer — a different fact. Collapsing our own bug into
 * `'provider_error'` would blame Google for it — a third different fact.
 */
export type NotCheckedReason =
  | UnavailableReason
  | 'provider_error'
  | 'still_loading'
  /** A check threw. Our bug, not Google's silence, and it must not read as either. */
  | 'check_error';

export type CheckOutcome =
  | { kind: 'pass' }
  /** Partial credit. `ratio` is strictly between 0 and 1. */
  | { kind: 'warn'; ratio: number }
  /** We measured it and it is wrong. */
  | { kind: 'fail' }
  /** Does not apply to this business. Leaves the denominator entirely (§2.1). */
  | { kind: 'not_applicable'; why: string }
  /** We could not measure it. Never scored, always named (§1.2). */
  | { kind: 'not_checked'; reason: NotCheckedReason; detail: string };

export type OutcomeKind = CheckOutcome['kind'];

/* -------------------------------------------------------------------------- */
/* Findings (§1.1)                                                            */
/* -------------------------------------------------------------------------- */

export type Severity = AuditFinding['severity'];
export type Confidence = 'observed' | 'inferred';
export type FixMode = 'auto' | 'assisted' | 'guided' | 'owner';
export type SourceId =
  | 'gbp.info'
  | 'gbp.legacy'
  | 'gbp.perf'
  | 'gbp.verify'
  | 'web'
  | 'own'
  | 'registry';

/**
 * What a check hands back when it wants to say something to the owner.
 * `observation` is PERCEIVE output: what was literally seen, before any
 * interpretation. `evidence` is every data point the finding rests on.
 */
export interface FindingDraft {
  title: string;
  detail: string;
  observation: string;
  evidence: string[];
  /**
   * Overrides the check's declared severity for THIS finding.
   *
   * Used when a `warn` is a softer version of the same check's `fail`: "Google
   * says you are temporarily closed and you have never told us otherwise" is a
   * question, not an emergency, while "Google says closed and you told us you
   * are open" is an emergency. Same check, different severity.
   */
  severity?: Severity;
  /**
   * Overrides the check's declared confidence for THIS finding, for checks
   * where one branch is a direct observation and another is an inference.
   */
  confidence?: Confidence;
}

/** The contract type plus everything the engine needs to rank and justify it. */
export type ShoogleFinding = AuditFinding & {
  checkId: CheckId;
  area: AuditArea;
  /** PERCEIVE: what was literally seen. */
  observation: string;
  /** Every data point this finding rests on. */
  evidence: string[];
  /** `fetchedAt` of the observation this rests on. */
  observedAt: string;
  source: SourceId;
  fixMode: FixMode;
  /** "How would we know this was wrong?" — §1.1. */
  failureCheck: string;
  /** The Performance metric that should move if the fix worked. */
  leadingIndicator: string;
  confidence: Confidence;
  /**
   * True ONLY when the GBP capability matrix confirms the API exposes the write
   * AND a method for it exists on `GoogleBusinessProfileProvider`. A button is
   * only honest when both are true (CONTRIBUTING rule 7, no dead controls).
   */
  fixableByShoogle: boolean;
  /** §5.2 ordering score. Higher acts first. */
  priority: number;
};

/* -------------------------------------------------------------------------- */
/* Fix capability — derived from the GBP matrix, not from wishful thinking    */
/* -------------------------------------------------------------------------- */

/** Methods that actually exist on `GoogleBusinessProfileProvider` today. */
export type ProviderWriteMethod = 'replyToReview' | 'createLocalPost' | 'updateBusinessHours';

export interface FixCapability {
  /**
   * Does any Google API expose a write for this field?
   * Source: docs/research/google-business-profile.md §8, §9 and §14.
   */
  apiSupportsWrite: boolean;
  /**
   * The method on `GoogleBusinessProfileProvider` that performs it, or null when
   * the contract does not declare one yet. Null degrades the fix to `guided`.
   */
  providerMethod: ProviderWriteMethod | null;
  /** One line citing the matrix. Read this before flipping `apiSupportsWrite`. */
  matrixNote: string;
}

export const isFixableByShoogle = (c: FixCapability): boolean =>
  c.apiSupportsWrite && c.providerMethod !== null;

/* -------------------------------------------------------------------------- */
/* Observations — the engine's input. All DataState, no exceptions.           */
/* -------------------------------------------------------------------------- */

export type GbpBusinessType =
  | 'BUSINESS_TYPE_UNSPECIFIED'
  | 'CUSTOMER_LOCATION_ONLY'
  | 'CUSTOMER_AND_BUSINESS_LOCATION';

export interface PostalAddressObservation {
  addressLines: string[];
  locality: string | null;
  administrativeArea: string | null;
  postalCode: string | null;
  regionCode: string | null;
}

export interface LatLngObservation {
  latitude: number;
  longitude: number;
}

export interface GbpCategoryRef {
  categoryId: string;
  displayName: string;
}

export interface GbpServiceItemObservation {
  name: string;
  /** Price in paise. `null` is "no price set" — a measured absence. */
  priceInPaise: number | null;
}

export type WeekDay =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

/** Minutes from midnight, so 00:00 to 00:00 degeneracy is arithmetic, not string matching. */
export interface GbpTimePeriodObservation {
  day: WeekDay;
  openMinutes: number;
  closeMinutes: number;
}

export interface GbpSpecialHourPeriodObservation {
  /** ISO date, e.g. '2026-11-08'. */
  startDate: string;
  endDate: string;
  closed: boolean;
}

export interface GbpMoreHoursObservation {
  hoursTypeId: string;
  periodCount: number;
}

/**
 * The GBP `Location` fields the audit reads (Business Information API v1).
 *
 * Deliberately richer than the shared `GbpLocation` in contracts.ts, which is
 * Sunny's and stays untouched. `features/gbp/` maps the API response into this;
 * the engine never sees an HTTP response.
 *
 * Every field that Google may legitimately omit is `| null`, and null means
 * "Google returned this location and this field was absent" — a MEASURED
 * absence. A field we could not read at all is expressed by the whole
 * observation being `unavailable`, not by a null in here.
 */
export interface GbpLocationDetail {
  locationId: string;
  title: string | null;
  storefrontAddress: PostalAddressObservation | null;
  latLng: LatLngObservation | null;
  /** Geocode of `storefrontAddress`. Null = we did not geocode, so B3 cannot run. */
  geocodedAddressLatLng: LatLngObservation | null;
  primaryPhone: string | null;
  websiteUri: string | null;
  primaryCategory: GbpCategoryRef | null;
  additionalCategories: GbpCategoryRef[];
  serviceItems: GbpServiceItemObservation[];
  regularHourPeriods: GbpTimePeriodObservation[];
  specialHourPeriods: GbpSpecialHourPeriodObservation[];
  moreHours: GbpMoreHoursObservation[];
  serviceArea: { businessType: GbpBusinessType; placeCount: number } | null;
  profileDescription: string | null;
  attributeIds: string[];
  openInfo: { status: 'OPEN' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' } | null;
  metadata: {
    hasVoiceOfMerchant: boolean;
    canOperateLocalPost: boolean;
    canModifyServiceList: boolean;
    canHaveFoodMenus: boolean;
    placeId: string | null;
  };
}

/** Verifications API v1. */
export interface VerificationObservation {
  hasPendingVerification: boolean;
  pendingMethod: string | null;
}

export interface ReviewsObservation {
  items: GbpReview[];
  /**
   * §2 area F falsifiability: F3/F4 assume `reply` is populated for replies
   * posted OUTSIDE Shoogle. Until a known existing reply has been confirmed to
   * come back non-null, this is false and F3/F4 return `not_checked` rather than
   * nagging an owner who has already replied.
   */
  replyFieldTrusted: boolean;
}

export type MediaCategory =
  | 'COVER'
  | 'PROFILE'
  | 'LOGO'
  | 'EXTERIOR'
  | 'INTERIOR'
  | 'PRODUCT'
  | 'AT_WORK'
  | 'FOOD_AND_DRINK'
  | 'MENU'
  | 'COMMON_AREA'
  | 'TEAMS'
  | 'ADDITIONAL';

export interface MediaItemObservation {
  category: MediaCategory;
  createTime: string;
}

/**
 * `media.list` returns owner-uploaded items only — customer photos are not in
 * it (§2 area E falsifiability). Copy must say "photos you've added".
 */
export interface MediaObservation {
  ownerUploaded: MediaItemObservation[];
}

export interface LocalPostObservation {
  createTime: string;
  hasCallToAction: boolean;
}

export interface LocalPostsObservation {
  items: LocalPostObservation[];
}

export interface JsonLdLocalBusinessObservation {
  type: string;
  name: string | null;
  telephone: string | null;
  streetAddress: string | null;
  /** Decimal places actually present in the geo coordinates, or null if no geo block. */
  geoPrecision: number | null;
  hasOpeningHoursSpecification: boolean;
}

export interface WebsiteObservation {
  requestedUrl: string;
  /** What happened when we fetched it. `ok` means we got a response, whatever its status. */
  fetchOutcome: 'ok' | 'network_error' | 'tls_error';
  httpStatus: number | null;
  finalUrl: string | null;
  hasViewportMeta: boolean;
  /** Business name as it appears in title/footer/schema, or null if none found. */
  siteBusinessName: string | null;
  metaDescription: string | null;
  telLinkPresent: boolean;
  jsonLdLocalBusiness: JsonLdLocalBusinessObservation | null;
}

/** `attributes.list` for the primary category + region IN. Never hard-coded (§2 area H). */
export interface AttributeCatalogObservation {
  availableAttributeIds: string[];
  /** Attribute ids worth prompting about, from the catalog — not a hard-coded list. */
  highValueAttributeIds: string[];
  labelsById: Record<string, string>;
}

/**
 * Search-keyword impressions. Structurally identical to the union
 * `features/seo/` owns (docs/research/google-business-profile.md §7b): Google
 * returns EITHER an exact value OR a "the real number is below this" threshold.
 *
 * Rendering a threshold as a number fabricates data; rendering it as 0 breaks
 * "unknown is not zero" twice. Use `formatKeywordImpressions`.
 */
export type AuditKeywordImpressions =
  | { kind: 'exact'; uniqueUsers: number }
  | { kind: 'below_threshold'; threshold: number };

export interface KeywordEvidenceObservation {
  keyword: string;
  impressions: AuditKeywordImpressions;
}

/** Renders "<15" for a threshold. Never "15", never "0". */
export function formatKeywordImpressions(i: AuditKeywordImpressions): string {
  return i.kind === 'exact' ? String(i.uniqueUsers) : `<${i.threshold}`;
}

export type IndiaStateCode =
  | 'MH'
  | 'KL'
  | 'TN'
  | 'WB'
  | 'DL'
  | 'KA'
  | 'GJ'
  | 'UP'
  | 'RJ'
  | 'TS'
  | 'AP'
  | 'PB'
  | 'HR'
  | 'MP'
  | 'BR'
  | 'OR'
  | 'AS'
  | 'JH'
  | 'CT'
  | 'UK'
  | 'HP'
  | 'GA'
  | 'JK';

/**
 * What Shoogle itself knows, as opposed to what Google says.
 *
 * Every "did the owner confirm X?" field is `boolean | null` where **null means
 * we never asked**. That is not the same as `false` ("the owner said no"), and
 * the two lead to different outcomes: never-asked produces a partial-credit
 * `warn` carrying an in-context question, a definite `false` produces a `fail`.
 */
export interface OwnerContext {
  business: Business;
  /** Name the owner gave Shoogle, if different from `business.name`. */
  declaredName: string | null;
  /** Services the owner described to Shoogle. Empty array = they told us none. */
  declaredServices: string[];
  /** Owner's own statement of trading status. Null = never asked. */
  declaredOpenStatus: 'open' | 'temporarily_closed' | 'permanently_closed' | null;
  /** Owner confirmed they genuinely trade 24x7. Null = never asked. */
  confirmed24x7: boolean | null;
  /** Owner confirmed they genuinely never close a weekly day. Null = never asked. */
  confirmedNoWeeklyClosure: boolean | null;
  /** For the state-aware festival calendar (D3). Null = we do not know the state. */
  stateCode: IndiaStateCode | null;
  /** §5.3.6 — dismissal is data. Suppresses a finding until the observation changes. */
  dismissedCheckIds: string[];
}

export interface ObservationValues {
  owner: OwnerContext;
  connection: ConnectionInfo;
  locations: { locationIds: string[] };
  location: GbpLocationDetail;
  verification: VerificationObservation;
  reviews: ReviewsObservation;
  media: MediaObservation;
  localPosts: LocalPostsObservation;
  website: WebsiteObservation;
  attributeCatalog: AttributeCatalogObservation;
  searchKeywords: KeywordEvidenceObservation[];
}

export type ObservationKey = keyof ObservationValues;

export type AuditObservations = {
  [K in ObservationKey]: DataState<ObservationValues[K]>;
};

export interface AuditInput {
  /** ISO timestamp. Injected — the engine is pure and never reads the clock. */
  now: string;
  observations: AuditObservations;
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

export type CheckId =
  | 'A1'
  | 'A2'
  | 'A3'
  | 'B1'
  | 'B2'
  | 'B3'
  | 'B4'
  | 'B5'
  | 'B6'
  | 'C1'
  | 'C2'
  | 'C3'
  | 'C4'
  | 'C5'
  | 'D1'
  | 'D2'
  | 'D3'
  | 'D4'
  | 'E1'
  | 'E2'
  | 'E3'
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'G1'
  | 'G2'
  | 'H1'
  | 'H2'
  | 'H3'
  | 'I1'
  | 'I2'
  | 'I3';

export interface CheckContext {
  now: string;
  observations: AuditObservations;
}

export type CheckEvaluation =
  | { outcome: { kind: 'pass' } }
  | { outcome: { kind: 'not_applicable'; why: string } }
  | { outcome: { kind: 'not_checked'; reason: NotCheckedReason; detail: string } }
  | { outcome: { kind: 'warn'; ratio: number }; finding: FindingDraft }
  | { outcome: { kind: 'fail' }; finding: FindingDraft };

export interface CheckDefinition {
  id: CheckId;
  area: AuditArea;
  /** §2 weight. 0 for the unscored gate check A1. */
  weight: number;
  /** False only for A1, the gate: it decides whether scoring happens at all. */
  scored: boolean;
  /** Internal short name for logs and tests. Not owner-facing. */
  name: string;
  severity: Severity;
  confidence: Confidence;
  /** What the fix WOULD be with full write access. Degraded by `capability`. */
  intendedFixMode: FixMode;
  capability: FixCapability;
  sources: readonly SourceId[];
  needs: readonly ObservationKey[];
  leadingIndicator: string;
  failureCheck: string;
  /** §5.3.3 — at most one category-change proposal survives per run. */
  proposesCategoryChange?: boolean;
  evaluate(ctx: CheckContext): CheckEvaluation;
}

export interface CheckResult {
  check: CheckDefinition;
  outcome: CheckOutcome;
  /** Null for pass / not_applicable / not_checked. A finding is never invented. */
  finding: ShoogleFinding | null;
}

/* -------------------------------------------------------------------------- */
/* Scoring output                                                             */
/* -------------------------------------------------------------------------- */

export interface AreaCoverage {
  area: AuditArea;
  label: string;
  /** Weight of checks that apply to this business (not_applicable excluded). */
  applicableWeight: number;
  /** Weight of applicable checks we could actually measure. */
  earnableWeight: number;
  earnedWeight: number;
  /**
   * earnableWeight / applicableWeight. `null` — never 0 — when nothing applies,
   * because "no checks apply here" is not "we measured nothing here".
   */
  coverage: number | null;
  /** earned / earnable, or null when nothing was measurable. Never 0 from absence. */
  areaScore: number | null;
  checkedCount: number;
  applicableCount: number;
  notCheckedReasons: NotCheckedReason[];
}

export type GateId = 'G-identity' | 'G-coverage' | 'G-breadth' | 'G-freshness';

export interface GateResult {
  id: GateId;
  passed: boolean;
  /** Plain-English statement of what was and was not true. */
  detail: string;
}

export interface ScoreOutcome {
  /** 0-100, or null when any gate failed. Never a number derived from absence. */
  score: number | null;
  /** Sum of earnable / sum of applicable across all areas. 0 when nothing applied. */
  overallCoverage: number;
  totalApplicableWeight: number;
  totalEarnableWeight: number;
  totalEarnedWeight: number;
  areas: AreaCoverage[];
  gates: GateResult[];
  failedGates: GateId[];
  /** Number of scored checks that ran (pass/warn/fail). */
  ranCount: number;
  /** Number of scored checks that apply to this business. */
  applicableCount: number;
  /** Number of scored checks we could not measure. Feeds `<Score uncheckedCount>`. */
  notCheckedCount: number;
}
