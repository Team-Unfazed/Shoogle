/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA. Google Business Profile.
 *
 * Read fixtures/README.md before using anything here.
 *
 * Google provides NO sandbox for the Business Profile APIs — it says so
 * outright — and recommends mocked responses instead. So these fixtures are not
 * a shortcut around an integration; they are the test path Google itself names.
 *
 * Everything is invented and every visible string carries `[FIXTURE]`, so if
 * one ever reaches a screenshot, a demo or a bug report it is obvious at a
 * glance. Access is gated by `isFixtureModeEnabled()`, which requires `__DEV__`
 * AND `EXPO_PUBLIC_ENABLE_FIXTURES=1`, so a release build cannot reach it.
 *
 * WHAT IS DELIBERATELY MODELLED HERE
 * ----------------------------------
 * - All four Voice of Merchant remedial states, plus the healthy state and the
 *   "Google said nothing" state. For a small Indian business the unhappy ones
 *   are the LIKELY states, so they get first-class fixtures.
 * - A metric with a real MEASURED ZERO day next to a metric with UNREPORTED
 *   days, because those two must never render the same way.
 * - A keyword whose volume Google returned as a THRESHOLD, which renders "<15".
 * - A review reply sitting in moderation, which must never render as published.
 */

import { isFixtureModeEnabled } from '@/lib/env';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';

import type {
  GbpFetchMultiDailyMetricsResponse,
  GbpGoogleUpdatedLocationWire,
  GbpKeywordRow,
  GbpListReviewsResponse,
  GbpLocationWire,
  GbpVoiceOfMerchantStateWire,
} from '@/features/gbp/types';

/** Fixed timestamp so snapshots are stable and nothing looks "live". */
const FIXTURE_TIMESTAMP = '2020-01-01T00:00:00.000Z';

/** Fixed dates inside the fixture performance window. */
const FIXTURE_DAYS = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04'] as const;

function googleDate(iso: string): { year: number; month: number; day: number } {
  const [year = 0, month = 0, day = 0] = iso.split('-').map(Number);
  return { year, month, day };
}

/* -------------------------------------------------------------------------- */
/* Locations                                                                  */
/* -------------------------------------------------------------------------- */

export const fixtureGbpLocationWire: GbpLocationWire = {
  name: 'locations/fixture-0001',
  title: '[FIXTURE] Example Salon',
  storefrontAddress: {
    regionCode: 'IN',
    locality: '[FIXTURE] Example Locality',
    administrativeArea: '[FIXTURE] Example State',
    postalCode: '000000',
    addressLines: ['[FIXTURE] 1 Example Road'],
  },
  categories: { primaryCategory: { name: 'categories/gcid:fixture', displayName: '[FIXTURE] Salon' } },
  websiteUri: 'https://example.invalid/fixture',
  phoneNumbers: { primaryPhone: '+91 00000 00000' },
  profile: { description: '[FIXTURE] Example description. Not written by a real business.' },
  metadata: { hasVoiceOfMerchant: true, hasGoogleUpdated: true, placeId: 'fixture-place-0001' },
};

/**
 * A service-area business with no storefront address and no Voice of Merchant.
 * Its address is genuinely absent — that is a fact about the listing, not a
 * missing value to fill in.
 */
export const fixtureGbpServiceAreaLocationWire: GbpLocationWire = {
  name: 'locations/fixture-0002',
  title: '[FIXTURE] Example Mobile Repair',
  categories: {
    primaryCategory: { name: 'categories/gcid:fixture2', displayName: '[FIXTURE] Repair shop' },
  },
  metadata: { hasVoiceOfMerchant: false },
};

/* -------------------------------------------------------------------------- */
/* Voice of Merchant — all six outcomes                                       */
/* -------------------------------------------------------------------------- */

export const fixtureVoiceOfMerchantStates: Readonly<
  Record<
    | 'healthy'
    | 'verify'
    | 'verify_pending'
    | 'wait'
    | 'ownership_conflict'
    | 'suspended'
    | 'disabled'
    | 'silent',
    GbpVoiceOfMerchantStateWire
  >
> = Object.freeze({
  healthy: { hasVoiceOfMerchant: true, hasBusinessAuthority: true },
  /** The most common real state for a new small business. */
  verify: { hasVoiceOfMerchant: false, hasBusinessAuthority: false, verify: {} },
  verify_pending: {
    hasVoiceOfMerchant: false,
    hasBusinessAuthority: false,
    verify: { hasPendingVerification: true },
  },
  wait: { hasVoiceOfMerchant: false, hasBusinessAuthority: true, waitForVoiceOfMerchant: {} },
  /** A previous owner or an old agency still holds the listing. */
  ownership_conflict: {
    hasVoiceOfMerchant: false,
    hasBusinessAuthority: false,
    resolveOwnershipConflict: {},
  },
  suspended: {
    hasVoiceOfMerchant: false,
    hasBusinessAuthority: false,
    complyWithGuidelines: { recommendationReason: 'BUSINESS_LOCATION_SUSPENDED' },
  },
  disabled: {
    hasVoiceOfMerchant: false,
    hasBusinessAuthority: false,
    complyWithGuidelines: { recommendationReason: 'BUSINESS_LOCATION_DISABLED' },
  },
  /** Google answered with neither Voice of Merchant nor an action. */
  silent: { hasVoiceOfMerchant: false, hasBusinessAuthority: false },
});

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

export const fixtureReviewsResponse: GbpListReviewsResponse = {
  averageRating: 4.4,
  totalReviewCount: 3,
  reviews: [
    {
      name: 'accounts/fixture/locations/fixture-0001/reviews/fixture-review-0001',
      reviewId: 'fixture-review-0001',
      reviewer: { displayName: '[FIXTURE] Example Reviewer' },
      starRating: 'FIVE',
      comment: '[FIXTURE] Example review text. Not written by a real customer.',
      createTime: FIXTURE_TIMESTAMP,
      updateTime: FIXTURE_TIMESTAMP,
    },
    {
      // A reply that has been SUBMITTED. Google reports a moderation state we
      // have not verified the meaning of, so this must render as "submitted",
      // never as "published".
      name: 'accounts/fixture/locations/fixture-0001/reviews/fixture-review-0002',
      reviewId: 'fixture-review-0002',
      reviewer: { displayName: '[FIXTURE] Second Example Reviewer' },
      starRating: 'TWO',
      comment: '[FIXTURE] Example critical review text.',
      createTime: FIXTURE_TIMESTAMP,
      updateTime: FIXTURE_TIMESTAMP,
      reviewReply: {
        comment: '[FIXTURE] Example reply awaiting Google moderation.',
        updateTime: FIXTURE_TIMESTAMP,
        state: 'FIXTURE_UNVERIFIED_STATE',
      },
    },
    {
      // A reply Google REJECTED for a policy violation.
      name: 'accounts/fixture/locations/fixture-0001/reviews/fixture-review-0003',
      reviewId: 'fixture-review-0003',
      reviewer: { isAnonymous: true },
      starRating: 'FOUR',
      createTime: FIXTURE_TIMESTAMP,
      reviewReply: {
        comment: '[FIXTURE] Example reply that Google rejected.',
        updateTime: FIXTURE_TIMESTAMP,
        policyViolation: {
          violationType: 'FIXTURE_POLICY',
          description: '[FIXTURE] Example policy reason.',
        },
      },
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Performance                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Four days of two metrics, plus a metric Google reported nothing for.
 *
 * `CALL_CLICKS` includes a day whose value is the STRING "0" — a real measured
 * zero, which must render as 0.
 * `WEBSITE_CLICKS` has days with NO `value` field at all — unknown days, which
 * must never be counted as zero.
 * `BUSINESS_BOOKINGS` comes back completely empty, so it must be OMITTED from
 * `Metric[]` rather than shown as 0.
 * `DAILY_METRIC_UNKNOWN` is present to prove the sentinel is dropped.
 */
export const fixturePerformanceResponse: GbpFetchMultiDailyMetricsResponse = {
  multiDailyMetricTimeSeries: [
    {
      dailyMetricTimeSeries: [
        {
          dailyMetric: 'CALL_CLICKS',
          timeSeries: {
            datedValues: [
              { date: googleDate(FIXTURE_DAYS[0]), value: '3' },
              { date: googleDate(FIXTURE_DAYS[1]), value: '0' },
              { date: googleDate(FIXTURE_DAYS[2]), value: '2' },
              { date: googleDate(FIXTURE_DAYS[3]), value: '1' },
            ],
          },
        },
        {
          dailyMetric: 'WEBSITE_CLICKS',
          timeSeries: {
            datedValues: [
              { date: googleDate(FIXTURE_DAYS[0]), value: '7' },
              { date: googleDate(FIXTURE_DAYS[1]) },
              { date: googleDate(FIXTURE_DAYS[2]) },
              { date: googleDate(FIXTURE_DAYS[3]), value: '4' },
            ],
          },
        },
        {
          dailyMetric: 'BUSINESS_BOOKINGS',
          timeSeries: { datedValues: [] },
        },
        {
          dailyMetric: 'DAILY_METRIC_UNKNOWN',
          timeSeries: { datedValues: [{ date: googleDate(FIXTURE_DAYS[0]), value: '99' }] },
        },
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Search keywords                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One keyword with an exact count and one Google would only give a lower bound
 * for. The second renders "<15" — never 15, never 0.
 */
export const fixtureKeywordRows: GbpKeywordRow[] = [
  { keyword: '[fixture] example salon near me', impressions: { kind: 'exact', value: 42 } },
  { keyword: '[fixture] example haircut price', impressions: { kind: 'below_threshold', threshold: 15 } },
];

/* -------------------------------------------------------------------------- */
/* Google-initiated edits                                                     */
/* -------------------------------------------------------------------------- */

/** Google changed the hours and the phone number without being asked. */
export const fixtureGoogleUpdatedResponse: GbpGoogleUpdatedLocationWire = {
  location: {
    ...fixtureGbpLocationWire,
    phoneNumbers: { primaryPhone: '+91 11111 11111' },
  },
  diffMask: 'regularHours,phoneNumbers',
  pendingMask: 'profile',
};

/* -------------------------------------------------------------------------- */
/* Gated access                                                               */
/* -------------------------------------------------------------------------- */

export interface GbpFixtures {
  locations: GbpLocationWire[];
  voiceOfMerchant: typeof fixtureVoiceOfMerchantStates;
  reviews: GbpListReviewsResponse;
  performance: GbpFetchMultiDailyMetricsResponse;
  keywords: GbpKeywordRow[];
  googleUpdated: GbpGoogleUpdatedLocationWire;
}

/**
 * The ONLY sanctioned way to read GBP fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()`, so the honest "nothing here"
 * path is always exercised too.
 */
export function getGbpFixtures(): GbpFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    locations: [fixtureGbpLocationWire, fixtureGbpServiceAreaLocationWire],
    voiceOfMerchant: fixtureVoiceOfMerchantStates,
    reviews: fixtureReviewsResponse,
    performance: fixturePerformanceResponse,
    keywords: fixtureKeywordRows,
    googleUpdated: fixtureGoogleUpdatedResponse,
  };
}

/**
 * Wrap a GBP fixture in a `DataState` carrying `isFixture: true`, so the flag
 * travels with the value instead of depending on someone remembering.
 *
 * With fixture mode off this returns `not_connected` rather than the fixture —
 * the same state the real adapter reports today.
 */
export function gbpFixtureState<T>(value: T): DataState<T> {
  if (!isFixtureModeEnabled()) {
    return unavailable(
      'not_connected',
      'No Google Business Profile is connected, so there is nothing to show here.',
    );
  }
  return ready(value, FIXTURE_TIMESTAMP, true);
}
