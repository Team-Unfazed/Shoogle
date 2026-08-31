/**
 * Service areas — read defensively, because the shape is UNVERIFIED.
 * Owner: Pranay.
 *
 * WHY THIS IS NOT IN `types.ts`
 * ----------------------------
 * `serviceArea` is in `LOCATION_READ_MASK`, so Google is asked for it on every
 * `locations.get`. But `GbpLocationWire` declares no member for it, because
 * docs/research/google-business-profile.md §9 confirms only that the field
 * exists and is writable — it never quotes the sub-message. This feature's rule
 * is that unverified means unknown, and a wire interface is a claim about what
 * Google sends. So instead of inventing one, this module reads the raw payload
 * defensively and reports exactly what it could and could not understand.
 *
 * THE THREE OUTCOMES, AND WHY THEY MUST STAY APART
 * ------------------------------------------------
 *   absent      Google returned the location with no `serviceArea` at all. This
 *               business does not travel to customers — a MEASUREMENT.
 *   read        Google returned a shape we recognise. `places` may legitimately
 *               be empty, which is also a measurement.
 *   unrecognised Google returned something we cannot read. NOT zero areas, and
 *               not "no service area" — unknown, and it says so.
 *
 * Collapsing the third into the first would tell a mobile repair shop that it
 * serves nowhere, which is both false and expensive: service areas drive how
 * far Google is willing to show a business from.
 *
 * There is no `as`, no `any` and no optional-chaining through an assumed shape
 * anywhere below. Everything is checked before it is read.
 */

/**
 * `Location.serviceArea.businessType`. These three members are used verbatim by
 * `features/audit/types.ts` (`GbpBusinessType`) and come from the Business
 * Information reference; the SURROUNDING message is what is unverified.
 */
export type ServiceAreaBusinessType =
  | 'BUSINESS_TYPE_UNSPECIFIED'
  | 'CUSTOMER_LOCATION_ONLY'
  | 'CUSTOMER_AND_BUSINESS_LOCATION';

const BUSINESS_TYPES: readonly ServiceAreaBusinessType[] = [
  'BUSINESS_TYPE_UNSPECIFIED',
  'CUSTOMER_LOCATION_ONLY',
  'CUSTOMER_AND_BUSINESS_LOCATION',
];

export interface ServiceAreaPlace {
  name: string;
  /** Google's own id for the place, when it sent one. */
  placeId: string | null;
}

export type ServiceAreaObservation =
  /** Google returned the location and there was no service area on it. */
  | { kind: 'absent' }
  | {
      kind: 'read';
      /** Null when Google sent no business type, or one we do not recognise. */
      businessType: ServiceAreaBusinessType | null;
      /** Null when Google sent a business type string we do not recognise. */
      unrecognisedBusinessType: string | null;
      places: readonly ServiceAreaPlace[];
      /**
       * Entries Google sent that carried no readable place name. These are REAL
       * service areas that Shoogle cannot name, so the list above is incomplete
       * and any screen showing it must say so.
       */
      unreadablePlaces: number;
    }
  /** Google sent something for this field that Shoogle cannot read at all. */
  | { kind: 'unrecognised'; detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBusinessType(value: unknown): {
  known: ServiceAreaBusinessType | null;
  unrecognised: string | null;
} {
  if (value === undefined) return { known: null, unrecognised: null };
  const raw = readString(value);
  if (raw === null) return { known: null, unrecognised: null };
  const match = BUSINESS_TYPES.find((member) => member === raw);
  return match === undefined
    ? { known: null, unrecognised: raw }
    : { known: match, unrecognised: null };
}

/**
 * Read `serviceArea` off whatever Google actually sent for this location.
 *
 * Takes `unknown` on purpose: the caller holds a `GbpLocationWire`, which has no
 * `serviceArea` member, so the raw payload is the only source. Anything that
 * does not match is reported as unreadable rather than coerced.
 */
export function readServiceArea(raw: unknown): ServiceAreaObservation {
  if (raw === undefined || raw === null) return { kind: 'absent' };
  if (!isRecord(raw)) {
    return {
      kind: 'unrecognised',
      detail: 'Google sent a service area that was not an object.',
    };
  }

  const businessType = readBusinessType(raw['businessType']);

  const placesField = raw['places'];
  if (placesField === undefined) {
    // A service area with a business type but no places is a real state: the
    // business travels, but has not said how far.
    return {
      kind: 'read',
      businessType: businessType.known,
      unrecognisedBusinessType: businessType.unrecognised,
      places: [],
      unreadablePlaces: 0,
    };
  }

  if (!isRecord(placesField)) {
    return {
      kind: 'unrecognised',
      detail: 'Google sent a service-area places field that was not an object.',
    };
  }

  const infos = placesField['placeInfos'];
  if (infos === undefined) {
    return {
      kind: 'read',
      businessType: businessType.known,
      unrecognisedBusinessType: businessType.unrecognised,
      places: [],
      unreadablePlaces: 0,
    };
  }
  if (!Array.isArray(infos)) {
    return {
      kind: 'unrecognised',
      detail: 'Google sent a service-area place list that was not a list.',
    };
  }

  const places: ServiceAreaPlace[] = [];
  let unreadablePlaces = 0;
  for (const entry of infos) {
    if (!isRecord(entry)) {
      unreadablePlaces += 1;
      continue;
    }
    const name = readString(entry['placeName']);
    if (name === null) {
      unreadablePlaces += 1;
      continue;
    }
    places.push({ name, placeId: readString(entry['placeId']) });
  }

  return {
    kind: 'read',
    businessType: businessType.known,
    unrecognisedBusinessType: businessType.unrecognised,
    places,
    unreadablePlaces,
  };
}

/** Owner-facing English for what the business type means. Never invented. */
export function describeBusinessType(businessType: ServiceAreaBusinessType | null): string {
  switch (businessType) {
    case 'CUSTOMER_LOCATION_ONLY':
      return 'You go to the customer. Google shows no shop address for this listing.';
    case 'CUSTOMER_AND_BUSINESS_LOCATION':
      return 'Customers can come to you, and you also travel to them.';
    case 'BUSINESS_TYPE_UNSPECIFIED':
      return 'Google recorded a service area but did not say which kind of business this is.';
    case null:
      return 'Google did not say which kind of business this is, so Shoogle will not guess.';
  }
}
