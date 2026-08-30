/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA. Business profile editor.
 *
 * Read fixtures/README.md before using anything here. Google provides no
 * sandbox for the Business Profile APIs and recommends mocked responses, so
 * this is the test path Google itself names — not a shortcut around one.
 *
 * Every visible string carries `[FIXTURE]`, and access is gated behind
 * `isFixtureModeEnabled()` (which needs `__DEV__` **and**
 * `EXPO_PUBLIC_ENABLE_FIXTURES=1`), so a release build cannot reach any of it.
 *
 * WHAT THESE FIXTURES DELIBERATELY MODEL
 * --------------------------------------
 * The profile editor's whole job is keeping four different kinds of "nothing"
 * apart, so the fixture supplies one of each:
 *
 *   FILLED           title, category, description, phone, hours.
 *   MEASURED EMPTY   `websiteUri` is absent — Google was asked and returned
 *                    nothing, so it is genuinely not set.
 *   NEVER ASKED      `attributes` and `serviceItems` are outside
 *                    `LOCATION_READ_MASK`, so no fixture value exists for them
 *                    and the screen must render them as unknown, not empty.
 *   UNREADABLE       the service-area payload carries one entry with no place
 *                    name, so the list is provably short by one.
 *
 * It also models the two provenance facts that make this screen worth building:
 * Google changed `regularHours` and `phoneNumbers` on its own, and an owner edit
 * to `profile` is still pending on Google's side.
 *
 * And the profile is NOT verified. For a neighbourhood business in India that is
 * the likeliest real state, not an edge case, so it is the default here.
 */

import { isFixtureModeEnabled } from '@/lib/env';

import type {
  GbpGoogleUpdatedLocationWire,
  GbpLocationWire,
  GbpVoiceOfMerchantStateWire,
} from '@/features/gbp/types';

import { fixtureVoiceOfMerchantStates, gbpFixtureState } from './gbp';

/* -------------------------------------------------------------------------- */
/* The location                                                               */
/* -------------------------------------------------------------------------- */

const time = (hours: number, minutes: number): { hours: number; minutes: number } => ({
  hours,
  minutes,
});

/**
 * A six-day-a-week neighbourhood business, closed Sundays.
 *
 * `websiteUri` is missing ON PURPOSE — it is the measured-empty case, and it is
 * also the field Google's own API access request requires, so the gap is real.
 */
export const fixtureProfileLocationWire: GbpLocationWire = {
  name: 'locations/fixture-profile-0001',
  languageCode: 'en',
  title: '[FIXTURE] Example Driving School, Nerul',
  storefrontAddress: {
    regionCode: 'IN',
    languageCode: 'en',
    locality: '[FIXTURE] Nerul',
    administrativeArea: '[FIXTURE] Maharashtra',
    postalCode: '000000',
    addressLines: ['[FIXTURE] Shop 1, Example Road'],
  },
  categories: {
    primaryCategory: {
      name: 'categories/gcid:fixture_driving_school',
      displayName: '[FIXTURE] Driving school',
    },
    additionalCategories: [
      { name: 'categories/gcid:fixture_licence_help', displayName: '[FIXTURE] Licence assistance' },
      { name: 'categories/gcid:fixture_driving_test', displayName: '[FIXTURE] Driving test centre' },
    ],
  },
  phoneNumbers: { primaryPhone: '+91 00000 00000' },
  // websiteUri is intentionally absent: the MEASURED EMPTY case.
  profile: {
    description:
      '[FIXTURE] Example description written for layout only. Not written by, or about, a real business.',
  },
  regularHours: {
    periods: [
      { openDay: 'MONDAY', openTime: time(9, 30), closeDay: 'MONDAY', closeTime: time(20, 0) },
      { openDay: 'TUESDAY', openTime: time(9, 30), closeDay: 'TUESDAY', closeTime: time(20, 0) },
      { openDay: 'WEDNESDAY', openTime: time(9, 30), closeDay: 'WEDNESDAY', closeTime: time(20, 0) },
      { openDay: 'THURSDAY', openTime: time(9, 30), closeDay: 'THURSDAY', closeTime: time(20, 0) },
      { openDay: 'FRIDAY', openTime: time(9, 30), closeDay: 'FRIDAY', closeTime: time(20, 0) },
      { openDay: 'SATURDAY', openTime: time(9, 30), closeDay: 'SATURDAY', closeTime: time(18, 0) },
      // No SUNDAY period. With hours set, that is a measured "Closed" — which is
      // a different fact from having no hours at all.
    ],
  },
  specialHours: {
    specialHourPeriods: [
      // Covers Gandhi Jayanti, which is in INDIA_HOLIDAY_CALENDAR. Christmas is
      // in the same calendar and deliberately NOT covered, so the festival card
      // has one of each.
      {
        startDate: { year: 2026, month: 10, day: 2 },
        endDate: { year: 2026, month: 10, day: 2 },
        closed: true,
      },
    ],
  },
  openInfo: { status: 'OPEN' },
  metadata: {
    hasVoiceOfMerchant: false,
    hasGoogleUpdated: true,
    hasPendingEdits: true,
    placeId: 'fixture-place-profile-0001',
  },
};

/**
 * The same listing with two periods Google sent that cannot be read: one with no
 * day, one with an hour outside 0–23. Used to prove the hours table reports
 * itself as incomplete rather than quietly showing fewer days.
 */
export const fixtureProfileLocationUnreadableHoursWire: GbpLocationWire = {
  ...fixtureProfileLocationWire,
  regularHours: {
    periods: [
      { openDay: 'MONDAY', openTime: time(9, 30), closeDay: 'MONDAY', closeTime: time(20, 0) },
      { openTime: time(9, 30), closeTime: time(20, 0) },
      { openDay: 'TUESDAY', openTime: { hours: 99 }, closeDay: 'TUESDAY', closeTime: time(20, 0) },
    ],
  },
};

/**
 * A listing with NO regular hours at all. Google was asked and returned none —
 * which must never render as seven "Closed" rows.
 */
export const fixtureProfileLocationNoHoursWire: GbpLocationWire = {
  ...fixtureProfileLocationWire,
  regularHours: undefined,
  specialHours: undefined,
};

/* -------------------------------------------------------------------------- */
/* Service area — an UNVERIFIED shape, read defensively                       */
/* -------------------------------------------------------------------------- */

/**
 * Typed as `unknown` on purpose.
 *
 * `GbpLocationWire` has no `serviceArea` member because the research doc
 * confirms the field exists and is writable but never quotes its sub-message.
 * `readServiceArea` therefore validates whatever arrives, and this fixture is
 * shaped to exercise all of it: a known business type, two readable places, and
 * one entry with no place name that must be COUNTED rather than dropped.
 */
export const fixtureServiceAreaPayload: unknown = {
  businessType: 'CUSTOMER_AND_BUSINESS_LOCATION',
  places: {
    placeInfos: [
      { placeName: '[FIXTURE] Nerul', placeId: 'fixture-place-nerul' },
      { placeName: '[FIXTURE] Seawoods', placeId: 'fixture-place-seawoods' },
      // No `placeName`: a real service area Shoogle cannot name.
      { placeId: 'fixture-place-unnamed' },
    ],
  },
};

/** A payload in a shape Shoogle does not recognise at all. */
export const fixtureServiceAreaUnrecognisedPayload: unknown = {
  businessType: 'CUSTOMER_LOCATION_ONLY',
  places: 'fixture-not-an-object',
};

/* -------------------------------------------------------------------------- */
/* What Google changed behind the owner's back                                */
/* -------------------------------------------------------------------------- */

/**
 * Google rewrote the hours and the phone number, and an owner edit to the
 * description has not been applied. No competitor surfaces either fact.
 */
export const fixtureProfileGoogleUpdated: GbpGoogleUpdatedLocationWire = {
  location: {
    ...fixtureProfileLocationWire,
    phoneNumbers: { primaryPhone: '+91 11111 11111' },
  },
  diffMask: 'regularHours,phoneNumbers',
  pendingMask: 'profile',
};

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Unverified, with no pending verification. This is the state a brand-new
 * neighbourhood listing is actually in, and it is what makes every write on
 * these screens say "accepted" rather than "live".
 */
export const fixtureProfileVoiceOfMerchant: GbpVoiceOfMerchantStateWire =
  fixtureVoiceOfMerchantStates.verify;

/* -------------------------------------------------------------------------- */
/* Gated access                                                               */
/* -------------------------------------------------------------------------- */

export interface GbpProfileFixtures {
  location: GbpLocationWire;
  /** Raw, unvalidated. Callers must go through `readServiceArea`. */
  serviceArea: unknown;
  googleUpdated: GbpGoogleUpdatedLocationWire;
  voiceOfMerchant: GbpVoiceOfMerchantStateWire;
  /** The fixture's own locality state, for the festival calendar. Never guessed. */
  stateCode: 'MH';
}

/**
 * The ONLY sanctioned way to read profile-editor fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()`, so the honest "nothing is
 * connected" path is always exercised too.
 */
export function getGbpProfileFixtures(): GbpProfileFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    location: fixtureProfileLocationWire,
    serviceArea: fixtureServiceAreaPayload,
    googleUpdated: fixtureProfileGoogleUpdated,
    voiceOfMerchant: fixtureProfileVoiceOfMerchant,
    stateCode: 'MH',
  };
}

/**
 * Wrap a profile fixture in a `DataState` carrying `isFixture: true`.
 *
 * Re-exported from `fixtures/gbp.ts` rather than reimplemented, so there is one
 * answer to "what does a GBP screen show when fixtures are off" — and that
 * answer is `not_connected`, exactly what the real adapter reports today.
 */
export { gbpFixtureState };
