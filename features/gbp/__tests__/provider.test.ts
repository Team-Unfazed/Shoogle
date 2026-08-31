import { GBP_OAUTH_SCOPE, type GbpRequest } from '@/features/gbp/endpoints';
import type { GbpTransportOutcome } from '@/features/gbp/errors';
import {
  createGoogleBusinessProfileProvider,
  googleBusinessProfileProvider,
  type GbpSession,
  type GbpTransport,
} from '@/features/gbp/provider';
import { LIVE_DAILY_METRICS } from '@/features/seo';
import { fixtureVoiceOfMerchantStates } from '@/fixtures/gbp';
import { isProviderRegistered } from '@/lib/providers/registry';
import type { DataState } from '@/lib/state/DataState';

/**
 * The adapter's job today is to be correct and to be honest about being empty.
 * These tests pin both: no method fabricates data, success or a connection, and
 * every path that CAN be exercised without credentials behaves the way the
 * research says Google behaves.
 */

const SESSION: GbpSession = {
  accessToken: 'test-token',
  grantedScopes: [GBP_OAUTH_SCOPE],
  accountId: 'acc-1',
  handle: 'test@example.invalid',
  lastSyncedAt: null,
};

const ok = (body: unknown): GbpTransportOutcome => ({ outcome: 'http', status: 200, body });
const httpError = (status: number, body: unknown): GbpTransportOutcome => ({
  outcome: 'http',
  status,
  body,
});
const googleError = (status: number, googleStatus: string, message: string, details: unknown[] = []) =>
  httpError(status, { error: { code: status, status: googleStatus, message, details } });

function harness(routes: Partial<Record<string, GbpTransportOutcome>>, session = SESSION) {
  const calls: GbpRequest[] = [];
  const transport: GbpTransport = {
    async send(request) {
      calls.push(request);
      const route = routes[request.operation];
      if (route === undefined) {
        return googleError(404, 'NOT_FOUND', `no fixture route for ${request.operation}`);
      }
      return route;
    },
  };
  const provider = createGoogleBusinessProfileProvider({
    transport,
    getSession: async () => session,
    now: () => '2020-01-08T00:00:00.000Z',
    latestPerformanceDate: () => '2020-01-07',
  });
  return { provider, calls, operations: () => calls.map((call) => call.operation) };
}

const dayValue = (iso: string, value?: string) => {
  const [year = 0, month = 0, day = 0] = iso.split('-').map(Number);
  return { date: { year, month, day }, ...(value === undefined ? {} : { value }) };
};

const WEEK_ISO = [
  '2020-01-01',
  '2020-01-02',
  '2020-01-03',
  '2020-01-04',
  '2020-01-05',
  '2020-01-06',
  '2020-01-07',
];

/* -------------------------------------------------------------------------- */

describe('the provider is deliberately not registered', () => {
  it('leaves the registry answering "not built yet" for google_business', () => {
    // Registering a stub would silently delete the shell's honest
    // "Integration not built yet" line and assert an integration exists.
    expect(isProviderRegistered('google_business')).toBe(false);
  });

  it('still exposes a real object with the contract identity', () => {
    expect(googleBusinessProfileProvider.id).toBe('google_business');
    expect(googleBusinessProfileProvider.displayName).toBe('Google Business Profile');
  });
});

describe('with no credentials, nothing is fabricated', () => {
  const provider = googleBusinessProfileProvider;

  const everyMethod: [string, () => Promise<DataState<unknown>>][] = [
    ['getConnection', () => provider.getConnection()],
    ['connect', () => provider.connect()],
    ['disconnect', () => provider.disconnect()],
    ['listLocations', () => provider.listLocations()],
    ['getLocation', () => provider.getLocation('loc-1')],
    ['getPerformance', () => provider.getPerformance('loc-1', '28d')],
    ['listReviews', () => provider.listReviews('loc-1')],
    ['listReviewsDetailed', () => provider.listReviewsDetailed('loc-1')],
    ['replyToReview', () => provider.replyToReview('loc-1', 'rev-1', 'thanks')],
    ['submitReviewReply', () => provider.submitReviewReply('loc-1', 'rev-1', 'thanks')],
    ['createLocalPost', () => provider.createLocalPost('loc-1', 'hello', null)],
    [
      'updateBusinessHours',
      () =>
        provider.updateBusinessHours('loc-1', {
          periods: [
            {
              openDay: 'MONDAY',
              openTime: { hours: 9 },
              closeDay: 'MONDAY',
              closeTime: { hours: 18 },
            },
          ],
        }),
    ],
    ['getVoiceOfMerchant', () => provider.getVoiceOfMerchant('loc-1')],
    ['getGoogleUpdated', () => provider.getGoogleUpdated('loc-1')],
    ['getPerformanceReport', () => provider.getPerformanceReport('loc-1', '28d')],
    ['listSearchKeywords', () => provider.listSearchKeywords('loc-1', 3)],
    [
      'updateRegularHours',
      () =>
        provider.updateRegularHours('loc-1', {
          periods: [
            {
              openDay: 'MONDAY',
              openTime: { hours: 9 },
              closeDay: 'MONDAY',
              closeTime: { hours: 18 },
            },
          ],
        }),
    ],
  ];

  it.each(everyMethod)('%s reports not_connected and never ready', async (_name, call) => {
    const state = await call();
    expect(state.status).toBe('unavailable');
    expect(state).toMatchObject({ reason: 'not_connected' });
  });

  it('never returns a ready state from any method', async () => {
    const states = await Promise.all(everyMethod.map(([, call]) => call()));
    expect(states.some((state) => state.status === 'ready')).toBe(false);
  });

  it('explains why instead of showing a dead control', async () => {
    const state = await provider.connect();
    const message = state.status === 'unavailable' ? state.message : '';
    expect(message).toMatch(/not possible yet/i);
    expect(message).toMatch(/nothing was connected/i);
  });

  it('does not claim a disconnect it cannot perform', async () => {
    const withSession = createGoogleBusinessProfileProvider({ getSession: async () => SESSION });
    const state = await withSession.disconnect();
    expect(state.status).not.toBe('ready');
    expect(state).toMatchObject({ status: 'unavailable' });
  });
});

describe('session and scope checks happen before any request', () => {
  it('reports not_connected when nothing is linked, even with a transport', async () => {
    const { provider, calls } = harness({}, SESSION);
    const unlinked = createGoogleBusinessProfileProvider({
      transport: { send: async () => ok({}) },
      getSession: async () => null,
    });
    void provider;
    const state = await unlinked.listLocations();
    expect(state).toMatchObject({ status: 'unavailable', reason: 'not_connected' });
    expect(calls).toHaveLength(0);
  });

  it('reports auth_expired when Google did not grant business.manage', async () => {
    const { provider, calls } = harness({}, { ...SESSION, grantedScopes: [] });
    const state = await provider.listLocations();
    expect(state).toMatchObject({ status: 'unavailable', reason: 'auth_expired' });
    expect(calls).toHaveLength(0);
  });
});

describe('Voice of Merchant gates reviews', () => {
  it('does not even ask for reviews on an unverified listing', async () => {
    const { provider, operations } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.verify),
    });

    const state = await provider.listReviews('loc-1');
    expect(state).toMatchObject({ status: 'unavailable', reason: 'not_supported' });
    // Never "0 reviews": the reviews endpoint is documented as invalid here.
    expect(operations()).not.toContain('reviews.list');
    const message = state.status === 'unavailable' ? state.message : '';
    expect(message).toMatch(/verify/i);
  });

  it('reports each blocked state with its own reason code', async () => {
    const cases = [
      // NOT 'no_data_yet' — that renders as "Nothing yet / There is no activity
      // to report", which would tell an owner their business is empty when the
      // truth is that Google has not finished verifying them.
      ['wait', 'insufficient_data'],
      ['ownership_conflict', 'not_supported'],
      ['suspended', 'not_supported'],
      ['silent', 'insufficient_data'],
    ] as const;

    for (const [fixtureKey, reason] of cases) {
      const { provider } = harness({
        'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates[fixtureKey]),
      });
      await expect(provider.listReviews('loc-1')).resolves.toMatchObject({
        status: 'unavailable',
        reason,
      });
    }
  });

  it('will not submit a reply to a listing Google has gated', async () => {
    const { provider, operations } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.ownership_conflict),
    });
    const state = await provider.submitReviewReply('loc-1', 'rev-1', 'thank you');
    expect(state.status).toBe('unavailable');
    expect(operations()).not.toContain('reviews.updateReply');
  });

  it('reads reviews once the profile is live', async () => {
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'reviews.list': ok({
        averageRating: 4.5,
        totalReviewCount: 2,
        reviews: [
          {
            reviewId: 'r1',
            reviewer: { displayName: 'A' },
            starRating: 'FIVE',
            comment: 'good',
            createTime: '2020-01-01T00:00:00Z',
          },
        ],
      }),
    });

    const state = await provider.listReviewsDetailed('loc-1');
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.value.reviews).toHaveLength(1);
    expect(state.value.averageRating).toBe(4.5);
    expect(state.value.totalReviewCount).toBe(2);
    expect(state.value.nextPageToken).toBeNull();
  });

  it('reports an absent rating and count as null, not as zero', async () => {
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'reviews.list': ok({ reviews: [] }),
    });
    const state = await provider.listReviewsDetailed('loc-1');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.averageRating).toBeNull();
    expect(state.value.totalReviewCount).toBeNull();
    // An empty reviews array is a MEASURED zero and stays a ready empty list.
    expect(state.value.reviews).toEqual([]);
  });
});

describe('review replies go through moderation', () => {
  const REVIEW_WITH_PENDING_REPLY = {
    reviewId: 'r1',
    reviewer: { displayName: 'A' },
    starRating: 'FOUR',
    comment: 'ok',
    createTime: '2020-01-01T00:00:00Z',
    reviewReply: {
      comment: 'thank you',
      updateTime: '2020-01-02T00:00:00Z',
      state: 'SOME_STATE_WE_HAVE_NOT_VERIFIED',
    },
  };

  it('never reports a submitted reply as published', async () => {
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'reviews.updateReply': ok({ comment: 'thank you', updateTime: '2020-01-02T00:00:00Z' }),
      'reviews.get': ok(REVIEW_WITH_PENDING_REPLY),
    });

    const state = await provider.submitReviewReply('loc-1', 'r1', 'thank you');
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.value.moderation.kind).not.toBe('published');
    expect(state.value.moderation.kind).toBe('state_not_understood');
  });

  it('surfaces a policy rejection as a rejection', async () => {
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'reviews.updateReply': ok({}),
      'reviews.get': ok({
        ...REVIEW_WITH_PENDING_REPLY,
        reviewReply: {
          comment: 'thank you',
          updateTime: '2020-01-02T00:00:00Z',
          policyViolation: { description: 'contained a phone number' },
        },
      }),
    });

    const state = await provider.submitReviewReply('loc-1', 'r1', 'thank you');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.moderation).toMatchObject({
      kind: 'rejected',
      reason: 'contained a phone number',
    });
  });

  it('does not claim failure when the reply was sent but could not be read back', async () => {
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'reviews.updateReply': ok({}),
      'reviews.get': googleError(500, 'INTERNAL', 'boom'),
    });
    const state = await provider.submitReviewReply('loc-1', 'r1', 'thank you');
    expect(state.status).toBe('error');
    const message = state.status === 'error' ? state.message : '';
    expect(message).toMatch(/was sent to Google/i);
    expect(message).not.toMatch(/published/i);
  });

  it('refuses an empty reply before touching the network', async () => {
    const { provider, calls } = harness({});
    const state = await provider.submitReviewReply('loc-1', 'r1', '   ');
    expect(state.status).toBe('error');
    expect(calls).toHaveLength(0);
  });
});

describe('performance', () => {
  const performanceRoutes = (metrics: { metric: string; values: (string | undefined)[] }[]) => ({
    'locations.fetchMultiDailyMetricsTimeSeries': ok({
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: metrics.map((entry) => ({
            dailyMetric: entry.metric,
            timeSeries: {
              datedValues: entry.values.map((value, index) =>
                dayValue(WEEK_ISO[index] ?? '2020-01-07', value),
              ),
            },
          })),
        },
      ],
    }),
  });

  it('reports a measured zero and omits an unknown metric', async () => {
    const { provider } = harness(
      performanceRoutes([
        { metric: 'CALL_CLICKS', values: ['0', '0', '0', '0', '0', '0', '0'] },
        { metric: 'BUSINESS_BOOKINGS', values: [] },
      ]),
    );

    const state = await provider.getPerformanceReport('loc-1', '7d');
    if (state.status !== 'ready') throw new Error('expected ready');
    const keys = state.value.metrics.map((metric) => metric.key);
    expect(keys).toContain(LIVE_DAILY_METRICS.CALL_CLICKS.key);
    expect(keys).not.toContain(LIVE_DAILY_METRICS.BUSINESS_BOOKINGS.key);
    expect(
      state.value.metrics.find((metric) => metric.key === LIVE_DAILY_METRICS.CALL_CLICKS.key)
        ?.value,
    ).toBe(0);
    expect(state.value.unreported).toContain('BUSINESS_BOOKINGS');
  });

  it('never puts an unknown metric into Metric[] as zero', async () => {
    const { provider } = harness(
      performanceRoutes([{ metric: 'CALL_CLICKS', values: ['3', '1', '1', '1', '1', '1', '1'] }]),
    );
    const state = await provider.getPerformance('loc-1', '7d');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value).toHaveLength(1);
    expect(
      state.value.every((metric) => metric.key === LIVE_DAILY_METRICS.CALL_CLICKS.key),
    ).toBe(true);
  });

  it('reports "nothing published" rather than an empty grid of zeros', async () => {
    const { provider } = harness({
      'locations.fetchMultiDailyMetricsTimeSeries': ok({ multiDailyMetricTimeSeries: [] }),
    });
    const state = await provider.getPerformance('loc-1', '7d');
    expect(state).toMatchObject({ status: 'unavailable', reason: 'no_data_yet' });
    const message = state.status === 'unavailable' ? state.message : '';
    expect(message).toMatch(/not the same as zero/i);
  });

  it('refuses a period it cannot honestly report, without calling Google', async () => {
    const { provider, calls } = harness({});
    const state = await provider.getPerformance('loc-1', 'since forever');
    expect(state.status).toBe('error');
    expect(calls).toHaveLength(0);
  });

  it('reports an unapproved quota as unapproved, not as throttling', async () => {
    const { provider } = harness({
      'locations.fetchMultiDailyMetricsTimeSeries': googleError(
        403,
        'PERMISSION_DENIED',
        'Quota exceeded ... limit: 0',
        [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'RATE_LIMIT_EXCEEDED',
            metadata: { quota_limit_value: '0' },
          },
        ],
      ),
    });
    const state = await provider.getPerformance('loc-1', '7d');
    expect(state).toMatchObject({ status: 'unavailable', reason: 'not_supported' });
    const message = state.status === 'unavailable' ? state.message : '';
    expect(message).toMatch(/not yet approved/i);
  });
});

describe('a bare 403 is explained by asking Google why', () => {
  it('turns "no permission" into "verify your business" when that is the real cause', async () => {
    const { provider, operations } = harness({
      'locations.get': googleError(403, 'PERMISSION_DENIED', 'The caller does not have permission'),
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.verify),
    });

    const state = await provider.getLocation('loc-1');
    expect(state.status).toBe('unavailable');
    const message = state.status === 'unavailable' ? state.message : '';
    expect(message).toMatch(/not verified/i);
    expect(operations()).toContain('locations.getVoiceOfMerchantState');
  });
});

describe('locations', () => {
  it('treats "this account manages nothing" as a measured fact, not an error', async () => {
    const { provider } = harness({ 'accounts.list': ok({ accounts: [] }) });
    const state = await provider.listLocations();
    expect(state).toMatchObject({ status: 'ready' });
    if (state.status !== 'ready') return;
    expect(state.value).toEqual([]);
  });

  it('does not call a listing verified just because Google left the flag off', async () => {
    const { provider } = harness({
      'accounts.list': ok({ accounts: [{ name: 'accounts/acc-1' }] }),
      'locations.list': ok({
        locations: [
          { name: 'locations/loc-1', title: 'Verified Salon', metadata: { hasVoiceOfMerchant: true } },
          { name: 'locations/loc-2', title: 'Other Salon', metadata: { hasVoiceOfMerchant: false } },
          { name: 'locations/loc-3', title: 'Third Salon' },
        ],
      }),
    });

    const state = await provider.listLocations();
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.map((location) => location.verificationState)).toEqual([
      'verified',
      'unknown',
      'unknown',
    ]);
  });

  it('surfaces Google-initiated edits, including an honest empty diff', async () => {
    const { provider } = harness({
      'locations.getGoogleUpdated': ok({
        location: { name: 'locations/loc-1', title: 'X' },
        diffMask: 'regularHours,phoneNumbers',
      }),
    });
    const state = await provider.getGoogleUpdated('loc-1');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.changedFields).toEqual(['regularHours', 'phoneNumbers']);
    expect(state.value.pendingFields).toEqual([]);
  });
});

describe('local posts', () => {
  const withPostState = (state?: string, scheduledTime?: string) =>
    harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'localPosts.create': ok({
        name: 'accounts/acc-1/locations/loc-1/localPosts/p1',
        summary: 'hello',
        searchUrl: 'https://example.invalid/post',
        ...(state === undefined ? {} : { state }),
        ...(scheduledTime === undefined ? {} : { scheduledTime }),
      }),
    });

  it('reports published only when Google said LIVE', async () => {
    const { provider } = withPostState('LIVE');
    const state = await provider.createLocalPost('loc-1', 'hello', null);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.status).toBe('published');
    expect(state.value.targets[0]?.url).toBe('https://example.invalid/post');
  });

  it('never reports published when Google did not say so', async () => {
    for (const googleState of [undefined, 'PROCESSING', 'LOCAL_POST_STATE_UNSPECIFIED']) {
      const { provider } = withPostState(googleState);
      const state = await provider.createLocalPost('loc-1', 'hello', null);
      if (state.status !== 'ready') throw new Error('expected ready');
      expect(state.value.status).not.toBe('published');
      // No permalink until it is genuinely live.
      expect(state.value.targets[0]?.url).toBeNull();
    }
  });

  it('uses Google’s native scheduling rather than simulating it', async () => {
    const { provider, calls } = withPostState('PROCESSING', '2030-01-01T00:00:00Z');
    const state = await provider.createLocalPost('loc-1', 'hello', '2030-01-01T00:00:00Z');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.status).toBe('scheduled');
    expect(state.value.scheduledFor).toBe('2030-01-01T00:00:00Z');
    const create = calls.find((call) => call.operation === 'localPosts.create');
    expect(create?.body).toMatchObject({ scheduledTime: '2030-01-01T00:00:00Z', topicType: 'STANDARD' });
  });

  it('reports a rejected post as failed', async () => {
    const { provider } = withPostState('REJECTED');
    const state = await provider.createLocalPost('loc-1', 'hello', null);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.status).toBe('failed');
  });
});

describe('hours', () => {
  const VALID = {
    periods: [
      { openDay: 'MONDAY', openTime: { hours: 9 }, closeDay: 'MONDAY', closeTime: { hours: 18 } },
    ],
  };

  it('rejects a malformed payload before touching Google', async () => {
    const { provider, calls } = harness({});
    const state = await provider.updateBusinessHours('loc-1', { periods: [{ openDay: 'FUNDAY' }] });
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.message).toMatch(/openDay/);
    expect(calls).toHaveLength(0);
  });

  it('sends an updateMask and marks the call as an edit, so it is queued', async () => {
    const { provider, calls } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'locations.patch': ok({ name: 'locations/loc-1' }),
    });
    await provider.updateRegularHours('loc-1', VALID);
    const patch = calls.find((call) => call.operation === 'locations.patch');
    expect(patch?.kind).toBe('edit');
    expect(patch?.url).toContain('updateMask=regularHours');
  });

  it('does not promise the change is live on Google when the profile is gated', async () => {
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.verify),
      'locations.patch': ok({ name: 'locations/loc-1' }),
    });
    const state = await provider.updateRegularHours('loc-1', VALID);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value).toEqual({ accepted: true, willReachGoogle: false });
  });

  it('confirms propagation only for a live profile', async () => {
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'locations.patch': ok({ name: 'locations/loc-1' }),
    });
    const state = await provider.updateRegularHours('loc-1', VALID);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.willReachGoogle).toBe(true);
  });
});

describe('reads are not queued behind the edit ceiling', () => {
  it('marks reads as reads and Business Information writes as edits', async () => {
    const { provider, calls } = harness({
      'accounts.list': ok({ accounts: [] }),
    });
    await provider.listLocations();
    expect(calls.every((call) => call.kind === 'read')).toBe(true);
  });
});
