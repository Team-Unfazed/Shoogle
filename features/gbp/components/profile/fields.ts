/**
 * The business-profile field model. Owner: Pranay.
 *
 * WHAT THIS FILE IS FOR
 * ---------------------
 * `app/seo/profile.tsx` is where "Fix this for me" stops being a slogan. For
 * every field on a Google Business Profile an owner needs three separate facts,
 * and this module is the only place any of them is decided:
 *
 *   1. WHAT IS THERE — the current value, or the honest reason there is none.
 *   2. WHERE IT CAME FROM — Google's own copy, an owner edit Google has not
 *      applied, or a change Google made that nobody approved.
 *   3. WHETHER SHOOGLE CAN WRITE IT — one tap, guided, or not at all.
 *
 * THE THREE RULES THAT SHAPE EVERY TYPE BELOW
 * -------------------------------------------
 * A. **Empty and unknown are different facts.** A field Shoogle ASKED Google
 *    for and got nothing back for is genuinely not set — a measurement. A field
 *    Shoogle never asked for is unknown, and rendering it as "empty" would
 *    invent a finding. `LOCATION_READ_MASK` is the arbiter, and it is imported
 *    rather than restated, so adding a field to the mask automatically moves it
 *    out of the unknown bucket.
 *
 * B. **"The owner typed this" is a claim Shoogle cannot make.** Shoogle holds no
 *    record of owner input, and `locations.get` does not say who last changed a
 *    field. The only authority on provenance is `locations.getGoogleUpdated`,
 *    whose `diffMask` names fields where Google's copy differs from the owner's
 *    and whose `pendingMask` names owner edits Google has not applied. Anything
 *    outside those two lists is "this is what Google holds", never "you set
 *    this". If the diff was never read, provenance is UNKNOWN — not "from you".
 *
 * C. **A write button is honest only when a write exists.** Per
 *    docs/research/google-business-profile.md §9 the Business Information API
 *    can patch almost every field here. But `GbpAdapter` declares exactly one
 *    profile-field write method today — `updateRegularHours` — so exactly one
 *    field can offer one tap. Everything else reads as GUIDED: Shoogle shows
 *    the owner what to change and where, and does not pretend to do it.
 *    CONTRIBUTING rule 7 forbids the alternative.
 */

import { LOCATION_READ_MASK } from '../../endpoints';
import type { GbpGoogleUpdatedDiff, GbpLocationWire } from '../../types';

/* -------------------------------------------------------------------------- */
/* Which fields Shoogle actually asks Google for                              */
/* -------------------------------------------------------------------------- */

/**
 * Derived from the read mask, never restated.
 *
 * `locations.get` has no "give me everything" default — an omitted `readMask`
 * is an INVALID_ARGUMENT — so the mask is the complete list of fields Google
 * was asked about. A field outside it can never be reported as empty.
 */
export const REQUESTED_LOCATION_FIELDS: ReadonlySet<string> = new Set(
  LOCATION_READ_MASK.split(',').map((field) => field.trim()),
);

/* -------------------------------------------------------------------------- */
/* Field specs                                                                */
/* -------------------------------------------------------------------------- */

export type ProfileFieldId =
  | 'title'
  | 'primaryCategory'
  | 'additionalCategories'
  | 'description'
  | 'primaryPhone'
  | 'websiteUri'
  | 'attributes'
  | 'serviceItems'
  | 'regularHours'
  | 'specialHours'
  | 'serviceArea';

/** Methods on `GbpAdapter` that write a profile field. Exactly one exists. */
export type ProfileWriteMethod = 'updateRegularHours';

/** The Google method that would perform the write, per the capability matrix. */
export type GoogleWriteMethod = 'locations.patch' | 'locations.updateAttributes';

export interface ProfileFieldSpec {
  id: ProfileFieldId;
  label: string;
  /**
   * The top-level `Location` field. Doubles as the `updateMask` path for
   * `locations.patch`, and as the key Shoogle checks against the read mask.
   */
  wireField: string;
  /** Business Information v1 exposes a write for this field. Matrix §9. */
  apiSupportsWrite: boolean;
  googleMethod: GoogleWriteMethod;
  /**
   * The `GbpAdapter` method that performs it, or null when the adapter does not
   * declare one. Null degrades the field to `guided` — see rule C in the header.
   */
  providerMethod: ProfileWriteMethod | null;
  /** One line citing the matrix. Read this before flipping `apiSupportsWrite`. */
  matrixNote: string;
  /** Why this field earns its place, for a neighbourhood business in India. */
  whyItMatters: string;
  /** What the owner does themselves. Shown when Shoogle cannot write it. */
  ownerSteps: readonly string[];
}

const GOOGLE_APP_STEPS = (what: string): readonly string[] => [
  'Open the Google Maps app and sign in with the account that manages this business.',
  'Tap your profile picture, then "Your Business Profile".',
  `Tap Edit profile, then ${what}.`,
  'Save. Google may take a few days to review the change.',
];

/**
 * Every field this screen shows.
 *
 * Declared as a complete `Record` rather than an array plus a cast: the type
 * then proves at compile time that no `ProfileFieldId` is missing a spec, and
 * there is no `as` anywhere in this file.
 */
const SPECS: Readonly<Record<ProfileFieldId, ProfileFieldSpec>> = Object.freeze({
  title: {
    id: 'title',
    label: 'Business name',
    wireField: 'title',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote:
      'Matrix §9: `title` is writable through locations.patch. GbpAdapter declares no method for it, so Shoogle guides rather than writes.',
    whyItMatters:
      'The name Google shows in the map pack. Stuffing keywords into it is against Google’s guidelines and gets listings suspended.',
    ownerSteps: GOOGLE_APP_STEPS('Business name'),
  },
  primaryCategory: {
    id: 'primaryCategory',
    label: 'Primary category',
    wireField: 'categories',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote:
      'Matrix §9: `categories` is writable through locations.patch. No adapter method exists, so this is guided.',
    whyItMatters:
      'The single strongest lever on which searches you appear in. One category, chosen well, beats five chosen loosely.',
    ownerSteps: GOOGLE_APP_STEPS('Business category'),
  },
  additionalCategories: {
    id: 'additionalCategories',
    label: 'Additional categories',
    wireField: 'categories',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote:
      'Matrix §9: additional categories travel inside the same `categories` field. Guided, for the same reason.',
    whyItMatters:
      'Extra categories widen the searches you can appear in. Ones you do not actually serve narrow them again by confusing Google.',
    ownerSteps: GOOGLE_APP_STEPS('Business category, then Additional categories'),
  },
  description: {
    id: 'description',
    label: 'Description',
    wireField: 'profile',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote:
      'Matrix §9: `profile` carries the description "in your own voice" and is writable through locations.patch. Guided.',
    whyItMatters:
      'The paragraph a customer reads before deciding to call. It is also what an AI assistant quotes when someone asks about you.',
    ownerSteps: GOOGLE_APP_STEPS('Description'),
  },
  primaryPhone: {
    id: 'primaryPhone',
    label: 'Phone number',
    wireField: 'phoneNumbers',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote: 'Matrix §9: `phoneNumbers` is writable through locations.patch. Guided.',
    whyItMatters:
      'The tap that becomes a booking. A wrong number here is the most expensive single error on a listing.',
    ownerSteps: GOOGLE_APP_STEPS('Phone'),
  },
  websiteUri: {
    id: 'websiteUri',
    label: 'Website',
    wireField: 'websiteUri',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote: 'Matrix §9: `websiteUri` is writable through locations.patch. Guided.',
    whyItMatters:
      'Google’s API access request requires a website on the profile, and an assistant needs one to read anything about you at all.',
    ownerSteps: GOOGLE_APP_STEPS('Website'),
  },
  attributes: {
    id: 'attributes',
    label: 'Attributes',
    wireField: 'attributes',
    apiSupportsWrite: true,
    googleMethod: 'locations.updateAttributes',
    providerMethod: null,
    matrixNote:
      'Matrix §9: attributes are written with locations.updateAttributes, and the valid list must come from attributes.list for your category and country — never a hard-coded list. Shoogle calls neither yet.',
    whyItMatters:
      'Things like "women-led", "wheelchair accessible" or "UPI accepted" appear as chips on your listing and match how people filter.',
    ownerSteps: GOOGLE_APP_STEPS('More, then the attribute you want'),
  },
  serviceItems: {
    id: 'serviceItems',
    label: 'Services',
    wireField: 'serviceItems',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote:
      'Matrix §9: `serviceItems` — "list of services like haircuts or installations" — is writable through locations.patch. Guided.',
    whyItMatters:
      'The named services customers search for. "Hair spa", "bridal makeup" and "AC gas refill" are searches; "salon" is a category.',
    ownerSteps: GOOGLE_APP_STEPS('Services'),
  },
  regularHours: {
    id: 'regularHours',
    label: 'Opening hours',
    wireField: 'regularHours',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    // The one and only profile write GbpAdapter declares today.
    providerMethod: 'updateRegularHours',
    matrixNote:
      'Matrix §9: `regularHours` is writable through locations.patch, and GbpAdapter.updateRegularHours performs it. This is the only profile field Shoogle can write for you.',
    whyItMatters:
      'Google shows "Open now" from this. Wrong hours send customers to a shut door and cost you the review afterwards.',
    ownerSteps: GOOGLE_APP_STEPS('Hours'),
  },
  specialHours: {
    id: 'specialHours',
    label: 'Holiday hours',
    wireField: 'specialHours',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote:
      'Matrix §9: `specialHours` overrides regular hours and is writable through locations.patch. GbpAdapter declares no method for it, so this is guided.',
    whyItMatters:
      'Festival closures. A salon shut for Ganpati with no holiday hours set is still telling Google it is open.',
    ownerSteps: GOOGLE_APP_STEPS('Hours, then Special hours'),
  },
  serviceArea: {
    id: 'serviceArea',
    label: 'Service areas',
    wireField: 'serviceArea',
    apiSupportsWrite: true,
    googleMethod: 'locations.patch',
    providerMethod: null,
    matrixNote:
      'Matrix §9: `serviceArea` is writable through locations.patch for businesses that travel to the customer. Guided.',
    whyItMatters:
      'How far Google will show you from. For a mobile repair shop or a home salon this is the difference between two localities and ten.',
    ownerSteps: GOOGLE_APP_STEPS('Service area'),
  },
});

export const PROFILE_FIELD_SPEC_BY_ID = SPECS;

/**
 * Display order, deliberate: name, category and description are what a customer
 * reads first in the map pack, and phone and website are the two taps that turn
 * a search into a customer.
 */
export const PROFILE_FIELD_ORDER: readonly ProfileFieldId[] = Object.freeze([
  'title',
  'primaryCategory',
  'additionalCategories',
  'description',
  'primaryPhone',
  'websiteUri',
  'attributes',
  'serviceItems',
  'regularHours',
  'specialHours',
  'serviceArea',
]);

export const PROFILE_FIELD_SPECS: readonly ProfileFieldSpec[] = Object.freeze(
  PROFILE_FIELD_ORDER.map((id) => SPECS[id]),
);

/* -------------------------------------------------------------------------- */
/* Write path                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What Shoogle will actually do about this field, and nothing more.
 *
 * `one_tap` requires BOTH that Google exposes the write AND that `GbpAdapter`
 * declares a method for it. That conjunction is the whole point: a button
 * backed by an API but not by an implementation is a dead control.
 */
export type WritePath =
  | { kind: 'one_tap'; providerMethod: ProfileWriteMethod }
  | { kind: 'guided'; googleMethod: GoogleWriteMethod }
  | { kind: 'not_writable' };

export function writePathFor(spec: ProfileFieldSpec): WritePath {
  if (!spec.apiSupportsWrite) return { kind: 'not_writable' };
  if (spec.providerMethod !== null) {
    return { kind: 'one_tap', providerMethod: spec.providerMethod };
  }
  return { kind: 'guided', googleMethod: spec.googleMethod };
}

export interface WritePathCopy {
  /** Short chip text. */
  chip: string;
  /** One sentence an owner can act on. */
  body: string;
  accent: 'green' | 'amber' | 'neutral';
}

export function describeWritePath(path: WritePath): WritePathCopy {
  switch (path.kind) {
    case 'one_tap':
      return {
        chip: 'Shoogle can fix',
        body: 'Shoogle can send this change to Google for you.',
        accent: 'green',
      };
    case 'guided':
      return {
        chip: 'Needs your hand',
        body:
          'Google allows this change through its API, but Shoogle has not built the write for it yet. ' +
          'Rather than a button that does nothing, here is exactly what to change and where.',
        accent: 'amber',
      };
    case 'not_writable':
      return {
        chip: 'Read only',
        body: 'Google does not allow this to be changed through its API at all.',
        accent: 'neutral',
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Why a field has no value to show. None of these is "empty".
 *
 * `not_requested` is the one that matters most: Shoogle's read mask does not
 * include the field, so Google was never asked. Rendering that as "not set"
 * would tell an owner to go and fill in something that may already be there.
 */
export type FieldUnknownReason =
  /** Not in `LOCATION_READ_MASK`; Google was never asked. */
  | 'not_requested'
  /** Asked for, but Shoogle cannot yet read the shape Google replies with. */
  | 'not_modelled';

export type FieldValue =
  | { kind: 'present'; display: string; detail?: string }
  /** Requested, and Google returned nothing. This is a MEASUREMENT: not set. */
  | { kind: 'empty' }
  | { kind: 'unknown'; why: FieldUnknownReason };

export const FIELD_UNKNOWN_COPY: Readonly<Record<FieldUnknownReason, string>> = Object.freeze({
  not_requested:
    'Shoogle does not ask Google for this field yet, so it does not know what is there. This is not the same as it being empty.',
  not_modelled:
    'Shoogle asks Google for this field but cannot yet read the answer Google sends back, so it will not guess what is in it.',
});

function trimmedOrNull(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** `n item(s)`, without ever pretending an unknown list is an empty one. */
function pluralise(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Read one field out of the location Google returned.
 *
 * `serviceArea` is passed in separately because `GbpLocationWire` does not model
 * it — see `serviceArea.ts`, which reads it defensively from the raw payload.
 */
export function readFieldValue(
  id: ProfileFieldId,
  wire: GbpLocationWire,
  serviceArea?: FieldValue,
): FieldValue {
  const spec = PROFILE_FIELD_SPEC_BY_ID[id];
  if (!REQUESTED_LOCATION_FIELDS.has(spec.wireField)) {
    return { kind: 'unknown', why: 'not_requested' };
  }

  switch (id) {
    case 'title': {
      const value = trimmedOrNull(wire.title);
      return value === null ? { kind: 'empty' } : { kind: 'present', display: value };
    }

    case 'primaryCategory': {
      const category = wire.categories?.primaryCategory;
      const display = trimmedOrNull(category?.displayName);
      if (display !== null) {
        const id_ = trimmedOrNull(category?.name);
        return id_ === null
          ? { kind: 'present', display }
          : { kind: 'present', display, detail: id_ };
      }
      // Google sent a category with no display name. That is a category we
      // cannot name, not an absent one.
      const rawName = trimmedOrNull(category?.name);
      if (rawName !== null) {
        return { kind: 'present', display: rawName, detail: 'Google sent no readable name for it.' };
      }
      return { kind: 'empty' };
    }

    case 'additionalCategories': {
      const list = wire.categories?.additionalCategories ?? [];
      const named = list
        .map((category) => trimmedOrNull(category.displayName) ?? trimmedOrNull(category.name))
        .filter((name): name is string => name !== null);
      if (named.length === 0) return { kind: 'empty' };
      return {
        kind: 'present',
        display: named.join(' · '),
        detail: pluralise(named.length, 'category', 'categories'),
      };
    }

    case 'description': {
      const value = trimmedOrNull(wire.profile?.description);
      if (value === null) return { kind: 'empty' };
      return {
        kind: 'present',
        display: value,
        detail: pluralise(Array.from(value).length, 'character', 'characters'),
      };
    }

    case 'primaryPhone': {
      const value = trimmedOrNull(wire.phoneNumbers?.primaryPhone);
      if (value === null) return { kind: 'empty' };
      const extras = (wire.phoneNumbers?.additionalPhones ?? []).filter(
        (phone) => trimmedOrNull(phone) !== null,
      );
      return extras.length === 0
        ? { kind: 'present', display: value }
        : {
            kind: 'present',
            display: value,
            detail: `${pluralise(extras.length, 'other number', 'other numbers')} also listed`,
          };
    }

    case 'websiteUri': {
      const value = trimmedOrNull(wire.websiteUri);
      return value === null ? { kind: 'empty' } : { kind: 'present', display: value };
    }

    case 'regularHours': {
      const periods = wire.regularHours?.periods ?? [];
      if (periods.length === 0) return { kind: 'empty' };
      return { kind: 'present', display: pluralise(periods.length, 'opening period', 'opening periods') };
    }

    case 'specialHours': {
      const periods = wire.specialHours?.specialHourPeriods ?? [];
      if (periods.length === 0) return { kind: 'empty' };
      return { kind: 'present', display: pluralise(periods.length, 'date set', 'dates set') };
    }

    case 'serviceArea':
      // `GbpLocationWire` has no `serviceArea` member, so the value can only
      // come from a defensive read of the raw payload. Absent that read, the
      // honest answer is that Shoogle cannot model Google's reply.
      return serviceArea ?? { kind: 'unknown', why: 'not_modelled' };

    case 'attributes':
    case 'serviceItems':
      // Unreachable in practice — neither is in the read mask, so the guard at
      // the top of this function already returned. Kept so the switch is total.
      return { kind: 'unknown', why: 'not_requested' };
  }
}

/* -------------------------------------------------------------------------- */
/* Provenance                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Who last set this field, to the extent Google will say.
 *
 * Shoogle deliberately has no `owner_typed` member. It keeps no record of owner
 * input and `locations.get` reports no author, so claiming a value came "from
 * you" would be an invention. The strongest true statements available are the
 * two masks from `locations.getGoogleUpdated`.
 */
export type FieldProvenance =
  /** In `diffMask`: Google's copy differs from the owner's. Google changed it. */
  | { kind: 'google_changed' }
  /** In `pendingMask`: an owner edit Google has not applied yet. */
  | { kind: 'owner_edit_pending' }
  /** Present in Google's copy, in neither mask. Google holds it; author unknown. */
  | { kind: 'google_copy' }
  /** `getGoogleUpdated` was not read, so provenance cannot be established. */
  | { kind: 'unknown' };

export interface ProvenanceCopy {
  chip: string;
  body: string;
  accent: 'red' | 'blue' | 'neutral';
}

export function describeProvenance(provenance: FieldProvenance): ProvenanceCopy {
  switch (provenance.kind) {
    case 'google_changed':
      return {
        chip: 'Changed by Google',
        body:
          'Google’s copy of this field differs from yours. Google changed it itself — you were never asked to approve it.',
        accent: 'red',
      };
    case 'owner_edit_pending':
      return {
        chip: 'Your edit, not applied',
        body:
          'An edit is waiting on Google’s side. What people see on Search and Maps is still the old value.',
        accent: 'blue',
      };
    case 'google_copy':
      return {
        chip: 'From Google',
        body:
          'This is what Google holds today. Google does not report who last changed a field, so Shoogle will not claim you typed it.',
        accent: 'neutral',
      };
    case 'unknown':
      return {
        chip: 'Source unknown',
        body:
          'Shoogle has not read Google’s own copy of this listing, so it cannot say whether you or Google set this.',
        accent: 'neutral',
      };
  }
}

/**
 * Provenance for one field, from the `getGoogleUpdated` masks.
 *
 * `diff` of null means the diff was never read — every field is then `unknown`,
 * and specifically NOT "unchanged". Absence of evidence is not evidence.
 */
export function provenanceFor(
  spec: ProfileFieldSpec,
  diff: GbpGoogleUpdatedDiff | null,
): FieldProvenance {
  if (diff === null) return { kind: 'unknown' };
  const head = (path: string): string => path.split('.')[0] ?? path;
  if (diff.changedFields.some((path) => head(path) === spec.wireField)) {
    return { kind: 'google_changed' };
  }
  if (diff.pendingFields.some((path) => head(path) === spec.wireField)) {
    return { kind: 'owner_edit_pending' };
  }
  return { kind: 'google_copy' };
}

/* -------------------------------------------------------------------------- */
/* One row on the screen                                                      */
/* -------------------------------------------------------------------------- */

export interface ProfileFieldView {
  spec: ProfileFieldSpec;
  value: FieldValue;
  provenance: FieldProvenance;
  writePath: WritePath;
}

export function buildProfileFields(
  wire: GbpLocationWire,
  diff: GbpGoogleUpdatedDiff | null,
  serviceArea?: FieldValue,
): readonly ProfileFieldView[] {
  return PROFILE_FIELD_SPECS.map((spec) => ({
    spec,
    value: readFieldValue(spec.id, wire, serviceArea),
    provenance: provenanceFor(spec, diff),
    writePath: writePathFor(spec),
  }));
}

/* -------------------------------------------------------------------------- */
/* Completeness                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How complete the profile is — reported as three counts, never as one score.
 *
 * A percentage would have to decide what to do with the fields Shoogle could
 * not check, and both available answers are lies: counting them as missing
 * invents a problem, counting them as filled invents a solution. So they get
 * their own number and stay visible.
 */
export interface ProfileCompleteness {
  filled: number;
  /** Requested, and Google returned nothing. A measured absence. */
  missing: number;
  /** Never asked for, or unreadable. Not scored either way. */
  unknown: number;
  /** `filled + missing` — the fields any statement here is actually about. */
  checked: number;
  total: number;
}

export function summariseCompleteness(
  fields: readonly ProfileFieldView[],
): ProfileCompleteness {
  let filled = 0;
  let missing = 0;
  let unknown = 0;
  for (const field of fields) {
    if (field.value.kind === 'present') filled += 1;
    else if (field.value.kind === 'empty') missing += 1;
    else unknown += 1;
  }
  return { filled, missing, unknown, checked: filled + missing, total: fields.length };
}

/** One sentence that never overstates what was measured. */
export function completenessSentence(summary: ProfileCompleteness): string {
  const base =
    summary.checked === 0
      ? 'Shoogle could not check any of these details.'
      : `${summary.filled} of the ${summary.checked} details Shoogle could check ${
          summary.filled === 1 ? 'is' : 'are'
        } filled in.`;
  if (summary.unknown === 0) return base;
  return `${base} ${summary.unknown} more ${
    summary.unknown === 1 ? 'is' : 'are'
  } unknown — not empty, unknown.`;
}

/* -------------------------------------------------------------------------- */
/* What Shoogle can and cannot do, counted honestly                           */
/* -------------------------------------------------------------------------- */

export interface WriteCoverage {
  oneTap: number;
  guided: number;
  readOnly: number;
}

export function summariseWriteCoverage(fields: readonly ProfileFieldView[]): WriteCoverage {
  let oneTap = 0;
  let guided = 0;
  let readOnly = 0;
  for (const field of fields) {
    if (field.writePath.kind === 'one_tap') oneTap += 1;
    else if (field.writePath.kind === 'guided') guided += 1;
    else readOnly += 1;
  }
  return { oneTap, guided, readOnly };
}

export function writeCoverageSentence(coverage: WriteCoverage): string {
  const total = coverage.oneTap + coverage.guided + coverage.readOnly;
  return (
    `Of the ${total} details on this screen, Shoogle can send ${coverage.oneTap} to Google for you. ` +
    `The other ${coverage.guided + coverage.readOnly} need your hand, and Shoogle says so rather than ` +
    'putting buttons here that would do nothing.'
  );
}
