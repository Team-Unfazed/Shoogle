/**
 * Google Business Profile adapter. Owner: Pranay.
 *
 * ================== READ THIS BEFORE CHANGING ANYTHING ====================
 *
 * THIS PROVIDER IS DELIBERATELY NOT REGISTERED.
 *
 * `registerProvider('google_business', …)` is NOT called anywhere, and calling
 * it would make the app less honest, not more. `app/(tabs)/business.tsx`
 * renders "Integration not built yet" precisely when
 * `!isProviderRegistered('google_business')`. Registering an implementation
 * that can only answer `not_connected` would delete that line and replace it
 * with the claim that a Google integration exists. It does not: there is no
 * approved API quota (an unapproved Cloud project sits at 0 QPM), and no
 * server-side token exchange. Register this the day `connect()` can complete a
 * real OAuth flow — not before.
 *
 * WHY THE WHOLE PIPELINE IS WRITTEN ANYWAY
 * ----------------------------------------
 * Everything except the HTTP call and the OAuth dance is implementable today
 * and is implemented here: endpoint construction, the Voice of Merchant gate,
 * response decoding, error classification, the per-profile edit queue, and the
 * unknown-vs-zero rules. `transport` is an injected seam that defaults to
 * `null`; while it is null every method reports `not_connected` and no request
 * is built. Wiring the real thing tomorrow is one adapter that turns a
 * `GbpRequest` into a `fetch`, plus a `getSession` that returns a token.
 *
 * WHAT IS NOT HERE, ON PURPOSE
 * ----------------------------
 * - No post composer or scheduler UI. `google_business` is already a target of
 *   Yash's `SocialPublisher`; a second authoring surface would mean two
 *   sources of truth for the same post. `createLocalPost` exists because the
 *   shared contract declares it, and stops at the adapter.
 * - No business setup or onboarding screens. That is Aryan's.
 * - No rank position, anywhere. Google publishes none.
 */

import { LIVE_DAILY_METRIC_ORDER, type LiveDailyMetric } from '@/features/seo';
import type { GbpLocation, GbpReview, GoogleBusinessProfileProvider } from '@/lib/providers/contracts';
import type { ConnectionInfo, Metric, Paginated, Result } from '@/lib/providers/types';
import {
  failed,
  ready,
  unavailable,
  type ErrorState,
  type UnavailableState,
} from '@/lib/state/DataState';
import type { Post } from '@/types/domain';

import {
  accountLocationName,
  createLocalPostRequest,
  fetchMultiDailyMetricsRequest,
  GBP_OAUTH_SCOPE,
  getGoogleUpdatedLocationRequest,
  getLocationRequest,
  getReviewRequest,
  getVoiceOfMerchantStateRequest,
  listAccountsRequest,
  listLocationsRequest,
  listReviewsRequest,
  listSearchKeywordsRequest,
  locationName,
  patchLocationRequest,
  updateReviewReplyRequest,
  type AccountName,
  type GbpRequest,
  type LocationName,
  type ReviewName,
} from './endpoints';
import {
  classifyGbpFailure,
  gbpFailureToDataState,
  type GbpFailure,
  type GbpFailureContext,
  type GbpTransportOutcome,
} from './errors';
import { parseBusinessHours } from './hours';
import {
  accountIdFromName,
  toContractReview,
  toGbpLocation,
  toGoogleUpdatedDiff,
  toPost,
  toReviewDetail,
  verificationStateFromMetadata,
} from './mappers';
import {
  buildMetrics,
  buildWindows,
  isoDate,
  missingMetrics,
  normaliseKeywordRows,
  parsePerformancePeriod,
  type GbpWindows,
} from './performance';
import type {
  GbpCreateLocalPostBody,
  GbpFetchMultiDailyMetricsResponse,
  GbpGoogleUpdatedDiff,
  GbpGoogleUpdatedLocationWire,
  GbpKeywordReport,
  GbpListAccountsResponse,
  GbpListLocationsResponse,
  GbpListReviewsResponse,
  GbpLocalPostWire,
  GbpLocationWire,
  GbpReplyModeration,
  GbpReviewPage,
  GbpReviewWire,
  GbpSearchKeywordsResponse,
  GbpVoiceOfMerchantStateWire,
} from './types';
import {
  classifyVoiceOfMerchant,
  describeVoiceOfMerchant,
  toContractVerificationState,
  voiceOfMerchantGate,
  type VoiceOfMerchantOutcome,
} from './voiceOfMerchant';
import { createGbpWriteQueue, type GbpWriteQueue } from './writeQueue';

/* -------------------------------------------------------------------------- */
/* Seams                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A short-lived access token plus what it is good for.
 *
 * The token is obtained by OUR BACKEND, never by the app: `CLAUDE.md` forbids
 * the OAuth client secret from reaching the device, and every `EXPO_PUBLIC_*`
 * value ships readable inside the APK. Nothing in this folder may perform a
 * code-for-token exchange.
 */
export interface GbpSession {
  accessToken: string;
  /** Scopes Google actually granted. Checked, never assumed. */
  grantedScopes: string[];
  /** The Business Profile account id, e.g. `1234567890` from `accounts/1234567890`. */
  accountId: string;
  /** Owner-facing label for the connected account, when Google gave one. */
  handle: string | null;
  lastSyncedAt: string | null;
}

/** The single point where this feature would touch the network. */
export interface GbpTransport {
  send(request: GbpRequest, accessToken: string): Promise<GbpTransportOutcome>;
}

export interface GbpProviderDeps {
  /** Resolves the current session, or null when nothing is linked. */
  getSession: () => Promise<GbpSession | null>;
  /**
   * `null` until a real HTTP adapter exists. While it is null this provider
   * builds no requests and reports `not_connected` — it does not pretend.
   */
  transport: GbpTransport | null;
  now: () => string;
  writeQueue?: GbpWriteQueue;
  /**
   * The most recent date we are willing to claim Google has data for.
   *
   * Performance reporting latency is UNVERIFIED — no first-party page states
   * one — so this defaults to two days back rather than "today". Asking for
   * days Google has not published yields empty days, and empty days must not
   * become zeros.
   */
  latestPerformanceDate?: () => string;
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                       */
/* -------------------------------------------------------------------------- */

const NOT_WIRED =
  'Shoogle cannot reach Google Business Profile yet. Google has not approved our API access, and the sign-in that would connect your profile does not exist yet. Nothing here is real data, and nothing is hidden from you.';

const NOT_LINKED =
  'No Google Business Profile is linked to this business yet. Connect one to see your listing, reviews and performance here.';

const CANNOT_CONNECT_YET =
  'Connecting a Google Business Profile is not possible yet: Shoogle’s access request is still with Google, and there is no sign-in to complete. Nothing was connected.';

const NOTHING_TO_DISCONNECT =
  'There is no Google Business Profile connected, so there is nothing to disconnect.';

const SCOPE_MISSING =
  'The linked Google account did not grant Shoogle permission to manage your Business Profile. Reconnect it and allow Business Profile access.';

/* -------------------------------------------------------------------------- */
/* Extended surface                                                           */
/* -------------------------------------------------------------------------- */

export interface GbpReplyOutcome {
  reviewId: string;
  /** What Google actually said about the reply. Never an optimistic guess. */
  moderation: GbpReplyModeration;
}

export interface GbpHoursUpdateOutcome {
  /** Google accepted the edit. This is NOT the same as it being live on Maps. */
  accepted: true;
  /**
   * False when the profile does not hold Voice of Merchant. Google states that
   * edits only propagate once it does, so promising the owner their new hours
   * are live would be a false claim.
   */
  willReachGoogle: boolean;
}

export interface GbpPerformanceReport {
  metrics: Metric[];
  /**
   * Live metrics Google reported nothing for in this window. These render as
   * "—" with a reason. They are NOT zeros.
   */
  unreported: LiveDailyMetric[];
  windows: GbpWindows;
}

/**
 * This feature's own surface: the shared contract plus everything the contract
 * cannot express. Screens in `features/gbp/` use this; anything crossing a
 * feature boundary uses `GoogleBusinessProfileProvider`.
 */
export interface GbpAdapter extends GoogleBusinessProfileProvider {
  getVoiceOfMerchant(locationId: string): Result<VoiceOfMerchantOutcome>;
  /** Google-initiated edits the owner never made. The differentiated audit signal. */
  getGoogleUpdated(locationId: string): Result<GbpGoogleUpdatedDiff>;
  listReviewsDetailed(locationId: string, cursor?: string): Result<GbpReviewPage>;
  /** Reports moderation state honestly. Use this, not `replyToReview`, for UI copy. */
  submitReviewReply(locationId: string, reviewId: string, comment: string): Result<GbpReplyOutcome>;
  getPerformanceReport(locationId: string, period: string): Result<GbpPerformanceReport>;
  listSearchKeywords(locationId: string, monthsBack: number): Result<GbpKeywordReport>;
  updateRegularHours(locationId: string, hours: unknown): Result<GbpHoursUpdateOutcome>;
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

interface LiveContext {
  session: GbpSession;
  transport: GbpTransport;
}

type Blocked = UnavailableState | ErrorState;

function isBlocked(value: unknown): value is Blocked {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    ((value as { status: unknown }).status === 'unavailable' ||
      (value as { status: unknown }).status === 'error')
  );
}

type CallResult<T> = { ok: true; data: T } | { ok: false; state: Blocked; failure: GbpFailure };

/**
 * The single place an untyped body is given a wire type.
 *
 * Every wire interface in `types.ts` has all-optional fields, and every mapper
 * re-checks `typeof` before it uses a value, so naming the shape here cannot
 * manufacture data — it only stops each call site from re-deriving it. If you
 * add a mapper that trusts a field without checking it, this stops being safe.
 */
function asWire<T>(body: unknown): T {
  return (body ?? {}) as T;
}

function defaultLatestPerformanceDate(): string {
  const today = new Date();
  return isoDate(new Date(today.getTime() - 2 * 86_400_000));
}

export function createGoogleBusinessProfileProvider(
  overrides: Partial<GbpProviderDeps> = {},
): GbpAdapter {
  const deps: GbpProviderDeps = {
    getSession: overrides.getSession ?? (async () => null),
    // Defaults to null on purpose: no credentials exist, so no request is built.
    transport: overrides.transport ?? null,
    now: overrides.now ?? (() => new Date().toISOString()),
    writeQueue: overrides.writeQueue ?? createGbpWriteQueue(),
    latestPerformanceDate: overrides.latestPerformanceDate ?? defaultLatestPerformanceDate,
  };
  const queue = deps.writeQueue ?? createGbpWriteQueue();
  const latestDate = deps.latestPerformanceDate ?? defaultLatestPerformanceDate;

  async function live(): Promise<LiveContext | Blocked> {
    const transport = deps.transport;
    if (transport === null) return unavailable('not_connected', NOT_WIRED);

    const session = await deps.getSession();
    if (session === null) return unavailable('not_connected', NOT_LINKED);
    if (!session.grantedScopes.includes(GBP_OAUTH_SCOPE)) {
      return unavailable('auth_expired', SCOPE_MISSING);
    }
    return { session, transport };
  }

  async function send<T>(
    ctx: LiveContext,
    request: GbpRequest,
    context: GbpFailureContext,
    /** Which Google Business Profile this EDIT belongs to. Reads ignore it. */
    profileKey?: string,
  ): Promise<CallResult<T>> {
    const run = (): Promise<GbpTransportOutcome> =>
      ctx.transport.send(request, ctx.session.accessToken);

    // ONLY Business Information edits are queued. Reads run at 300 QPM and
    // must never be serialised behind the 10-per-minute-per-profile ceiling.
    const outcome =
      request.kind === 'edit'
        ? await queue.enqueue(profileKey ?? request.operation, run)
        : await run();

    if (outcome.outcome === 'http' && outcome.status >= 200 && outcome.status < 300) {
      return { ok: true, data: asWire<T>(outcome.body) };
    }

    const failure = classifyGbpFailure(outcome, context);
    return { ok: false, state: toBlocked(failure), failure };
  }

  function toBlocked(failure: GbpFailure): Blocked {
    const state = gbpFailureToDataState<never>(failure);
    return state.status === 'unavailable' || state.status === 'error'
      ? state
      : failed(failure.code, failure.message, failure.retryable);
  }

  /**
   * Ask Google what state the profile is in.
   *
   * Never recurses through the 403 explainer below — this IS the explainer.
   */
  async function voiceOfMerchant(
    ctx: LiveContext,
    location: LocationName,
  ): Promise<VoiceOfMerchantOutcome | Blocked> {
    const result = await send<GbpVoiceOfMerchantStateWire>(
      ctx,
      getVoiceOfMerchantStateRequest(location),
      { operation: 'locations.getVoiceOfMerchantState' },
    );
    if (!result.ok) return result.state;
    return classifyVoiceOfMerchant(result.data);
  }

  /**
   * Run a read and, if Google answers 403 with nothing more specific, ask it
   * WHY before reporting to the owner.
   *
   * A bare PERMISSION_DENIED is ambiguous: wrong Google account, or the
   * documented verification gate. Voice of Merchant settles it, and the owner
   * gets "verify your business" instead of "you don't have permission".
   */
  async function sendExplained<T>(
    ctx: LiveContext,
    request: GbpRequest,
    location: LocationName,
    operation: string,
  ): Promise<CallResult<T>> {
    const first = await send<T>(ctx, request, { operation });
    if (first.ok || first.failure.kind !== 'permission_denied') return first;

    const verification = await voiceOfMerchant(ctx, location);
    if (isBlocked(verification)) return first;

    const failure = classifyGbpFailure(
      { outcome: 'http', status: first.failure.httpStatus ?? 403, body: {} },
      { operation, verification },
    );
    // Preserve the original diagnostic; only the owner-facing reading changes.
    const reclassified: GbpFailure = { ...failure, diagnostic: first.failure.diagnostic };
    return { ok: false, state: toBlocked(reclassified), failure: reclassified };
  }

  /* ------------------------------------------------------------------ */
  /* Contract methods                                                   */
  /* ------------------------------------------------------------------ */

  async function getConnection(): Result<ConnectionInfo> {
    const ctx = await live();
    if (isBlocked(ctx)) return ctx;
    return ready<ConnectionInfo>(
      {
        provider: 'google_business',
        status: 'connected',
        handle: ctx.session.handle,
        grantedScopes: ctx.session.grantedScopes,
        lastSyncedAt: ctx.session.lastSyncedAt,
      },
      deps.now(),
    );
  }

  async function connect(): Result<ConnectionInfo> {
    // No dead controls (rule 7) and no fabricated success (rule 5): this states
    // exactly why it cannot proceed instead of spinning or half-connecting.
    return unavailable('not_connected', CANNOT_CONNECT_YET);
  }

  async function disconnect(): Result<void> {
    const session = await deps.getSession();
    if (session === null) return unavailable('not_connected', NOTHING_TO_DISCONNECT);
    // Revocation is a server-side call against Google's token endpoint, which
    // this app cannot make. Reporting "disconnected" without revoking would be
    // a false claim about the owner's Google account.
    return unavailable(
      'not_connected',
      'Disconnecting has to revoke access with Google, which happens on Shoogle’s server. That is not built yet, so nothing was changed.',
    );
  }

  async function listLocations(): Result<GbpLocation[]> {
    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const accounts = await send<GbpListAccountsResponse>(ctx, listAccountsRequest(), {
      operation: 'accounts.list',
    });
    if (!accounts.ok) return accounts.state;

    const locations: GbpLocation[] = [];
    let refused = 0;

    for (const account of accounts.data.accounts ?? []) {
      const accountId = accountIdFromName(account.name);
      if (accountId === null) continue;
      const parent: AccountName = `accounts/${accountId}`;
      const page = await send<GbpListLocationsResponse>(ctx, listLocationsRequest(parent), {
        operation: 'locations.list',
      });
      if (!page.ok) return page.state;

      for (const wire of page.data.locations ?? []) {
        const mapped = toGbpLocation(wire, verificationStateFromMetadata(wire));
        if (mapped.ok) locations.push(mapped.location);
        else refused += 1;
      }
    }

    if (locations.length === 0 && refused > 0) {
      return failed(
        'gbp_locations_unmappable',
        'Google returned listings Shoogle could not read. We have logged it rather than show you a blank page.',
        false,
      );
    }
    // An empty array here is a MEASURED fact — this Google account manages no
    // listings — and is different from "we could not check". Both are honest;
    // only this one is `ready`.
    return ready(locations, deps.now());
  }

  async function getLocation(locationId: string): Result<GbpLocation> {
    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const location = locationName(locationId);
    const result = await sendExplained<GbpLocationWire>(
      ctx,
      getLocationRequest(location),
      location,
      'locations.get',
    );
    if (!result.ok) return result.state;

    // A failed Voice of Merchant lookup degrades the verification field to
    // whatever the location metadata proves, rather than failing the read.
    const verification = await voiceOfMerchant(ctx, location);
    const state = isBlocked(verification)
      ? verificationStateFromMetadata(result.data)
      : toContractVerificationState(verification);

    const mapped = toGbpLocation(result.data, state);
    if (!mapped.ok) return failed('gbp_location_unmappable', mapped.reason, false);
    return ready(mapped.location, deps.now());
  }

  async function getPerformanceReport(
    locationId: string,
    period: string,
  ): Result<GbpPerformanceReport> {
    const parsed = parsePerformancePeriod(period);
    if (parsed === null) {
      return failed(
        'gbp_unsupported_period',
        'Shoogle can only report the last 7, 28 or 90 days from Google.',
        false,
      );
    }

    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const location = locationName(locationId);
    const windows = buildWindows(latestDate(), parsed.days);
    const result = await sendExplained<GbpFetchMultiDailyMetricsResponse>(
      ctx,
      fetchMultiDailyMetricsRequest(location, LIVE_DAILY_METRIC_ORDER, windows.combined),
      location,
      'locations.fetchMultiDailyMetricsTimeSeries',
    );
    if (!result.ok) return result.state;

    const { metrics } = buildMetrics(result.data, windows, parsed.label);
    const unreported = missingMetrics(LIVE_DAILY_METRIC_ORDER, metrics);

    if (metrics.length === 0) {
      return unavailable(
        'no_data_yet',
        'Google has not reported any performance figures for this listing in this period. That is not the same as zero activity — Google simply has nothing published for these days.',
      );
    }
    return ready({ metrics, unreported, windows }, deps.now());
  }

  async function getPerformance(locationId: string, period: string): Result<Metric[]> {
    const report = await getPerformanceReport(locationId, period);
    // `Metric.value` is a non-nullable number, so an unreported metric is
    // absent from this array rather than present as 0. Callers that need to
    // NAME the absent metrics use `getPerformanceReport`.
    return report.status === 'ready' ? ready(report.value.metrics, report.fetchedAt) : report;
  }

  async function listReviewsDetailed(locationId: string, cursor?: string): Result<GbpReviewPage> {
    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const location = locationName(locationId);
    // Google documents `reviews.list` as "only valid if the specified location
    // is verified". Calling it on an unverified listing and rendering the
    // failure as "0 reviews" is the exact lie this codebase forbids.
    const verification = await voiceOfMerchant(ctx, location);
    if (isBlocked(verification)) return verification;
    const gate = voiceOfMerchantGate(verification);
    if (gate !== null) return gate;

    const parent = accountLocationName(ctx.session.accountId, locationId);
    const result = await send<GbpListReviewsResponse>(
      ctx,
      listReviewsRequest(parent, cursor),
      { operation: 'reviews.list', verification },
    );
    if (!result.ok) return result.state;

    const page: GbpReviewPage = {
      reviews: [],
      nextPageToken:
        typeof result.data.nextPageToken === 'string' ? result.data.nextPageToken : null,
      averageRating:
        typeof result.data.averageRating === 'number' ? result.data.averageRating : null,
      totalReviewCount:
        typeof result.data.totalReviewCount === 'number' ? result.data.totalReviewCount : null,
      skipped: [],
    };

    for (const wire of result.data.reviews ?? []) {
      const mapped = toReviewDetail(wire);
      if (mapped.ok) page.reviews.push(mapped.review);
      else page.skipped.push({ reviewId: mapped.reviewId, reason: mapped.reason });
    }

    return ready(page, deps.now());
  }

  /**
   * The shared-contract projection. EXPORT-ONLY — nothing inside this app
   * should call it.
   *
   * `Paginated<GbpReview>` has room for `items` and a cursor and nothing else,
   * so it cannot say "this page is missing two reviews" or "this review's reply
   * had no timestamp". A nine-item list from a ten-review page would be
   * indistinguishable from a complete one, and that is precisely the silent
   * truncation this codebase forbids. So the rule here is absolute: if ANY
   * record was lost on the way through, this method refuses instead of
   * returning a list that looks whole.
   *
   * In-app screens use `listReviewsDetailed`, whose `GbpReviewPage.skipped`
   * carries the losses and whose `GbpReviewDetail.replyModeration` carries the
   * moderation truth.
   */
  async function listReviews(
    locationId: string,
    cursor?: string,
  ): Result<Paginated<GbpReview>> {
    const detailed = await listReviewsDetailed(locationId, cursor);
    if (detailed.status !== 'ready') return detailed;

    const items: GbpReview[] = [];
    // Reviews Google sent that `toReviewDetail` already refused (no id, no date).
    let dropped = detailed.value.skipped.length;
    let repliesOmitted = 0;
    for (const review of detailed.value.reviews) {
      const projected = toContractReview(review);
      // A review Google marked STAR_RATING_UNSPECIFIED cannot be expressed by
      // the shared `GbpReview` type, whose rating is 1-5. Dropping it is the
      // only option the contract leaves; see the blockers in README.md.
      if (!projected.ok) {
        dropped += 1;
        continue;
      }
      if (projected.replyOmitted) repliesOmitted += 1;
      items.push(projected.review);
    }

    if (items.length === 0 && dropped > 0) {
      return failed(
        'gbp_reviews_unmappable',
        'Google returned reviews Shoogle could not read. We have logged it rather than tell you there are none.',
        false,
      );
    }
    if (dropped > 0) {
      return failed(
        'gbp_reviews_partial',
        `Google returned ${dropped + items.length} reviews and Shoogle could not read ${dropped} of them. Rather than hand you a shorter list that looks complete, nothing is returned here — the reviews Shoogle can read are available in the app.`,
        false,
      );
    }
    if (repliesOmitted > 0) {
      return failed(
        'gbp_reviews_reply_untimed',
        `Google returned ${repliesOmitted} repl${repliesOmitted === 1 ? 'y' : 'ies'} without saying when ${repliesOmitted === 1 ? 'it' : 'they'} happened. This list would show those reviews as unanswered, so it is not returned rather than understating what you have already replied to.`,
        false,
      );
    }
    return ready({ items, nextCursor: detailed.value.nextPageToken }, detailed.fetchedAt);
  }

  async function submitReviewReply(
    locationId: string,
    reviewId: string,
    comment: string,
  ): Result<GbpReplyOutcome> {
    if (comment.trim().length === 0) {
      return failed('gbp_empty_reply', 'A reply needs some text before it can be sent.', false);
    }

    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const location = locationName(locationId);
    const verification = await voiceOfMerchant(ctx, location);
    if (isBlocked(verification)) return verification;
    const gate = voiceOfMerchantGate(verification);
    if (gate !== null) return gate;

    const reviewName: ReviewName = `${accountLocationName(
      ctx.session.accountId,
      locationId,
    )}/reviews/${reviewId}`;

    const submitted = await send<unknown>(ctx, updateReviewReplyRequest(reviewName, comment), {
      operation: 'reviews.updateReply',
      verification,
    });
    if (!submitted.ok) return submitted.state;

    // A 200 here means Google ACCEPTED the reply, not that it published it —
    // replies go through moderation. So read the review back and report only
    // what Google says about it.
    const reread = await send<GbpReviewWire>(ctx, getReviewRequest(reviewName), {
      operation: 'reviews.get',
      verification,
    });
    if (!reread.ok) {
      return failed(
        'gbp_reply_state_unknown',
        'Your reply was sent to Google. Shoogle could not read the review back afterwards, so it cannot yet confirm what Google did with it.',
        true,
      );
    }

    const mapped = toReviewDetail(reread.data);
    if (!mapped.ok) {
      return failed(
        'gbp_reply_state_unknown',
        'Your reply was sent to Google, but Shoogle could not read the review back to confirm what happened to it.',
        true,
      );
    }
    return ready({ reviewId, moderation: mapped.review.replyModeration }, deps.now());
  }

  async function replyToReview(
    locationId: string,
    reviewId: string,
    comment: string,
  ): Result<GbpReview> {
    const outcome = await submitReviewReply(locationId, reviewId, comment);
    if (outcome.status !== 'ready') return outcome;

    // The shared `GbpReview.reply` shape cannot carry moderation state, so a
    // caller using this method learns only that a reply exists. UI copy must
    // come from `submitReviewReply`, which reports the real state.
    const detailed = await listReviewsDetailed(locationId);
    if (detailed.status !== 'ready') return detailed;
    const found = detailed.value.reviews.find((review) => review.reviewId === reviewId);
    if (found === undefined) {
      return failed(
        'gbp_reply_state_unknown',
        'Your reply was sent to Google, but Shoogle could not find the review afterwards to confirm what happened to it.',
        true,
      );
    }
    const projected = toContractReview(found);
    if (!projected.ok) {
      return failed(
        'gbp_reply_state_unknown',
        'Your reply was sent to Google. Shoogle cannot show this review back to you because Google did not report a star rating for it.',
        false,
      );
    }
    if (projected.replyOmitted) {
      // The reply is on Google but Google gave it no timestamp, so the shared
      // shape has to drop it — and a `GbpReview` with `reply: null` would tell
      // the caller this review is still unanswered. Refuse instead.
      return failed(
        'gbp_reply_state_unknown',
        'Your reply was sent to Google. Google did not say when it recorded the reply, so Shoogle will not show you a time it made up.',
        false,
      );
    }
    return ready(projected.review, deps.now());
  }

  async function createLocalPost(
    locationId: string,
    body: string,
    scheduledFor: string | null,
  ): Result<Post> {
    if (body.trim().length === 0) {
      return failed('gbp_empty_post', 'A Google post needs some text before it can be sent.', false);
    }

    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const location = locationName(locationId);
    const verification = await voiceOfMerchant(ctx, location);
    // NOT gated. Google documents the verification requirement for
    // `reviews.list` only; whether it applies to `localPosts.create` is
    // UNVERIFIED, and blocking on an undocumented gate would invent a rule.
    // The state is still carried so a 403 can be explained accurately.
    const context: GbpFailureContext = {
      operation: 'localPosts.create',
      ...(isBlocked(verification) ? {} : { verification }),
    };

    const payload: GbpCreateLocalPostBody = {
      languageCode: 'en',
      summary: body,
      topicType: 'STANDARD',
      // `scheduledTime` is native to the API. Shoogle does not simulate
      // scheduling, and does not truncate `summary` to a guessed limit.
      ...(scheduledFor !== null ? { scheduledTime: scheduledFor } : {}),
    };

    const parent = accountLocationName(ctx.session.accountId, locationId);
    const result = await send<GbpLocalPostWire>(
      ctx,
      createLocalPostRequest(parent, payload),
      context,
    );
    if (!result.ok) return result.state;

    return ready(toPost(result.data, deps.now()), deps.now());
  }

  async function updateRegularHours(
    locationId: string,
    hours: unknown,
  ): Result<GbpHoursUpdateOutcome> {
    const parsed = parseBusinessHours(hours);
    if (!parsed.ok) return failed('gbp_invalid_hours', parsed.reason, false);

    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const location = locationName(locationId);
    const verification = await voiceOfMerchant(ctx, location);
    const holdsVoiceOfMerchant =
      !isBlocked(verification) && verification.kind === 'has_voice_of_merchant';

    const result = await send<GbpLocationWire>(
      ctx,
      // Queued: this is a Business Information EDIT, and Google caps those at
      // 10 per minute per profile, a ceiling it says cannot be increased.
      patchLocationRequest(location, ['regularHours'], { regularHours: parsed.hours }),
      {
        operation: 'locations.patch',
        ...(isBlocked(verification) ? {} : { verification }),
      },
      // The queue key is the profile, because Google's ceiling is per profile.
      locationId,
    );
    if (!result.ok) return result.state;

    // Accepted by the API. NOT necessarily live on Search or Maps — Google says
    // edits propagate only once the profile holds Voice of Merchant.
    return ready({ accepted: true, willReachGoogle: holdsVoiceOfMerchant }, deps.now());
  }

  async function updateBusinessHours(locationId: string, hours: unknown): Result<void> {
    const outcome = await updateRegularHours(locationId, hours);
    if (outcome.status !== 'ready') return outcome;
    return ready<void>(undefined, outcome.fetchedAt);
  }

  /* ------------------------------------------------------------------ */
  /* Extended methods                                                   */
  /* ------------------------------------------------------------------ */

  async function getVoiceOfMerchant(locationId: string): Result<VoiceOfMerchantOutcome> {
    const ctx = await live();
    if (isBlocked(ctx)) return ctx;
    const outcome = await voiceOfMerchant(ctx, locationName(locationId));
    if (isBlocked(outcome)) return outcome;
    return ready(outcome, deps.now());
  }

  async function getGoogleUpdated(locationId: string): Result<GbpGoogleUpdatedDiff> {
    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const location = locationName(locationId);
    const result = await sendExplained<GbpGoogleUpdatedLocationWire>(
      ctx,
      getGoogleUpdatedLocationRequest(location),
      location,
      'locations.getGoogleUpdated',
    );
    if (!result.ok) return result.state;
    // An empty diff is a real answer — "Google has not changed anything" — and
    // is `ready`, not `unavailable`.
    return ready(toGoogleUpdatedDiff(result.data), deps.now());
  }

  async function listSearchKeywords(
    locationId: string,
    monthsBack: number,
  ): Result<GbpKeywordReport> {
    if (!Number.isInteger(monthsBack) || monthsBack < 1) {
      return failed('gbp_invalid_month_range', 'Ask for at least one whole month.', false);
    }

    const ctx = await live();
    if (isBlocked(ctx)) return ctx;

    const end = new Date(latestDate());
    const start = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (monthsBack - 1), 1),
    );

    const location = locationName(locationId);
    const result = await sendExplained<GbpSearchKeywordsResponse>(
      ctx,
      listSearchKeywordsRequest(location, {
        startYear: start.getUTCFullYear(),
        startMonth: start.getUTCMonth() + 1,
        endYear: end.getUTCFullYear(),
        endMonth: end.getUTCMonth() + 1,
      }),
      location,
      'locations.searchkeywords.impressions.monthly.list',
    );
    if (!result.ok) return result.state;

    // Rows whose volume Google reported as a threshold survive as
    // `below_threshold` and render "<15". They are never a number and never 0.
    const { rows, skipped } = normaliseKeywordRows(result.data.searchKeywordsCounts);

    // Google sent keywords and Shoogle could read none of them. `ready([])`
    // here would render as "you have no search keywords", which is a claim
    // about the owner's business that we have no evidence for.
    if (rows.length === 0 && skipped > 0) {
      return failed(
        'gbp_keywords_unmappable',
        `Google returned ${skipped} search keyword${skipped === 1 ? '' : 's'} that Shoogle could not read — it gave no usable search volume for any of them. That is not the same as having no keywords, so nothing is shown here.`,
        false,
      );
    }

    // `skipped > 0` with rows present is a PARTIAL list, and it travels with
    // the value so the screen can say so. An empty `searchKeywordsCounts` from
    // Google is a measured "no keywords this period" and stays ready with
    // `skipped: 0`.
    return ready({ rows, skipped }, deps.now());
  }

  return {
    id: 'google_business',
    displayName: 'Google Business Profile',
    getConnection,
    connect,
    disconnect,
    listLocations,
    getLocation,
    getPerformance,
    listReviews,
    replyToReview,
    createLocalPost,
    updateBusinessHours,
    getVoiceOfMerchant,
    getGoogleUpdated,
    listReviewsDetailed,
    submitReviewReply,
    getPerformanceReport,
    listSearchKeywords,
    updateRegularHours,
  };
}

/**
 * The adapter, with no credentials and no transport.
 *
 * Every method reports `not_connected`. It is exported so screens and tests can
 * hold a real object, and it is NOT registered — see the header of this file.
 */
export const googleBusinessProfileProvider: GbpAdapter = createGoogleBusinessProfileProvider();

/**
 * Owner-facing explanation of why the Google surface is empty today.
 * Used instead of a spinner or a disabled button with no reason.
 */
export function describeGbpAvailability(): { title: string; body: string } {
  return {
    title: 'Google Business Profile is not connected',
    body: NOT_WIRED,
  };
}

/** Re-exported so screens can explain a Voice of Merchant outcome without a second import. */
export { describeVoiceOfMerchant };
