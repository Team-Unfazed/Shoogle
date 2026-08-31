/**
 * DEVELOPMENT FIXTURES - NOT CUSTOMER DATA.
 *
 * Read fixtures/README.md before using anything here, and follow the pattern in
 * fixtures/index.ts exactly: every value is invented, every visible string
 * carries a [FIXTURE] marker, access is gated behind `isFixtureModeEnabled()`,
 * and anything handed out as a `DataState` carries `isFixture: true`.
 *
 * What this file is for: the audit engine is pure, so the only way to see the
 * Business tab render a SCORED report before Google Business Profile access
 * exists is to feed the engine a complete, obviously-fake set of observations.
 * That is what this is. It is not a second implementation of anything - it
 * builds inputs and calls the real engine, so the fixture screen exercises the
 * same code path production will.
 *
 * The fixture is deliberately NOT a perfect business. It carries an unanswered
 * 2-star review, no cover photo, a stale posting habit and a partially unchecked
 * Hours area, so the ordering, the coverage strip and the "not checked" line all
 * have something real to render.
 */

import {
  readCollection,
  runAuditEngine,
  type AuditInput,
  type AuditObservations,
  type AuditRun,
} from '@/features/audit';
import { isFixtureModeEnabled } from '@/lib/env';
import type { GbpReview } from '@/lib/providers/contracts';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';
import type { Business } from '@/types/domain';

/** Fixed timestamps so snapshots are stable and nothing looks "live". */
const FIXTURE_TIMESTAMP = '2020-01-01T00:00:00.000Z';
/** One day after everything was "fetched", so the freshness gate passes honestly. */
const FIXTURE_NOW = '2020-01-02T00:00:00.000Z';

const fixtureBusiness: Business = {
  id: 'fixture-business-0001',
  name: '[FIXTURE] Example Salon',
  category: 'salon',
  locality: '[FIXTURE] Example Locality',
  timezone: 'Asia/Kolkata',
};

/** `ready` with the fixture flag already set, so it cannot be forgotten. */
const fx = <T>(value: T): DataState<T> => ready(value, FIXTURE_TIMESTAMP, true);

function fixtureReview(
  index: number,
  starRating: GbpReview['starRating'],
  createTime: string,
  replied: boolean,
): GbpReview {
  return {
    reviewId: `fixture-review-${String(index).padStart(4, '0')}`,
    authorDisplayName: `[FIXTURE] Reviewer ${index}`,
    starRating,
    comment: '[FIXTURE] Invented review text. This is not a real customer.',
    createTime,
    reply: replied
      ? { comment: '[FIXTURE] Invented reply text.', updateTime: '2019-12-30T00:00:00.000Z' }
      : null,
  };
}

const fixtureReviews: GbpReview[] = [
  fixtureReview(1, 5, '2019-12-28T00:00:00.000Z', true),
  fixtureReview(2, 5, '2019-12-20T00:00:00.000Z', true),
  fixtureReview(3, 4, '2019-12-11T00:00:00.000Z', false),
  fixtureReview(4, 5, '2019-11-30T00:00:00.000Z', true),
  fixtureReview(5, 2, '2019-11-18T00:00:00.000Z', false),
  fixtureReview(6, 4, '2019-11-02T00:00:00.000Z', false),
  fixtureReview(7, 5, '2019-10-21T00:00:00.000Z', true),
  fixtureReview(8, 3, '2019-09-30T00:00:00.000Z', false),
  fixtureReview(9, 5, '2019-09-12T00:00:00.000Z', false),
  fixtureReview(10, 4, '2019-08-27T00:00:00.000Z', false),
  fixtureReview(11, 5, '2019-07-19T00:00:00.000Z', false),
  fixtureReview(12, 4, '2019-06-05T00:00:00.000Z', false),
];

/**
 * A complete set of observations for the fixture salon.
 *
 * Note the one deliberate `unavailable` in here is NOT in this object: every
 * observation is ready, and the Hours area still comes back partially unchecked
 * because the festival calendar cannot speak about January 2020. That is the
 * engine being honest on its own, which is exactly what the fixture should show.
 */
const fixtureObservations: AuditObservations = {
  owner: fx({
    business: fixtureBusiness,
    declaredName: '[FIXTURE] Example Salon',
    declaredServices: ['[FIXTURE] Haircut', '[FIXTURE] Hair spa'],
    declaredOpenStatus: 'open',
    confirmed24x7: null,
    confirmedNoWeeklyClosure: null,
    stateCode: 'MH',
    dismissedCheckIds: [],
  }),
  connection: fx({
    provider: 'google_business',
    status: 'connected',
    handle: '[FIXTURE] example-salon',
    grantedScopes: ['https://www.googleapis.com/auth/business.manage'],
    lastSyncedAt: FIXTURE_TIMESTAMP,
  }),
  locations: fx({ locationIds: ['fixture-location-0001'] }),
  location: fx({
    locationId: 'fixture-location-0001',
    title: '[FIXTURE] Example Salon',
    storefrontAddress: {
      addressLines: ['[FIXTURE] Shop 4, Example Building'],
      locality: '[FIXTURE] Example Locality',
      administrativeArea: 'Maharashtra',
      postalCode: '400706',
      regionCode: 'IN',
    },
    latLng: { latitude: 19.033, longitude: 73.019 },
    geocodedAddressLatLng: { latitude: 19.0331, longitude: 73.0191 },
    primaryPhone: '+91 98200 00000',
    websiteUri: 'https://fixture.example/',
    primaryCategory: { categoryId: 'gcid:beauty_salon', displayName: 'Beauty salon' },
    // `readCollection` says "Google answered, and this is what it said". An
    // empty one below is therefore a measured zero, not a gap in the fixture.
    additionalCategories: readCollection([
      { categoryId: 'gcid:hair_salon', displayName: 'Hair salon' },
      { categoryId: 'gcid:nail_salon', displayName: 'Nail salon' },
    ]),
    serviceItems: readCollection([
      { name: '[FIXTURE] Haircut', priceInPaise: 30_000 },
      { name: '[FIXTURE] Hair spa', priceInPaise: 120_000 },
    ]),
    regularHourPeriods: readCollection([
      { day: 'TUESDAY', openMinutes: 600, closeMinutes: 1200 },
      { day: 'WEDNESDAY', openMinutes: 600, closeMinutes: 1200 },
      { day: 'THURSDAY', openMinutes: 600, closeMinutes: 1200 },
      { day: 'FRIDAY', openMinutes: 600, closeMinutes: 1200 },
      { day: 'SATURDAY', openMinutes: 600, closeMinutes: 1260 },
      { day: 'SUNDAY', openMinutes: 600, closeMinutes: 1260 },
    ]),
    specialHourPeriods: readCollection([]),
    moreHours: readCollection([]),
    serviceArea: null,
    profileDescription:
      '[FIXTURE] A short invented description that does not mention the locality or any service, ' +
      'so the description check has something to say.',
    attributeIds: readCollection(['has_wheelchair_accessible_entrance']),
    openInfo: { status: 'OPEN' },
    metadata: {
      hasVoiceOfMerchant: true,
      canOperateLocalPost: true,
      canModifyServiceList: true,
      canHaveFoodMenus: false,
      placeId: 'fixture-place-0001',
    },
  }),
  verification: fx({ hasPendingVerification: false, pendingMethod: null }),
  reviews: fx({ items: fixtureReviews, replyFieldTrusted: true }),
  media: fx({
    ownerUploaded: [
      { category: 'INTERIOR', createTime: '2019-12-20T00:00:00.000Z' },
      { category: 'INTERIOR', createTime: '2019-11-04T00:00:00.000Z' },
      { category: 'PRODUCT', createTime: '2019-10-02T00:00:00.000Z' },
    ],
  }),
  localPosts: fx({
    items: [
      { createTime: '2019-11-15T00:00:00.000Z', hasCallToAction: false },
      { createTime: '2019-10-20T00:00:00.000Z', hasCallToAction: false },
    ],
  }),
  website: fx({
    requestedUrl: 'https://fixture.example/',
    fetchOutcome: 'ok',
    httpStatus: 200,
    finalUrl: 'https://fixture.example/',
    hasViewportMeta: true,
    siteBusinessName: '[FIXTURE] Example Salon',
    metaDescription: '[FIXTURE] Invented meta description.',
    telLinkPresent: true,
    jsonLdLocalBusiness: null,
  }),
  attributeCatalog: fx({
    availableAttributeIds: [
      'has_wheelchair_accessible_entrance',
      'pay_upi',
      'requires_appointments',
      'has_air_conditioning',
    ],
    highValueAttributeIds: ['pay_upi', 'requires_appointments', 'has_wheelchair_accessible_entrance'],
    labelsById: {
      has_wheelchair_accessible_entrance: 'Wheelchair access',
      pay_upi: 'UPI accepted',
      requires_appointments: 'Appointment needed',
      has_air_conditioning: 'Air conditioning',
    },
  }),
  searchKeywords: fx([
    { keyword: '[FIXTURE] hair spa near me', impressions: { kind: 'exact', value: 240 } },
    // A threshold, not a number. This must render as "<15", never as 15 and
    // never as 0 - see docs/research/google-business-profile.md §7b.
    { keyword: '[FIXTURE] salon example locality', impressions: { kind: 'below_threshold', threshold: 15 } },
  ]),
};

export const auditFixtureInput: AuditInput = {
  now: FIXTURE_NOW,
  observations: fixtureObservations,
};

/**
 * The honest opposite: what the engine is fed today, with no Google access. Kept
 * beside the happy fixture on purpose, so a dev screen can flip between "scored"
 * and "not measured yet" without inventing either one.
 */
export const auditUnconnectedInput: AuditInput = {
  now: FIXTURE_NOW,
  observations: {
    ...fixtureObservations,
    connection: unavailable('not_connected', 'No Google Business Profile is linked.'),
    locations: unavailable('not_connected', 'No Google Business Profile is linked.'),
    location: unavailable('not_connected', 'No Google Business Profile is linked.'),
    verification: unavailable('not_connected', 'No Google Business Profile is linked.'),
    reviews: unavailable('not_connected', 'No Google Business Profile is linked.'),
    media: unavailable('not_connected', 'No Google Business Profile is linked.'),
    localPosts: unavailable('not_connected', 'No Google Business Profile is linked.'),
    attributeCatalog: unavailable('not_connected', 'No Google Business Profile is linked.'),
    searchKeywords: unavailable('not_connected', 'No Google Business Profile is linked.'),
  },
};

export interface AuditFixtures {
  /** A scored run, with findings to order and an area that stays unchecked. */
  scored: AuditRun;
  /** The state the app is actually in today: no score, findings that still ran. */
  unconnected: AuditRun;
}

/**
 * The ONLY sanctioned way to read the audit fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()` - which requires a development
 * build AND `EXPO_PUBLIC_ENABLE_FIXTURES=1`. Callers must handle null, which
 * means the honest "nothing here" path is always exercised too.
 */
export function getAuditFixtures(): AuditFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    scored: runAuditEngine(auditFixtureInput),
    unconnected: runAuditEngine(auditUnconnectedInput),
  };
}
