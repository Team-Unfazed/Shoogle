/**
 * Builders for the audit tests. NOT fixtures.
 *
 * The difference matters and is not pedantic: `fixtures/audit.ts` is
 * development data that can reach a screen, so every string in it carries a
 * [FIXTURE] marker and access is gated behind `isFixtureModeEnabled()`. This
 * file is test scaffolding, never imported by the app, and its values are
 * chosen to make an assertion sharp rather than to look plausible on screen.
 */

import type { GbpReview } from '@/lib/providers/contracts';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';
import type { Business } from '@/types/domain';

import {
  AREA_WEIGHT,
  readCollection,
  type AuditArea,
  type AuditInput,
  type AuditObservations,
  type CheckDefinition,
  type CheckId,
  type CheckOutcome,
  type CheckResult,
  type GbpCategoryRef,
  type GbpLocationDetail,
  type GbpMoreHoursObservation,
  type GbpServiceItemObservation,
  type GbpSpecialHourPeriodObservation,
  type GbpTimePeriodObservation,
  type ObservationValues,
  type OwnerContext,
  type ReadCollection,
  type WebsiteObservation,
} from '../types';

export const NOW = '2026-08-30T00:00:00.000Z';
/** One day before NOW, so the freshness gate passes unless a test says otherwise. */
export const FETCHED = '2026-08-29T00:00:00.000Z';

const business: Business = {
  id: 'test-business',
  name: 'Sunrise Salon',
  category: 'salon',
  locality: 'Nerul, Navi Mumbai',
  timezone: 'Asia/Kolkata',
};

export const ok = <T>(value: T, fetchedAt: string = FETCHED): DataState<T> =>
  ready(value, fetchedAt);

export const notConnected = <T>(): DataState<T> =>
  unavailable('not_connected', 'No Google Business Profile is linked.');

export function ownerContext(overrides: Partial<OwnerContext> = {}): OwnerContext {
  return {
    business,
    declaredName: 'Sunrise Salon',
    declaredServices: ['Haircut', 'Hair spa'],
    declaredOpenStatus: 'open',
    confirmed24x7: null,
    confirmedNoWeeklyClosure: null,
    stateCode: 'MH',
    dismissedCheckIds: [],
    ...overrides,
  };
}

/** Every collection field on `GbpLocationDetail`, so the override type can name them. */
type LocationCollectionField =
  | 'additionalCategories'
  | 'serviceItems'
  | 'regularHourPeriods'
  | 'specialHourPeriods'
  | 'moreHours'
  | 'attributeIds';

/**
 * A test may pass a bare array (the overwhelmingly common case: "Google
 * returned this list") or an explicit `ReadCollection` when the point of the
 * test IS the difference between an empty list and an unread one.
 */
type Collectionish<T> = ReadCollection<T> | readonly T[];

function asCollection<T>(value: Collectionish<T>): ReadCollection<T> {
  return Array.isArray(value) ? readCollection(value as readonly T[]) : (value as ReadCollection<T>);
}

export type LocationOverrides = Partial<Omit<GbpLocationDetail, LocationCollectionField>> & {
  additionalCategories?: Collectionish<GbpCategoryRef>;
  serviceItems?: Collectionish<GbpServiceItemObservation>;
  regularHourPeriods?: Collectionish<GbpTimePeriodObservation>;
  specialHourPeriods?: Collectionish<GbpSpecialHourPeriodObservation>;
  moreHours?: Collectionish<GbpMoreHoursObservation>;
  attributeIds?: Collectionish<string>;
};

export function locationDetail(overrides: LocationOverrides = {}): GbpLocationDetail {
  const {
    additionalCategories,
    serviceItems,
    regularHourPeriods,
    specialHourPeriods,
    moreHours,
    attributeIds,
    ...scalars
  } = overrides;

  return {
    locationId: 'locations/1',
    title: 'Sunrise Salon',
    storefrontAddress: {
      addressLines: ['Shop 4, Sector 21'],
      locality: 'Nerul',
      administrativeArea: 'Maharashtra',
      postalCode: '400706',
      regionCode: 'IN',
    },
    latLng: { latitude: 19.033, longitude: 73.019 },
    geocodedAddressLatLng: { latitude: 19.0331, longitude: 73.019 },
    primaryPhone: '+91 98200 12345',
    websiteUri: 'https://sunrisesalon.example/',
    primaryCategory: { categoryId: 'gcid:beauty_salon', displayName: 'Beauty salon' },
    additionalCategories: asCollection(
      additionalCategories ?? [{ categoryId: 'gcid:hair_salon', displayName: 'Hair salon' }],
    ),
    serviceItems: asCollection(
      serviceItems ?? [
        { name: 'Haircut', priceInPaise: 30_000 },
        { name: 'Hair spa', priceInPaise: 120_000 },
      ],
    ),
    regularHourPeriods: asCollection(
      regularHourPeriods ?? [
        { day: 'TUESDAY', openMinutes: 600, closeMinutes: 1200 },
        { day: 'WEDNESDAY', openMinutes: 600, closeMinutes: 1200 },
        { day: 'THURSDAY', openMinutes: 600, closeMinutes: 1200 },
        { day: 'FRIDAY', openMinutes: 600, closeMinutes: 1200 },
        { day: 'SATURDAY', openMinutes: 600, closeMinutes: 1260 },
        { day: 'SUNDAY', openMinutes: 600, closeMinutes: 1260 },
      ],
    ),
    specialHourPeriods: asCollection(specialHourPeriods ?? []),
    moreHours: asCollection(moreHours ?? []),
    serviceArea: null,
    profileDescription:
      'Sunrise Salon has been cutting and colouring hair in Nerul since 2009. We do haircuts, ' +
      'colour, hair spa and bridal work, with a team of six stylists who have been with us for ' +
      'years. Walk in on a weekday or book ahead for weekends, when we are busiest. We use ' +
      'salon-grade products only and every tool is sterilised between clients, which is why most ' +
      'of our customers have been coming to us for a decade.',
    attributeIds: asCollection(attributeIds ?? ['pay_upi', 'requires_appointments']),
    openInfo: { status: 'OPEN' },
    metadata: {
      hasVoiceOfMerchant: true,
      canOperateLocalPost: true,
      canModifyServiceList: true,
      canHaveFoodMenus: false,
      placeId: 'ChIJtest',
    },
    ...scalars,
  };
}

export function review(
  index: number,
  starRating: GbpReview['starRating'],
  createTime: string,
  replied: boolean,
): GbpReview {
  return {
    reviewId: `reviews/${index}`,
    authorDisplayName: `Reviewer ${index}`,
    starRating,
    comment: 'Review text.',
    createTime,
    reply: replied ? { comment: 'Thank you!', updateTime: createTime } : null,
  };
}

/** Twelve reviews, all replied to, all recent: area F passes cleanly. */
export function healthyReviews(): GbpReview[] {
  return Array.from({ length: 12 }, (_, i) =>
    review(i + 1, 5, `2026-08-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`, true),
  );
}

export function websiteObservation(overrides: Partial<WebsiteObservation> = {}): WebsiteObservation {
  return {
    requestedUrl: 'https://sunrisesalon.example/',
    fetchOutcome: 'ok',
    httpStatus: 200,
    finalUrl: 'https://sunrisesalon.example/',
    hasViewportMeta: true,
    siteBusinessName: 'Sunrise Salon',
    metaDescription: 'Hair salon in Nerul.',
    telLinkPresent: true,
    jsonLdLocalBusiness: {
      type: 'HairSalon',
      name: 'Sunrise Salon',
      telephone: '+91 98200 12345',
      streetAddress: 'Shop 4, Sector 21',
      geoPrecision: 6,
      hasOpeningHoursSpecification: true,
    },
    ...overrides,
  };
}

/**
 * A fully connected, mostly healthy business. Individual tests override one
 * observation at a time so that what they are asserting about is the only thing
 * that differs from a passing baseline.
 */
export function healthyObservations(
  overrides: Partial<AuditObservations> = {},
): AuditObservations {
  const base: AuditObservations = {
    owner: ok(ownerContext()),
    connection: ok({
      provider: 'google_business',
      status: 'connected',
      handle: 'sunrise',
      grantedScopes: ['https://www.googleapis.com/auth/business.manage'],
      lastSyncedAt: FETCHED,
    }),
    locations: ok({ locationIds: ['locations/1'] }),
    location: ok(locationDetail()),
    verification: ok({ hasPendingVerification: false, pendingMethod: null }),
    reviews: ok({ items: healthyReviews(), replyFieldTrusted: true }),
    media: ok({
      ownerUploaded: [
        { category: 'COVER', createTime: '2026-08-01T00:00:00.000Z' },
        { category: 'EXTERIOR', createTime: '2026-08-01T00:00:00.000Z' },
        { category: 'INTERIOR', createTime: '2026-07-20T00:00:00.000Z' },
        { category: 'INTERIOR', createTime: '2026-07-19T00:00:00.000Z' },
        { category: 'TEAMS', createTime: '2026-07-18T00:00:00.000Z' },
        { category: 'AT_WORK', createTime: '2026-07-17T00:00:00.000Z' },
        { category: 'PRODUCT', createTime: '2026-07-16T00:00:00.000Z' },
        { category: 'PRODUCT', createTime: '2026-07-15T00:00:00.000Z' },
      ],
    }),
    localPosts: ok({
      items: Array.from({ length: 13 }, (_, i) => ({
        createTime: `2026-08-${String((i % 27) + 1).padStart(2, '0')}T00:00:00.000Z`,
        hasCallToAction: true,
      })),
    }),
    website: ok(websiteObservation()),
    attributeCatalog: ok({
      availableAttributeIds: ['pay_upi', 'requires_appointments'],
      highValueAttributeIds: ['pay_upi', 'requires_appointments'],
      labelsById: { pay_upi: 'UPI accepted', requires_appointments: 'Appointment needed' },
    }),
    searchKeywords: ok([
      { keyword: 'hair spa near me', impressions: { kind: 'exact', value: 240 } },
      { keyword: 'salon nerul', impressions: { kind: 'below_threshold', threshold: 15 } },
    ]),
  };
  return { ...base, ...overrides };
}

export function input(
  overrides: Partial<AuditObservations> = {},
  now: string = NOW,
): AuditInput {
  return { now, observations: healthyObservations(overrides) };
}

/** Replaces one observation with a ready value, keeping the rest healthy. */
export function withObservation<K extends keyof ObservationValues>(
  key: K,
  value: ObservationValues[K],
  now: string = NOW,
): AuditInput {
  return input({ [key]: ok(value) } as Partial<AuditObservations>, now);
}

/* -------------------------------------------------------------------------- */
/* Synthetic results, for testing the scorer without the checks                */
/* -------------------------------------------------------------------------- */

function stubCheck(id: CheckId, area: AuditArea, weight: number, scored = true): CheckDefinition {
  return {
    id,
    area,
    weight,
    scored,
    name: `stub ${id}`,
    severity: 'important',
    confidence: 'observed',
    intendedFixMode: 'guided',
    capability: { apiSupportsWrite: false, providerMethod: null, matrixNote: 'stub' },
    sources: ['own'],
    needs: ['owner'],
    leadingIndicator: 'stub',
    failureCheck: 'stub',
    evaluate: () => ({ outcome: { kind: 'pass' } }),
  };
}

export const outcomes = {
  pass: { kind: 'pass' } as CheckOutcome,
  fail: { kind: 'fail' } as CheckOutcome,
  warn: (ratio: number): CheckOutcome => ({ kind: 'warn', ratio }),
  notChecked: (): CheckOutcome => ({
    kind: 'not_checked',
    reason: 'not_connected',
    detail: 'stub',
  }),
  notApplicable: (): CheckOutcome => ({ kind: 'not_applicable', why: 'stub' }),
};

export interface SyntheticSpec {
  /** Units of weight in each area that could not be measured. */
  notChecked?: Partial<Record<AuditArea, number>>;
  /** Units of weight in each area that were measured and failed. */
  failed?: Partial<Record<AuditArea, number>>;
  /** Units of weight in each area that do not apply to this business. */
  notApplicable?: Partial<Record<AuditArea, number>>;
  /** Whether the A1 gate passed. */
  gatePasses?: boolean;
}

/**
 * Builds one weight-1 stub check per unit of area weight, so a test can dial
 * coverage in 1% steps. The foundation area keeps a real `A2` id so the
 * G-identity gate has something to find.
 */
export function syntheticResults(spec: SyntheticSpec = {}): CheckResult[] {
  const results: CheckResult[] = [];
  results.push({
    check: stubCheck('A1', 'foundation', 0, false),
    outcome: spec.gatePasses === false ? outcomes.fail : outcomes.pass,
    finding: null,
  });

  for (const area of Object.keys(AREA_WEIGHT) as AuditArea[]) {
    const total = AREA_WEIGHT[area];
    let unchecked = spec.notChecked?.[area] ?? 0;
    let failed = spec.failed?.[area] ?? 0;
    let na = spec.notApplicable?.[area] ?? 0;

    for (let i = 0; i < total; i += 1) {
      // The first scored check in foundation carries the A2 id so that
      // G-identity can see that something about the listing was readable.
      const id: CheckId = area === 'foundation' && i === 0 ? 'A2' : 'H2';
      let outcome = outcomes.pass;
      if (unchecked > 0) {
        outcome = outcomes.notChecked();
        unchecked -= 1;
      } else if (failed > 0) {
        outcome = outcomes.fail;
        failed -= 1;
      } else if (na > 0) {
        outcome = outcomes.notApplicable();
        na -= 1;
      }
      results.push({ check: stubCheck(id, area, 1), outcome, finding: null });
    }
  }
  return results;
}

/** An input whose only job is to make the freshness gate pass. */
export function syntheticInput(now: string = NOW): AuditInput {
  return input({}, now);
}
