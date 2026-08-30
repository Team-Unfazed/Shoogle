/**
 * Google Business Profile — the endpoint map. Owner: Pranay.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * "The Business Profile API" is not one API. Google split the monolithic
 * My Business API v4 into per-domain v1 APIs on SEPARATE HOSTNAMES, and left
 * v4.9 alive for the three resources that never got a v1 home (reviews,
 * localPosts, media). Hard-coding one base URL would be wrong for most calls.
 *
 * Every entry below is traceable to `docs/research/google-business-profile.md`,
 * which is the authority for this feature. Nothing here performs I/O — it
 * builds descriptors that `provider.ts` hands to an injected transport.
 *
 * Sources (first-party, via the research doc):
 *   https://developers.google.com/my-business/ref_overview
 *   https://developers.google.com/my-business/content/limits
 */

/* -------------------------------------------------------------------------- */
/* OAuth                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The single scope for EVERY Business Profile API.
 *
 * `https://www.googleapis.com/auth/plus.business.manage` is still accepted by
 * some v4 methods but is a Google+ era relic — requesting it adds consent
 * screen surface for nothing. Do not add it.
 */
export const GBP_OAUTH_SCOPE = 'https://www.googleapis.com/auth/business.manage';

/**
 * Token exchange and refresh MUST happen server-side.
 *
 * `CLAUDE.md` § Secrets forbids `GOOGLE_OAUTH_CLIENT_SECRET` from reaching the
 * device, and every `EXPO_PUBLIC_*` value ships readable inside the APK. The
 * app may only ever hold a short-lived access token handed to it by our own
 * backend. This constant exists so the requirement is greppable, not so it is
 * enforced here — nothing in this folder can enforce it.
 */
export const GBP_TOKEN_EXCHANGE_IS_SERVER_SIDE = true;

/* -------------------------------------------------------------------------- */
/* Hosts                                                                      */
/* -------------------------------------------------------------------------- */

/** Which Google API a call belongs to. Quota is counted per API, per §10. */
export type GbpApiFamily =
  /** v4.9 legacy: reviews, localPosts, media. Still live; accounts.* deprecated. */
  | 'legacy_v4'
  | 'account_management_v1'
  | 'business_information_v1'
  | 'performance_v1'
  | 'verifications_v1';

export const GBP_HOSTS: Readonly<Record<GbpApiFamily, string>> = Object.freeze({
  legacy_v4: 'https://mybusiness.googleapis.com',
  account_management_v1: 'https://mybusinessaccountmanagement.googleapis.com',
  business_information_v1: 'https://mybusinessbusinessinformation.googleapis.com',
  performance_v1: 'https://businessprofileperformance.googleapis.com',
  verifications_v1: 'https://mybusinessverifications.googleapis.com',
});

/* -------------------------------------------------------------------------- */
/* Quota                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Reads: 300 queries per minute, per API. Reads are NOT the tight constraint,
 * and must NOT be serialised behind the write queue.
 */
export const GBP_READ_QPM_PER_API = 300;

/**
 * Business Information **EDITS**: 10 per minute per Google Business Profile,
 * and Google states this "cannot be increased".
 *
 * READ THIS BEFORE CHANGING ANY THROTTLING CODE: an earlier draft of the
 * research applied this ceiling to reads. It does not. It applies to edits of
 * one profile. That is why `writeQueue.ts` exists and there is no read queue.
 */
export const GBP_EDIT_QPM_PER_PROFILE = 10;

/** Business Information per-operation daily caps. */
export const GBP_DAILY_CAPS = Object.freeze({
  createLocation: 300,
  searchGoogleLocation: 300,
  updateLocation: 10_000,
});

/**
 * 0 QPM in the Cloud Console means the API access request was never approved.
 * There is no code path around it; see `errors.ts` for how a live 403 that
 * carries a zero quota limit is reported to the owner.
 */
export const GBP_UNAPPROVED_QPM = 0;

/* -------------------------------------------------------------------------- */
/* Resource names                                                             */
/* -------------------------------------------------------------------------- */

export type AccountName = `accounts/${string}`;
/** Business Information + Performance + Verifications address locations this way. */
export type LocationName = `locations/${string}`;
/** v4.9 (reviews, localPosts, media) needs the account in the path too. */
export type AccountLocationName = `accounts/${string}/locations/${string}`;
export type ReviewName = `${AccountLocationName}/reviews/${string}`;

export const accountName = (accountId: string): AccountName => `accounts/${accountId}`;
export const locationName = (locationId: string): LocationName => `locations/${locationId}`;
export const accountLocationName = (accountId: string, locationId: string): AccountLocationName =>
  `accounts/${accountId}/locations/${locationId}`;

/* -------------------------------------------------------------------------- */
/* Request descriptors                                                        */
/* -------------------------------------------------------------------------- */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Whether a call counts against the 10-per-minute-per-profile EDIT ceiling.
 *
 * `read` — free-flowing, 300 QPM per API.
 * `edit` — a Business Information mutation on ONE profile. Must go through the
 *          write queue keyed by that profile.
 * `write_other` — a mutation on an API with no per-profile ceiling documented
 *          (reviews replies, local posts). Not queued, but still a write, so it
 *          may never be optimistically reported as successful.
 */
export type GbpCallKind = 'read' | 'edit' | 'write_other';

export interface GbpRequest {
  api: GbpApiFamily;
  method: HttpMethod;
  /** Absolute URL, host included. */
  url: string;
  kind: GbpCallKind;
  /** Present only on POST/PATCH/PUT. */
  body?: unknown;
  /**
   * Stable identifier for logging and for keying the write queue. Never
   * contains a token; may contain a location id, which is not a secret.
   */
  operation: string;
}

function query(params: Record<string, string | number | undefined | readonly string[]>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/**
 * The fields we ask Business Information for. `locations.list` and
 * `locations.get` both require an explicit readMask — there is no "give me
 * everything" default, and omitting it is an INVALID_ARGUMENT.
 */
export const LOCATION_READ_MASK = [
  'name',
  'title',
  'storefrontAddress',
  'categories',
  'websiteUri',
  'phoneNumbers',
  'regularHours',
  'specialHours',
  'profile',
  'openInfo',
  'serviceArea',
  'metadata',
].join(',');

/* --- Account Management v1 ------------------------------------------------ */

export const listAccountsRequest = (pageToken?: string): GbpRequest => ({
  api: 'account_management_v1',
  method: 'GET',
  url: `${GBP_HOSTS.account_management_v1}/v1/accounts${query({ pageSize: 20, pageToken })}`,
  kind: 'read',
  operation: 'accounts.list',
});

/* --- Business Information v1 ---------------------------------------------- */

export const listLocationsRequest = (account: AccountName, pageToken?: string): GbpRequest => ({
  api: 'business_information_v1',
  method: 'GET',
  url:
    `${GBP_HOSTS.business_information_v1}/v1/${account}/locations` +
    query({ readMask: LOCATION_READ_MASK, pageSize: 100, pageToken }),
  kind: 'read',
  operation: 'locations.list',
});

export const getLocationRequest = (location: LocationName): GbpRequest => ({
  api: 'business_information_v1',
  method: 'GET',
  url:
    `${GBP_HOSTS.business_information_v1}/v1/${location}` +
    query({ readMask: LOCATION_READ_MASK }),
  kind: 'read',
  operation: 'locations.get',
});

/**
 * The Google-updated version of a location: what Google changed behind the
 * owner's back. This is the single most differentiated audit signal in the
 * whole API family — "Google changed your hours and never asked you."
 */
export const getGoogleUpdatedLocationRequest = (location: LocationName): GbpRequest => ({
  api: 'business_information_v1',
  method: 'GET',
  url:
    `${GBP_HOSTS.business_information_v1}/v1/${location}:getGoogleUpdated` +
    query({ readMask: LOCATION_READ_MASK }),
  kind: 'read',
  operation: 'locations.getGoogleUpdated',
});

/**
 * A location edit. `updateMask` is required.
 *
 * NOTE: exact `updateMask` semantics are marked UNVERIFIED in the research doc.
 * Confirm against the reference before the first real PATCH ships.
 */
export const patchLocationRequest = (
  location: LocationName,
  updateMask: readonly string[],
  body: unknown,
  options?: { validateOnly?: boolean },
): GbpRequest => ({
  api: 'business_information_v1',
  method: 'PATCH',
  url:
    `${GBP_HOSTS.business_information_v1}/v1/${location}` +
    query({
      updateMask: updateMask.join(','),
      ...(options?.validateOnly === true ? { validateOnly: 'true' } : {}),
    }),
  kind: 'edit',
  body,
  operation: 'locations.patch',
});

/* --- Verifications v1 ----------------------------------------------------- */

/**
 * Voice of Merchant. Call this BEFORE any other GBP read or write and drive
 * the entire surface off it — `reviews.list` is documented as "only valid if
 * the specified location is verified", and edits only propagate to Maps once
 * `hasVoiceOfMerchant` is true.
 */
export const getVoiceOfMerchantStateRequest = (location: LocationName): GbpRequest => ({
  api: 'verifications_v1',
  method: 'GET',
  url: `${GBP_HOSTS.verifications_v1}/v1/${location}/VoiceOfMerchantState`,
  kind: 'read',
  operation: 'locations.getVoiceOfMerchantState',
});

export const fetchVerificationOptionsRequest = (
  location: LocationName,
  body: unknown,
): GbpRequest => ({
  api: 'verifications_v1',
  method: 'POST',
  url: `${GBP_HOSTS.verifications_v1}/v1/${location}:fetchVerificationOptions`,
  kind: 'write_other',
  body,
  operation: 'locations.fetchVerificationOptions',
});

export const verifyLocationRequest = (location: LocationName, body: unknown): GbpRequest => ({
  api: 'verifications_v1',
  method: 'POST',
  url: `${GBP_HOSTS.verifications_v1}/v1/${location}:verify`,
  kind: 'write_other',
  body,
  operation: 'locations.verify',
});

/* --- Performance v1 ------------------------------------------------------- */

export interface DailyRange {
  /** YYYY-MM-DD. */
  startDate: string;
  /** YYYY-MM-DD, inclusive. */
  endDate: string;
}

function splitDate(iso: string): { year: string; month: string; day: string } {
  const [year = '', month = '', day = ''] = iso.split('-');
  return { year, month, day };
}

/**
 * `fetchMultiDailyMetricsTimeSeries` — the ONLY supported way to read GBP
 * performance since `reportInsights` was discontinued 2023-03-30.
 *
 * v1 has no aggregation and no breakdown beyond `dailySubEntityType`; the old
 * `Metric` / `MetricOption` objects are gone. Whatever we show must be computed
 * from the daily series ourselves.
 */
export const fetchMultiDailyMetricsRequest = (
  location: LocationName,
  dailyMetrics: readonly string[],
  range: DailyRange,
): GbpRequest => {
  const start = splitDate(range.startDate);
  const end = splitDate(range.endDate);
  return {
    api: 'performance_v1',
    method: 'GET',
    url:
      `${GBP_HOSTS.performance_v1}/v1/${location}:fetchMultiDailyMetricsTimeSeries` +
      query({
        dailyMetrics,
        'dailyRange.start_date.year': start.year,
        'dailyRange.start_date.month': start.month,
        'dailyRange.start_date.day': start.day,
        'dailyRange.end_date.year': end.year,
        'dailyRange.end_date.month': end.month,
        'dailyRange.end_date.day': end.day,
      }),
    kind: 'read',
    operation: 'locations.fetchMultiDailyMetricsTimeSeries',
  };
};

/**
 * Monthly search keywords. The response's `insightsValue` is a UNION of an
 * exact `value` or a `threshold` meaning "below this". See `types.ts`.
 */
export const listSearchKeywordsRequest = (
  location: LocationName,
  range: { startYear: number; startMonth: number; endYear: number; endMonth: number },
  pageToken?: string,
): GbpRequest => ({
  api: 'performance_v1',
  method: 'GET',
  url:
    `${GBP_HOSTS.performance_v1}/v1/${location}/searchkeywords/impressions/monthly` +
    query({
      'monthlyRange.start_month.year': range.startYear,
      'monthlyRange.start_month.month': range.startMonth,
      'monthlyRange.end_month.year': range.endYear,
      'monthlyRange.end_month.month': range.endMonth,
      pageSize: 100,
      pageToken,
    }),
  kind: 'read',
  operation: 'locations.searchkeywords.impressions.monthly.list',
});

/* --- Legacy v4.9: reviews ------------------------------------------------- */

/** Google's documented maximum page size for reviews.list. */
export const REVIEWS_MAX_PAGE_SIZE = 50;

export const listReviewsRequest = (
  parent: AccountLocationName,
  pageToken?: string,
): GbpRequest => ({
  api: 'legacy_v4',
  method: 'GET',
  url:
    `${GBP_HOSTS.legacy_v4}/v4/${parent}/reviews` +
    query({ pageSize: REVIEWS_MAX_PAGE_SIZE, pageToken, orderBy: 'updateTime desc' }),
  kind: 'read',
  operation: 'reviews.list',
});

export const getReviewRequest = (review: ReviewName): GbpRequest => ({
  api: 'legacy_v4',
  method: 'GET',
  url: `${GBP_HOSTS.legacy_v4}/v4/${review}`,
  kind: 'read',
  operation: 'reviews.get',
});

/**
 * Create or replace a reply. The SAME call does both.
 *
 * A 200 here does NOT mean the reply is live — replies go through moderation.
 * See `ReviewReplyState` / `PolicyViolation` handling in `types.ts`.
 */
export const updateReviewReplyRequest = (review: ReviewName, comment: string): GbpRequest => ({
  api: 'legacy_v4',
  method: 'PUT',
  url: `${GBP_HOSTS.legacy_v4}/v4/${review}/reply`,
  kind: 'write_other',
  body: { comment },
  operation: 'reviews.updateReply',
});

export const deleteReviewReplyRequest = (review: ReviewName): GbpRequest => ({
  api: 'legacy_v4',
  method: 'DELETE',
  url: `${GBP_HOSTS.legacy_v4}/v4/${review}/reply`,
  kind: 'write_other',
  operation: 'reviews.deleteReply',
});

/* --- Legacy v4.9: local posts --------------------------------------------- */

export const createLocalPostRequest = (
  parent: AccountLocationName,
  body: unknown,
): GbpRequest => ({
  api: 'legacy_v4',
  method: 'POST',
  url: `${GBP_HOSTS.legacy_v4}/v4/${parent}/localPosts`,
  kind: 'write_other',
  body,
  operation: 'localPosts.create',
});

export const listLocalPostsRequest = (
  parent: AccountLocationName,
  pageToken?: string,
): GbpRequest => ({
  api: 'legacy_v4',
  method: 'GET',
  url: `${GBP_HOSTS.legacy_v4}/v4/${parent}/localPosts` + query({ pageSize: 100, pageToken }),
  kind: 'read',
  operation: 'localPosts.list',
});
