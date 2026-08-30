/**
 * Google Business Profile — error classification. Owner: Pranay.
 *
 * THE POINT OF THIS FILE
 * ----------------------
 * Google answers with HTTP 403 for at least four completely different
 * situations, and they need four different sentences and four different next
 * steps:
 *
 *   1. Our Cloud project's API access request was never approved (quota 0).
 *      Nothing the owner can do. Nothing a retry will fix.
 *   2. The owner's location is not verified, so a documented gate blocked us.
 *      The owner CAN fix it, by verifying with Google.
 *   3. The access token is missing the `business.manage` scope.
 *      Reconnecting fixes it.
 *   4. This Google account genuinely does not manage that listing.
 *      A different Google account fixes it.
 *
 * Collapsing those into one "Something went wrong" is how an app ends up
 * telling a salon owner to retry for two weeks while Google reviews a form they
 * have never heard of. So classification produces a rich `GbpFailure` first,
 * and only then narrows to the `DataState` vocabulary — losing detail visibly,
 * in one place, with the loss written down.
 *
 * Owner-facing strings here never contain Google's raw message, a URL with a
 * token in it, or a quota metric name. Raw detail goes in `diagnostic`, which
 * is for logs only and must never be rendered.
 */

import {
  failed,
  unavailable,
  type DataState,
  type ErrorState,
  type UnavailableState,
} from '@/lib/state/DataState';

import type { VoiceOfMerchantOutcome } from './voiceOfMerchant';

/* -------------------------------------------------------------------------- */
/* Wire shape                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `google.rpc.Status` as it arrives over HTTP, plus the `ErrorInfo` detail
 * Google attaches to quota and configuration failures.
 */
export interface GoogleErrorInfo {
  '@type'?: string;
  reason?: string;
  domain?: string;
  metadata?: Record<string, string>;
}

export interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: GoogleErrorInfo[];
  };
}

/** What the transport hands back. A rejected fetch is `network_error`. */
export type GbpTransportOutcome =
  | { outcome: 'http'; status: number; body: unknown }
  | { outcome: 'network_error'; detail: string };

/* -------------------------------------------------------------------------- */
/* Failure taxonomy                                                           */
/* -------------------------------------------------------------------------- */

export type GbpFailureKind =
  /** 401. The token is dead. Reconnect. */
  | 'auth_expired'
  /** 403, token lacks `business.manage`. Reconnect with the right scope. */
  | 'scope_insufficient'
  /** 403 with a quota limit of 0 — our API access request is not approved. */
  | 'quota_not_approved'
  /** 429, or 403 quota exhaustion against a NON-zero limit. Retry later. */
  | 'rate_limited'
  /** 403 against a location we know is not in Voice of Merchant. */
  | 'location_not_verified'
  /** 403 for a listing this Google account does not manage. */
  | 'permission_denied'
  /** 403 SERVICE_DISABLED — the API is not enabled on our Cloud project. */
  | 'api_not_enabled'
  | 'not_found'
  | 'invalid_request'
  /** 5xx. Google's problem, worth retrying. */
  | 'provider_unavailable'
  /** The request never reached Google. */
  | 'offline'
  | 'unknown';

export interface GbpFailure {
  kind: GbpFailureKind;
  /** Stable code for logs and branching. Never shown raw to the owner. */
  code: string;
  /** Owner-facing English. Safe to render. Contains no Google internals. */
  message: string;
  retryable: boolean;
  httpStatus: number | null;
  /** e.g. `PERMISSION_DENIED`. Diagnostic only. */
  googleStatus: string | null;
  /** `ErrorInfo.reason`, e.g. `RATE_LIMIT_EXCEEDED`. Diagnostic only. */
  googleReason: string | null;
  /** For logs ONLY. Never put this in a DataState message. */
  diagnostic: string;
}

/* -------------------------------------------------------------------------- */
/* Body parsing                                                               */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readErrorBody(body: unknown): GoogleErrorBody['error'] {
  if (!isRecord(body)) return undefined;
  const error = body['error'];
  if (!isRecord(error)) return undefined;

  const details: GoogleErrorInfo[] = [];
  const rawDetails = error['details'];
  if (Array.isArray(rawDetails)) {
    for (const detail of rawDetails) {
      if (!isRecord(detail)) continue;
      const metadata = isRecord(detail['metadata'])
        ? Object.fromEntries(
            Object.entries(detail['metadata']).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string',
            ),
          )
        : undefined;
      details.push({
        '@type': typeof detail['@type'] === 'string' ? detail['@type'] : undefined,
        reason: typeof detail['reason'] === 'string' ? detail['reason'] : undefined,
        domain: typeof detail['domain'] === 'string' ? detail['domain'] : undefined,
        metadata,
      });
    }
  }

  return {
    code: typeof error['code'] === 'number' ? error['code'] : undefined,
    message: typeof error['message'] === 'string' ? error['message'] : undefined,
    status: typeof error['status'] === 'string' ? error['status'] : undefined,
    details,
  };
}

/**
 * Google reports an unapproved project as a quota limit of ZERO, not as a
 * distinct status. Two independent signals say so, and either is enough:
 * `ErrorInfo.metadata.quota_limit_value === "0"`, or the human message ending
 * in `limit: 0`.
 */
function looksLikeZeroQuota(
  details: GoogleErrorInfo[] | undefined,
  message: string | null,
): boolean {
  for (const detail of details ?? []) {
    const limit = detail.metadata?.['quota_limit_value'];
    if (limit !== undefined && Number(limit) === 0) return true;
  }
  return message !== null && /limit:\s*0(\b|$)/i.test(message);
}

function firstReason(details: GoogleErrorInfo[] | undefined): string | null {
  for (const detail of details ?? []) {
    if (typeof detail.reason === 'string' && detail.reason.length > 0) return detail.reason;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Owner-facing copy                                                          */
/* -------------------------------------------------------------------------- */

const COPY: Readonly<Record<GbpFailureKind, string>> = Object.freeze({
  auth_expired:
    'Your Google sign-in for Business Profile has expired. Reconnect the account to continue.',
  scope_insufficient:
    'Shoogle no longer has permission to manage your Business Profile. Reconnect the account and allow Business Profile access.',
  quota_not_approved:
    'Google has not yet approved Shoogle to read Business Profile data. This is pending with Google and is not something you can fix — nothing will load here until it is granted.',
  rate_limited:
    'Google is limiting how often Shoogle can ask about this business. This usually clears within a minute.',
  location_not_verified:
    'Google blocked this because the listing is not verified. Verify the business with Google and this will start working.',
  permission_denied:
    'The connected Google account does not manage this business listing. Connect the Google account that owns it.',
  api_not_enabled:
    'Shoogle’s Google connection is not set up correctly on our side. We have logged it — this is not something you can fix.',
  not_found: 'Google no longer has this listing at the address Shoogle had for it.',
  invalid_request:
    'Google rejected this request. We have logged it — this is not something you can fix.',
  provider_unavailable: 'Google is not responding right now. This is usually brief.',
  offline: 'You are offline, so Shoogle could not reach Google.',
  unknown: 'Something went wrong talking to Google. We have logged it.',
});

const RETRYABLE: Readonly<Record<GbpFailureKind, boolean>> = Object.freeze({
  auth_expired: false,
  scope_insufficient: false,
  quota_not_approved: false,
  rate_limited: true,
  location_not_verified: false,
  permission_denied: false,
  api_not_enabled: false,
  not_found: false,
  invalid_request: false,
  provider_unavailable: true,
  offline: true,
  unknown: true,
});

/* -------------------------------------------------------------------------- */
/* Classification                                                             */
/* -------------------------------------------------------------------------- */

export interface GbpFailureContext {
  /**
   * What `getVoiceOfMerchantState` said about this location, if we asked.
   *
   * This is why the same 403 can mean two different things: on a location we
   * already know is not in Voice of Merchant, a PERMISSION_DENIED is the
   * documented verification gate, not a wrong-account problem.
   */
  verification?: VoiceOfMerchantOutcome;
  /** e.g. `reviews.list`. Diagnostic only. */
  operation?: string;
}

function build(
  kind: GbpFailureKind,
  parts: {
    httpStatus: number | null;
    googleStatus: string | null;
    googleReason: string | null;
    diagnostic: string;
  },
): GbpFailure {
  return {
    kind,
    code: `gbp_${kind}`,
    message: COPY[kind],
    retryable: RETRYABLE[kind],
    ...parts,
  };
}

function classify403(
  reason: string | null,
  googleStatus: string | null,
  rawMessage: string | null,
  details: GoogleErrorInfo[] | undefined,
  context: GbpFailureContext,
): GbpFailureKind {
  if (reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' || reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED') {
    return 'scope_insufficient';
  }
  if (reason === 'SERVICE_DISABLED' || reason === 'API_KEY_SERVICE_BLOCKED') {
    return 'api_not_enabled';
  }
  if (reason === 'RATE_LIMIT_EXCEEDED' || reason === 'RESOURCE_EXHAUSTED') {
    // A zero limit is not throttling — it is an unapproved project. Telling the
    // owner to "try again shortly" would be a two-week lie.
    return looksLikeZeroQuota(details, rawMessage) ? 'quota_not_approved' : 'rate_limited';
  }
  // Some quota rejections arrive with no ErrorInfo at all.
  if (looksLikeZeroQuota(details, rawMessage)) return 'quota_not_approved';

  const verification = context.verification;
  if (verification !== undefined && verification.kind !== 'has_voice_of_merchant') {
    return 'location_not_verified';
  }
  if (googleStatus === 'PERMISSION_DENIED' || googleStatus === null) return 'permission_denied';
  return 'permission_denied';
}

/** Turn a transport outcome into exactly one classified failure. */
export function classifyGbpFailure(
  outcome: GbpTransportOutcome,
  context: GbpFailureContext = {},
): GbpFailure {
  const where = context.operation ?? 'unknown_operation';

  if (outcome.outcome === 'network_error') {
    return build('offline', {
      httpStatus: null,
      googleStatus: null,
      googleReason: null,
      diagnostic: `${where}: transport failed: ${outcome.detail}`,
    });
  }

  const error = readErrorBody(outcome.body);
  const googleStatus = error?.status ?? null;
  const rawMessage = error?.message ?? null;
  const reason = firstReason(error?.details);
  const parts = {
    httpStatus: outcome.status,
    googleStatus,
    googleReason: reason,
    diagnostic: `${where}: HTTP ${outcome.status} ${googleStatus ?? '-'} ${reason ?? '-'}: ${
      rawMessage ?? '(no message)'
    }`,
  };

  switch (outcome.status) {
    case 400:
      return build('invalid_request', parts);
    case 401:
      return build('auth_expired', parts);
    case 403:
      return build(classify403(reason, googleStatus, rawMessage, error?.details, context), parts);
    case 404:
      return build('not_found', parts);
    case 429:
      // 429 with a zero limit is still an unapproved project, not throttling.
      return build(
        looksLikeZeroQuota(error?.details, rawMessage) ? 'quota_not_approved' : 'rate_limited',
        parts,
      );
    case 500:
    case 502:
    case 503:
    case 504:
      return build('provider_unavailable', parts);
    default:
      if (outcome.status >= 500) return build('provider_unavailable', parts);
      return build('unknown', parts);
  }
}

/* -------------------------------------------------------------------------- */
/* Narrowing to DataState                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The single place detail is lost, and the loss is deliberate and documented.
 *
 * `UnavailableReason` has no member for "our vendor's API access request is
 * still with Google" and none for "this listing is not verified", so both land
 * on `not_supported` with different messages and different `GbpFailure.kind`
 * values upstream. `lib/state/DataState.ts` is Sunny's file — the request for
 * `pending_provider_approval` and `provider_verification_required` is recorded
 * as a blocker rather than worked around here.
 *
 * A failure that the owner can do nothing about and that a retry cannot fix is
 * `unavailable`, not `error`: an error state offers a Retry button, and a Retry
 * button that can never succeed is a dead control.
 */
export function gbpFailureToDataState<T>(failure: GbpFailure): DataState<T> {
  switch (failure.kind) {
    case 'auth_expired':
    case 'scope_insufficient':
      return unavailable('auth_expired', failure.message);
    case 'rate_limited':
      return unavailable('rate_limited', failure.message);
    case 'offline':
      return unavailable('offline', failure.message);
    case 'quota_not_approved':
    case 'location_not_verified':
      return unavailable('not_supported', failure.message);
    case 'permission_denied':
    case 'api_not_enabled':
    case 'not_found':
    case 'invalid_request':
    case 'provider_unavailable':
    case 'unknown':
      return failed(failure.code, failure.message, failure.retryable);
  }
}

/** Convenience: classify and narrow in one step. */
export function gbpFailureState<T>(
  outcome: GbpTransportOutcome,
  context?: GbpFailureContext,
): UnavailableState | ErrorState {
  const state = gbpFailureToDataState<T>(classifyGbpFailure(outcome, context));
  // `gbpFailureToDataState` only ever produces these two; the cast-free narrow
  // keeps that guarantee checkable.
  return state.status === 'unavailable' || state.status === 'error'
    ? state
    : failed('gbp_unknown', COPY.unknown, true);
}
