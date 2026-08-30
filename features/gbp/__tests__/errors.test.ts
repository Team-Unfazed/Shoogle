import { classifyGbpFailure, gbpFailureToDataState } from '@/features/gbp/errors';
import type { GbpTransportOutcome } from '@/features/gbp/errors';
import type { VoiceOfMerchantOutcome } from '@/features/gbp/voiceOfMerchant';

/**
 * Google answers 403 for at least four unrelated situations. The whole point of
 * `errors.ts` is that they do not collapse into one another, because each one
 * needs a different sentence and a different next step from the owner.
 */

const http = (status: number, body: unknown): GbpTransportOutcome => ({
  outcome: 'http',
  status,
  body,
});

const googleError = (
  status: number,
  googleStatus: string,
  message: string,
  details: unknown[] = [],
): GbpTransportOutcome => http(status, { error: { code: status, status: googleStatus, message, details } });

const errorInfo = (reason: string, metadata?: Record<string, string>) => ({
  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
  reason,
  domain: 'googleapis.com',
  ...(metadata === undefined ? {} : { metadata }),
});

const UNVERIFIED: VoiceOfMerchantOutcome = { kind: 'verify', hasPendingVerification: null };

describe('quota approval is not throttling', () => {
  it('reads a zero quota limit as "Google has not approved our access"', () => {
    const failure = classifyGbpFailure(
      googleError(403, 'PERMISSION_DENIED', 'Quota exceeded for quota metric ... limit: 0', [
        errorInfo('RATE_LIMIT_EXCEEDED', { quota_limit_value: '0' }),
      ]),
      { operation: 'reviews.list' },
    );

    expect(failure.kind).toBe('quota_not_approved');
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(/not yet approved/i);
    // The whole failure mode this guards against: telling an owner to retry for
    // the two weeks Google takes to review an access request.
    expect(failure.message).not.toMatch(/try again/i);
  });

  it('reads the same shape with a non-zero limit as ordinary throttling', () => {
    const failure = classifyGbpFailure(
      googleError(403, 'PERMISSION_DENIED', 'Quota exceeded for quota metric ... limit: 300', [
        errorInfo('RATE_LIMIT_EXCEEDED', { quota_limit_value: '300' }),
      ]),
    );

    expect(failure.kind).toBe('rate_limited');
    expect(failure.retryable).toBe(true);
  });

  it('recognises a zero quota even with no ErrorInfo attached', () => {
    const failure = classifyGbpFailure(
      googleError(403, 'PERMISSION_DENIED', 'Quota exceeded. limit: 0'),
    );
    expect(failure.kind).toBe('quota_not_approved');
  });

  it('treats a 429 against a zero limit as unapproved, not throttled', () => {
    const failure = classifyGbpFailure(
      googleError(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded ... limit: 0', [
        errorInfo('RATE_LIMIT_EXCEEDED', { quota_limit_value: '0' }),
      ]),
    );
    expect(failure.kind).toBe('quota_not_approved');
  });

  it('treats an ordinary 429 as throttling', () => {
    const failure = classifyGbpFailure(googleError(429, 'RESOURCE_EXHAUSTED', 'Too many requests'));
    expect(failure.kind).toBe('rate_limited');
    expect(failure.retryable).toBe(true);
  });
});

describe('verification is not permission', () => {
  const forbidden = googleError(403, 'PERMISSION_DENIED', 'The caller does not have permission');

  it('reads a bare 403 as a wrong-account problem when nothing is known about the listing', () => {
    expect(classifyGbpFailure(forbidden).kind).toBe('permission_denied');
  });

  it('reads the SAME 403 as the verification gate once Voice of Merchant says unverified', () => {
    const failure = classifyGbpFailure(forbidden, { verification: UNVERIFIED });
    expect(failure.kind).toBe('location_not_verified');
    expect(failure.message).toMatch(/verify/i);
  });

  it('does not blame verification when the listing is healthy', () => {
    const failure = classifyGbpFailure(forbidden, {
      verification: { kind: 'has_voice_of_merchant', hasBusinessAuthority: true },
    });
    expect(failure.kind).toBe('permission_denied');
  });

  it('keeps quota and verification apart even though both are 403', () => {
    const quota = classifyGbpFailure(
      googleError(403, 'PERMISSION_DENIED', 'limit: 0', [
        errorInfo('RATE_LIMIT_EXCEEDED', { quota_limit_value: '0' }),
      ]),
      { verification: UNVERIFIED },
    );
    const verification = classifyGbpFailure(forbidden, { verification: UNVERIFIED });

    expect(quota.kind).toBe('quota_not_approved');
    expect(verification.kind).toBe('location_not_verified');
    expect(quota.message).not.toBe(verification.message);
  });
});

describe('auth', () => {
  it('maps 401 to a reconnect', () => {
    const failure = classifyGbpFailure(googleError(401, 'UNAUTHENTICATED', 'Invalid credentials'));
    expect(failure.kind).toBe('auth_expired');
    expect(gbpFailureToDataState(failure)).toMatchObject({
      status: 'unavailable',
      reason: 'auth_expired',
    });
  });

  it('maps an insufficient scope to a reconnect, not to a generic failure', () => {
    const failure = classifyGbpFailure(
      googleError(403, 'PERMISSION_DENIED', 'Request had insufficient authentication scopes.', [
        errorInfo('ACCESS_TOKEN_SCOPE_INSUFFICIENT'),
      ]),
    );
    expect(failure.kind).toBe('scope_insufficient');
    expect(gbpFailureToDataState(failure)).toMatchObject({ reason: 'auth_expired' });
  });

  it('maps a disabled API to our own misconfiguration, not to the owner', () => {
    const failure = classifyGbpFailure(
      googleError(403, 'PERMISSION_DENIED', 'has not been used in project ... or it is disabled', [
        errorInfo('SERVICE_DISABLED'),
      ]),
    );
    expect(failure.kind).toBe('api_not_enabled');
    expect(failure.message).toMatch(/not something you can fix/i);
  });
});

describe('transport and server failures', () => {
  it('maps a failed request to offline', () => {
    const failure = classifyGbpFailure({ outcome: 'network_error', detail: 'ENOTFOUND' });
    expect(failure.kind).toBe('offline');
    expect(gbpFailureToDataState(failure)).toMatchObject({ reason: 'offline' });
  });

  it('maps 5xx to a retryable error', () => {
    for (const status of [500, 502, 503, 504, 599]) {
      const failure = classifyGbpFailure(googleError(status, 'INTERNAL', 'boom'));
      expect(failure.kind).toBe('provider_unavailable');
      expect(failure.retryable).toBe(true);
    }
  });

  it('maps 400 and 404 to terminal errors', () => {
    expect(classifyGbpFailure(googleError(400, 'INVALID_ARGUMENT', 'bad')).retryable).toBe(false);
    expect(classifyGbpFailure(googleError(404, 'NOT_FOUND', 'gone')).retryable).toBe(false);
  });
});

describe('DataState narrowing', () => {
  it('never offers a retry for something a retry cannot fix', () => {
    const terminal: GbpTransportOutcome[] = [
      googleError(403, 'PERMISSION_DENIED', 'limit: 0'),
      googleError(401, 'UNAUTHENTICATED', 'expired'),
    ];
    for (const outcome of terminal) {
      const state = gbpFailureToDataState(classifyGbpFailure(outcome));
      // `unavailable` renders an explanation; `error` renders a Retry button.
      expect(state.status).toBe('unavailable');
    }
  });

  it('never leaks Google’s raw message to the owner', () => {
    const state = gbpFailureToDataState(
      classifyGbpFailure(
        googleError(403, 'PERMISSION_DENIED', 'Quota metric mybusiness.googleapis.com/read limit: 0'),
        { operation: 'reviews.list' },
      ),
    );
    const message = state.status === 'unavailable' ? state.message : '';
    expect(message).not.toMatch(/googleapis\.com/);
    expect(message).not.toMatch(/quota metric/i);
  });

  it('keeps the raw detail available for logs only', () => {
    const failure = classifyGbpFailure(
      googleError(403, 'PERMISSION_DENIED', 'raw google text'),
      { operation: 'reviews.list' },
    );
    expect(failure.diagnostic).toContain('reviews.list');
    expect(failure.diagnostic).toContain('raw google text');
    expect(failure.message).not.toContain('raw google text');
  });

  it('survives a body that is not a Google error at all', () => {
    expect(classifyGbpFailure(http(418, 'not json')).kind).toBe('unknown');
    expect(classifyGbpFailure(http(403, null)).kind).toBe('permission_denied');
  });
});
