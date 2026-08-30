/**
 * LocalBusiness JSON-LD generation and inspection for the Indian verticals.
 * Owner: Pranay.
 *
 * Two jobs:
 *   1. build correct `LocalBusiness` markup from facts we actually hold, and
 *   2. inspect markup already on a site and report which specific checks passed.
 *
 * ## Rules that keep this honest
 *
 * - **Never emit a property we do not have.** No empty strings, no `"N/A"`, no
 *   guessed coordinates. A missing property is reported to the owner as
 *   missing; it is not filled in.
 * - **Never emit `aggregateRating` or `review`.** Google's guidance is that a
 *   business must not serve its own aggregate rating, so the input type has no
 *   field for it and there is nothing to accidentally pass through.
 * - **Never claim "your schema is valid."** Google's Rich Results Test has no
 *   public API, so we cannot validate. We report which of OUR checks passed and
 *   name the rest as unchecked.
 * - **The copy is not a promise.** Google says structured data is not required
 *   for AI features. See `SCHEMA_HONEST_FRAMING`.
 *
 * Subtype map: docs/research/ai-search-visibility.md §3.2 (confirmed against
 * schema.org). Required/recommended properties: §3.1.
 */

import type { BusinessCategory } from '@/types/domain';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** The schema.org `LocalBusiness` descendants Shoogle's verticals map onto. */
export type LocalBusinessType =
  | 'LocalBusiness'
  | 'HairSalon'
  | 'BeautySalon'
  | 'NailSalon'
  | 'DaySpa'
  | 'HealthClub'
  | 'ExerciseGym'
  | 'MedicalClinic'
  | 'Dentist'
  | 'Physiotherapy'
  | 'Restaurant'
  | 'CafeOrCoffeeShop'
  | 'FastFoodRestaurant'
  | 'Bakery'
  | 'ClothingStore'
  | 'AutoRepair'
  | 'ProfessionalService';

/**
 * The most specific type Google's "use the most specific sub-type possible"
 * guidance supports for each vertical, without guessing.
 */
export const SCHEMA_TYPE_BY_CATEGORY: Readonly<Record<BusinessCategory, LocalBusinessType>> = {
  salon: 'HairSalon',
  gym: 'HealthClub',
  clinic: 'MedicalClinic',
  restaurant: 'Restaurant',
  bakery: 'Bakery',
  boutique: 'ClothingStore',
  repair_shop: 'AutoRepair',
  // Staying generic is better than guessing wrong.
  other: 'LocalBusiness',
};

/**
 * More specific alternatives an owner may legitimately pick instead. Offered as
 * a choice rather than inferred, because inferring "is this a nail salon or a
 * day spa" from a business name is exactly the kind of guess that produces
 * wrong markup.
 */
export const SCHEMA_TYPE_ALTERNATIVES: Readonly<
  Record<BusinessCategory, readonly LocalBusinessType[]>
> = {
  salon: ['HairSalon', 'BeautySalon', 'NailSalon', 'DaySpa'],
  gym: ['HealthClub', 'ExerciseGym'],
  clinic: ['MedicalClinic', 'Dentist', 'Physiotherapy'],
  restaurant: ['Restaurant', 'CafeOrCoffeeShop', 'FastFoodRestaurant'],
  bakery: ['Bakery'],
  boutique: ['ClothingStore'],
  repair_shop: ['AutoRepair', 'ProfessionalService'],
  other: ['LocalBusiness', 'ProfessionalService'],
};

const KNOWN_LOCAL_BUSINESS_TYPES: readonly string[] = [
  'LocalBusiness',
  ...new Set(Object.values(SCHEMA_TYPE_ALTERNATIVES).flat()),
];

/** The copy that must accompany the feature. Google: schema is not required. */
export const SCHEMA_HONEST_FRAMING =
  'Adds machine-readable business details to your site. Google says this is not required to ' +
  'appear in AI answers, but it is how search engines and assistants read your hours, address ' +
  'and services without guessing.';

export type DayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface OpeningHoursSpec {
  readonly days: readonly DayOfWeek[];
  /** `HH:MM`, 24-hour. */
  readonly opens: string;
  readonly closes: string;
}

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Every field is explicitly nullable or an array, so "we do not know this" is
 * representable and cannot be confused with an empty value that got emitted.
 *
 * There is deliberately no `aggregateRating`, `reviewCount` or `review` field.
 */
export interface LocalBusinessSchemaInput {
  readonly name: string;
  readonly category: BusinessCategory;
  /** Pick a more specific subtype from `SCHEMA_TYPE_ALTERNATIVES`. */
  readonly typeOverride?: LocalBusinessType | null;
  readonly url: string | null;
  readonly streetAddress: string | null;
  readonly addressLocality: string | null;
  /** State, e.g. 'Maharashtra'. */
  readonly addressRegion: string | null;
  /** Six-digit PIN. */
  readonly postalCode: string | null;
  /** E.164, e.g. '+919876543210'. */
  readonly telephone: string | null;
  readonly geo: GeoPoint | null;
  /** Under 100 characters, e.g. '₹₹' or '₹300–₹1500'. */
  readonly priceRange: string | null;
  readonly openingHours: readonly OpeningHoursSpec[];
  readonly imageUrls: readonly string[];
  /**
   * Localities served by a mobile or home-visit business. When this is
   * non-empty a missing `streetAddress` is legitimate, not a fault.
   */
  readonly areaServed: readonly string[];
  readonly servesCuisine: readonly string[];
  readonly description: string | null;
}

export interface LocalBusinessSchemaResult {
  readonly jsonLd: Record<string, unknown>;
  /** Google-required properties we could not emit. Blocks publication. */
  readonly missingRequired: readonly string[];
  /** Recommended properties we could not emit. Worth prompting for. */
  readonly missingRecommended: readonly string[];
  /** Things the owner should know about what we did and did not do. */
  readonly notes: readonly string[];
  /**
   * Whether this markup is worth putting on a page. False when a required
   * property is missing — half-complete markup is worse than none, because it
   * tells a search engine we have described the business when we have not.
   */
  readonly publishable: boolean;
}

/* -------------------------------------------------------------------------- */
/* Validators                                                                 */
/* -------------------------------------------------------------------------- */

/** Indian mobile/landline in E.164: `+91` then 10 digits starting 6-9. */
export function isIndianE164(value: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(value.trim());
}

/** Six-digit PIN, first digit 1-9. */
export function isIndianPin(value: string): boolean {
  return /^[1-9]\d{5}$/.test(value.trim());
}

/**
 * Google recommends five or more decimal places on `geo`. Fewer is a
 * neighbourhood, not a shopfront, and we say so rather than emitting it.
 */
export function hasSufficientGeoPrecision(geo: GeoPoint): boolean {
  const decimals = (value: number): number => {
    const text = String(value);
    const dot = text.indexOf('.');
    return dot === -1 ? 0 : text.length - dot - 1;
  };
  return decimals(geo.latitude) >= 5 && decimals(geo.longitude) >= 5;
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build `LocalBusiness` JSON-LD from what we know.
 *
 * Consumed by `features/website` (Devashish) to emit markup on a generated
 * site. Exported through `features/seo/index.ts`; this module must never write
 * into another feature's folder.
 */
export function buildLocalBusinessSchema(
  input: LocalBusinessSchemaInput,
): LocalBusinessSchemaResult {
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  const notes: string[] = [];

  const type = input.typeOverride ?? SCHEMA_TYPE_BY_CATEGORY[input.category];
  const jsonLd: Record<string, unknown> = { '@context': 'https://schema.org', '@type': type };

  const name = nonEmpty(input.name);
  if (name === null) missingRequired.push('name');
  else jsonLd['name'] = name;

  /* Address ---------------------------------------------------------------- */

  const street = nonEmpty(input.streetAddress);
  const locality = nonEmpty(input.addressLocality);
  const region = nonEmpty(input.addressRegion);
  const pin = nonEmpty(input.postalCode);
  const isServiceArea = input.areaServed.length > 0;

  const address: Record<string, unknown> = { '@type': 'PostalAddress', addressCountry: 'IN' };
  if (street !== null) address['streetAddress'] = street;
  if (locality !== null) address['addressLocality'] = locality;
  if (region !== null) address['addressRegion'] = region;
  if (pin !== null) {
    if (isIndianPin(pin)) address['postalCode'] = pin;
    else {
      missingRequired.push('address.postalCode');
      notes.push('The PIN code does not look like a six-digit Indian PIN, so it was left out.');
    }
  }

  if (street === null) {
    if (isServiceArea) {
      notes.push(
        'You serve customers at their location, so the markup carries the areas you cover ' +
          'instead of a street address. Features that need an address will not apply.',
      );
    } else {
      missingRequired.push('address.streetAddress');
    }
  }
  if (locality === null) missingRequired.push('address.addressLocality');
  if (region === null) missingRequired.push('address.addressRegion');
  if (pin === null) missingRequired.push('address.postalCode');

  jsonLd['address'] = address;

  if (isServiceArea) jsonLd['areaServed'] = [...input.areaServed];

  /* Recommended ------------------------------------------------------------ */

  const url = nonEmpty(input.url);
  if (url !== null) jsonLd['url'] = url;
  else missingRecommended.push('url');

  const telephone = nonEmpty(input.telephone);
  if (telephone !== null && isIndianE164(telephone)) {
    jsonLd['telephone'] = telephone;
  } else {
    missingRecommended.push('telephone');
    if (telephone !== null) {
      notes.push(
        'The phone number was left out because it is not in +91XXXXXXXXXX form. ' +
          'Assistants match numbers across sites literally, so the format matters.',
      );
    }
  }

  if (input.geo !== null && hasSufficientGeoPrecision(input.geo)) {
    jsonLd['geo'] = {
      '@type': 'GeoCoordinates',
      latitude: input.geo.latitude,
      longitude: input.geo.longitude,
    };
  } else {
    missingRecommended.push('geo');
    if (input.geo !== null) {
      notes.push(
        'The coordinates were left out because they are rounded to less than five decimal ' +
          'places, which points at the neighbourhood rather than your door.',
      );
    }
  }

  const priceRange = nonEmpty(input.priceRange);
  if (priceRange !== null && priceRange.length < 100) jsonLd['priceRange'] = priceRange;
  else missingRecommended.push('priceRange');

  if (input.openingHours.length > 0) {
    jsonLd['openingHoursSpecification'] = input.openingHours.map((spec) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: spec.days.map((day) => `https://schema.org/${day}`),
      opens: spec.opens,
      closes: spec.closes,
    }));
  } else {
    missingRecommended.push('openingHoursSpecification');
  }

  const images = input.imageUrls.filter((value) => nonEmpty(value) !== null);
  if (images.length > 0) jsonLd['image'] = images;
  else missingRecommended.push('image');

  const description = nonEmpty(input.description);
  if (description !== null) jsonLd['description'] = description;

  const cuisines = input.servesCuisine.filter((value) => nonEmpty(value) !== null);
  const isFoodBusiness = input.category === 'restaurant' || input.category === 'bakery';
  if (isFoodBusiness) {
    if (cuisines.length > 0) jsonLd['servesCuisine'] = cuisines;
    else missingRecommended.push('servesCuisine');
  }

  jsonLd['currenciesAccepted'] = 'INR';

  notes.push(
    'Ratings are not included. Google asks that a business does not publish its own aggregate ' +
      'rating on its own site, so Shoogle never generates one.',
  );

  return {
    jsonLd,
    missingRequired,
    missingRecommended,
    notes,
    publishable: missingRequired.length === 0,
  };
}

/**
 * Render markup for a page.
 *
 * `<` is escaped so a value containing `</script>` cannot break out of the
 * block. Returns `null` when the markup is not publishable, so an incomplete
 * description cannot reach a page by accident.
 */
export function serializeLocalBusinessSchema(result: LocalBusinessSchemaResult): string | null {
  if (!result.publishable) return null;
  const json = JSON.stringify(result.jsonLd, null, 2).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

/* -------------------------------------------------------------------------- */
/* Inspection of markup already on a site                                     */
/* -------------------------------------------------------------------------- */

export type JsonLdVerdict =
  /** No `application/ld+json` block at all. */
  | 'absent'
  /** A block exists but is not valid JSON. */
  | 'unparseable'
  /** Valid JSON, but nothing in it is a LocalBusiness descendant. */
  | 'no_local_business'
  /** A LocalBusiness node exists. `checks` says what passed. */
  | 'present';

export interface JsonLdInspection {
  readonly verdict: JsonLdVerdict;
  /** The `@type` found, when there was one. */
  readonly type: string | null;
  /** Whether the type is more specific than bare `LocalBusiness`. */
  readonly isSpecificSubtype: boolean;
  /** Checks that passed, by property name. */
  readonly passed: readonly string[];
  /** Checks that failed, by property name. */
  readonly failed: readonly string[];
  /**
   * What we did not check. We cannot call Google's Rich Results Test, so this
   * is never empty and the UI must show it.
   */
  readonly unchecked: readonly string[];
}

const CANNOT_CHECK = [
  'Whether Google accepts this markup (the Rich Results Test has no public API)',
];

function collectNodes(value: unknown, into: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, into);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const node = value as Record<string, unknown>;
  into.push(node);
  const graph = node['@graph'];
  if (graph !== undefined) collectNodes(graph, into);
}

function typeNames(node: Record<string, unknown>): string[] {
  const raw = node['@type'];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string');
  return [];
}

/**
 * Inspect the `application/ld+json` blocks on a page.
 *
 * Reports which specific checks passed. It does NOT report "valid" or
 * "invalid", because we are not the authority on that and saying so would be a
 * claim we cannot support.
 */
export function inspectJsonLd(blocks: readonly string[]): JsonLdInspection {
  if (blocks.length === 0) {
    return {
      verdict: 'absent',
      type: null,
      isSpecificSubtype: false,
      passed: [],
      failed: [],
      unchecked: CANNOT_CHECK,
    };
  }

  const nodes: Record<string, unknown>[] = [];
  let anyParsed = false;
  for (const block of blocks) {
    try {
      collectNodes(JSON.parse(block), nodes);
      anyParsed = true;
    } catch {
      // A malformed block is a real finding, not a crash.
    }
  }

  if (!anyParsed) {
    return {
      verdict: 'unparseable',
      type: null,
      isSpecificSubtype: false,
      passed: [],
      failed: [],
      unchecked: CANNOT_CHECK,
    };
  }

  const business = nodes.find((node) =>
    typeNames(node).some((name) => KNOWN_LOCAL_BUSINESS_TYPES.includes(name)),
  );

  if (business === undefined) {
    return {
      verdict: 'no_local_business',
      type: typeNames(nodes[0] ?? {})[0] ?? null,
      isSpecificSubtype: false,
      passed: [],
      failed: [],
      unchecked: CANNOT_CHECK,
    };
  }

  const type =
    typeNames(business).find((name) => KNOWN_LOCAL_BUSINESS_TYPES.includes(name)) ?? null;

  const passed: string[] = [];
  const failed: string[] = [];
  const record = (property: string, ok: boolean): void => {
    (ok ? passed : failed).push(property);
  };

  record('name', typeof business['name'] === 'string' && business['name'].trim().length > 0);

  const address = business['address'];
  const addressNode =
    typeof address === 'object' && address !== null ? (address as Record<string, unknown>) : null;
  record('address', addressNode !== null);
  if (addressNode !== null) {
    for (const property of [
      'streetAddress',
      'addressLocality',
      'addressRegion',
      'postalCode',
      'addressCountry',
    ]) {
      const value = addressNode[property];
      record(`address.${property}`, typeof value === 'string' && value.trim().length > 0);
    }
  }

  const telephone = business['telephone'];
  if (typeof telephone === 'string') record('telephone', isIndianE164(telephone));

  const priceRange = business['priceRange'];
  if (typeof priceRange === 'string') record('priceRange', priceRange.length < 100);

  const geo = business['geo'];
  if (typeof geo === 'object' && geo !== null) {
    const point = geo as Record<string, unknown>;
    const latitude = point['latitude'];
    const longitude = point['longitude'];
    record(
      'geo',
      typeof latitude === 'number' &&
        typeof longitude === 'number' &&
        hasSufficientGeoPrecision({ latitude, longitude }),
    );
  }

  return {
    verdict: 'present',
    type,
    isSpecificSubtype: type !== null && type !== 'LocalBusiness',
    passed,
    failed,
    unchecked: CANNOT_CHECK,
  };
}
