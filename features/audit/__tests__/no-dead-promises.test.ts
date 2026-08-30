/**
 * A finding must never promise a fix Shoogle has no path to perform.
 *
 * `resolveFixMode()` already degrades a check with `capability.providerMethod
 * === null` to `guided`, and `fixableByShoogle` is already false for it — so the
 * BUTTON is honest. The SENTENCE was not. Eighteen checks whose capability
 * record says "no provider method exists" still said "tell us and we will set
 * it", which is a dead promise: there is nothing behind the words.
 *
 * This test is deliberately data-driven over the registry rather than a list of
 * check ids. A new check that arrives with `providerMethod: null` and
 * first-person-fix copy fails here on the day it is written, and a new check
 * that produces no finding under any scenario below fails the coverage
 * assertion, which is the prompt to add one rather than to lower the bar.
 */

import { unavailable } from '@/lib/state/DataState';

import { ALL_CHECKS } from '../checks/registry';
import { runAuditEngine } from '../engine';
import {
  input,
  locationDetail,
  ok,
  ownerContext,
  review,
  websiteObservation,
  NOW,
} from '../test-support/build';
import type { AuditInput, CheckId, ShoogleFinding } from '../types';

/* -------------------------------------------------------------------------- */
/* What "first-person fix language" means, spelled out                        */
/* -------------------------------------------------------------------------- */

/**
 * Verbs that describe Shoogle CHANGING the owner's listing or sending something
 * on their behalf. "We will set it", "we can add them", "we'll send the link".
 */
const FIX_VERBS = [
  'add',
  'apply',
  'change',
  'clear',
  'complete',
  'correct',
  'create',
  'draft',
  'edit',
  'enter',
  'fill',
  'fix',
  'list',
  'make',
  'post',
  'publish',
  'put',
  'remove',
  'replace',
  'rewrite',
  'schedule',
  'send',
  'set',
  'switch',
  'take',
  'tick',
  'turn',
  'update',
  'upload',
  'write',
];

/**
 * Verbs that describe Shoogle GUIDING instead of doing. "We will show you where
 * to tap" is the voice B3 already used correctly, and it is honest for a check
 * with no write path, so it must not be caught.
 */
const GUIDANCE_VERBS = ['show', 'walk', 'point', 'explain', 'help', 'tell', 'teach', 'guide'];

/**
 * `we|Shoogle` + a forward-looking modal + a fix verb close behind it, unless
 * the modal is immediately followed by a guidance verb.
 *
 * The modal must be followed by whitespace, so "can't" and "won't" do not match
 * — "Shoogle can't change anything for you" is an honest sentence and stays.
 */
const FIRST_PERSON_FIX = new RegExp(
  String.raw`\b(?:we|shoogle)\b\s*(?:'ll|’ll|will|can|could|are going to|'re going to)\s+` +
    String.raw`(?!(?:${GUIDANCE_VERBS.join('|')})\b)` +
    String.raw`(?:\w+\s+){0,2}(?:${FIX_VERBS.join('|')})\b`,
  'i',
);

describe('the FIRST_PERSON_FIX detector itself', () => {
  it.each([
    'Tell us which is right and we will make your listing match.',
    'We can set this back to open.',
    "If you're trading, say so and we'll switch it back.",
    'Shoogle can write and schedule one post a week for you.',
    'We can send a review link to customers after their visit.',
    'Give us the missing bit and we will complete it.',
  ])('catches %s', (sentence) => {
    expect(FIRST_PERSON_FIX.test(sentence)).toBe(true);
  });

  it.each([
    'You can drag the pin onto your door in Google Maps — we will show you where to tap.',
    'We will show you where to add them from your phone.',
    "Until it does, we can't change anything on your listing for you.",
    'Connect it and we will check your categories, hours, photos and reviews.',
    'Your hosting provider can renew the certificate.',
    'We could not open your site at all.',
  ])('leaves %s alone', (sentence) => {
    expect(FIRST_PERSON_FIX.test(sentence)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* A battery wide enough to make every check speak                            */
/* -------------------------------------------------------------------------- */

const BEFORE_GANDHI_JAYANTI = '2026-09-25T00:00:00.000Z';

const unverifiedMetadata = {
  hasVoiceOfMerchant: false,
  canOperateLocalPost: true,
  canModifyServiceList: true,
  canHaveFoodMenus: false,
  placeId: 'ChIJtest',
};

const reviewsAt = (stars: 1 | 2 | 3 | 4 | 5, count: number, day = 20): AuditInput =>
  input({
    reviews: ok({
      items: Array.from({ length: count }, (_, i) =>
        review(i + 1, stars, `2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`, true),
      ),
      replyFieldTrusted: true,
    }),
  });

/**
 * Each entry drives at least one check to produce a finding. Broad on purpose:
 * the assertion below fails if any check with no write path is missing from it.
 */
const SCENARIOS: AuditInput[] = [
  // A1 — both measured branches of "no listing to audit".
  input({ connection: unavailable('not_connected', 'No Google Business Profile is linked.') }),
  input({ locations: ok({ locationIds: [] }) }),
  // A2 — unverified, and verification in flight.
  input({
    location: ok(locationDetail({ metadata: unverifiedMetadata })),
    verification: ok({ hasPendingVerification: false, pendingMethod: null }),
  }),
  input({
    location: ok(locationDetail({ metadata: unverifiedMetadata })),
    verification: ok({ hasPendingVerification: true, pendingMethod: 'POSTCARD' }),
  }),
  // A3 — every disagreement between Google and the owner, and every never-asked.
  input({
    location: ok(locationDetail({ openInfo: { status: 'CLOSED_TEMPORARILY' } })),
    owner: ok(ownerContext({ declaredOpenStatus: 'open' })),
  }),
  input({
    location: ok(locationDetail({ openInfo: { status: 'CLOSED_TEMPORARILY' } })),
    owner: ok(ownerContext({ declaredOpenStatus: null })),
  }),
  input({
    location: ok(locationDetail({ openInfo: { status: 'CLOSED_PERMANENTLY' } })),
    owner: ok(ownerContext({ declaredOpenStatus: 'open' })),
  }),
  input({
    location: ok(locationDetail({ openInfo: { status: 'CLOSED_PERMANENTLY' } })),
    owner: ok(ownerContext({ declaredOpenStatus: null })),
  }),
  input({
    location: ok(locationDetail({ openInfo: { status: 'OPEN' } })),
    owner: ok(ownerContext({ declaredOpenStatus: 'temporarily_closed' })),
  }),
  // B1 — a mismatch, and a stuffed title.
  input({ location: ok(locationDetail({ title: 'Sunrise Hair Studio' })) }),
  input({ location: ok(locationDetail({ title: 'Best Salon Nerul' })) }),
  // B2 — nothing at all, only the PIN missing, no address block whatsoever.
  input({ location: ok(locationDetail({ storefrontAddress: null })) }),
  input({
    location: ok(
      locationDetail({
        storefrontAddress: {
          addressLines: [],
          locality: null,
          administrativeArea: null,
          postalCode: null,
          regionCode: 'IN',
        },
      }),
    ),
  }),
  input({
    location: ok(
      locationDetail({
        storefrontAddress: {
          addressLines: ['Shop 4'],
          locality: 'Nerul',
          administrativeArea: 'Maharashtra',
          postalCode: null,
          regionCode: 'IN',
        },
      }),
    ),
  }),
  // B3 — a pin a short walk away, and a pin in the wrong neighbourhood.
  input({ location: ok(locationDetail({ latLng: { latitude: 19.0321, longitude: 73.019 } })) }),
  input({ location: ok(locationDetail({ latLng: { latitude: 19.028, longitude: 73.019 } })) }),
  // B4 — no number, and an unusable one.
  input({ location: ok(locationDetail({ primaryPhone: null })) }),
  input({ location: ok(locationDetail({ primaryPhone: '12345' })) }),
  // B5 — no link, and a link that errors.
  input({ location: ok(locationDetail({ websiteUri: null })) }),
  input({ website: ok(websiteObservation({ httpStatus: 503 })) }),
  // B6 — a service-area business that has named no areas.
  input({
    location: ok(
      locationDetail({
        storefrontAddress: null,
        latLng: null,
        serviceArea: { businessType: 'CUSTOMER_LOCATION_ONLY', placeCount: 0 },
      }),
    ),
  }),
  // C1 — no main category.
  input({ location: ok(locationDetail({ primaryCategory: null })) }),
  // C2 — a category that does not match the trade the owner told us about.
  input({ owner: ok(ownerContext({ business: { ...ownerContext().business, category: 'gym' } })) }),
  // C3 — no extra categories, and far too many.
  input({ location: ok(locationDetail({ additionalCategories: [] })) }),
  input({
    location: ok(
      locationDetail({
        additionalCategories: Array.from({ length: 11 }, (_, i) => ({
          categoryId: `gcid:extra_${i}`,
          displayName: `Extra ${i}`,
        })),
      }),
    ),
  }),
  // C4 — no service list, and a service list missing what the owner told us.
  input({ location: ok(locationDetail({ serviceItems: [] })) }),
  input({
    location: ok(locationDetail({ serviceItems: [{ name: 'Haircut', priceInPaise: 30_000 }] })),
  }),
  // C5 — nothing priced, and only some priced.
  input({
    location: ok(
      locationDetail({
        serviceItems: [
          { name: 'Haircut', priceInPaise: null },
          { name: 'Hair spa', priceInPaise: null },
        ],
      }),
    ),
  }),
  input({
    location: ok(
      locationDetail({
        serviceItems: [
          { name: 'Haircut', priceInPaise: 30_000 },
          { name: 'Hair spa', priceInPaise: null },
        ],
      }),
    ),
  }),
  // D3 — a festival inside the window, and holiday hours that all expired.
  input({}, BEFORE_GANDHI_JAYANTI),
  input({
    location: ok(
      locationDetail({
        specialHourPeriods: [{ startDate: '2025-11-01', endDate: '2025-11-02', closed: true }],
      }),
    ),
  }),
  // D4 — a category that commonly has a second set of hours, with none listed.
  input({
    owner: ok(ownerContext({ business: { ...ownerContext().business, category: 'clinic' } })),
  }),
  // E1 / E2 — no photos at all, and too few of them.
  input({ media: ok({ ownerUploaded: [] }) }),
  input({
    media: ok({
      ownerUploaded: [
        { category: 'COVER', createTime: '2026-08-01T00:00:00.000Z' },
        { category: 'INTERIOR', createTime: '2026-08-01T00:00:00.000Z' },
      ],
    }),
  }),
  // E3 — a photo shelf that has not moved in a year, and one going stale.
  input({
    media: ok({
      ownerUploaded: [{ category: 'COVER', createTime: '2024-01-01T00:00:00.000Z' }],
    }),
  }),
  input({
    media: ok({
      ownerUploaded: [{ category: 'COVER', createTime: '2026-04-01T00:00:00.000Z' }],
    }),
  }),
  // F1 — no reviews, and not yet enough of them.
  input({ reviews: ok({ items: [], replyFieldTrusted: true }) }),
  reviewsAt(5, 3),
  // F2 — a rating below four, and one between four and four and a half.
  reviewsAt(3, 6),
  reviewsAt(4, 6),
  // F5 — nothing new for a month, and nothing new for half a year.
  input({
    reviews: ok({
      items: [1, 2, 3, 4, 5, 6].map((i) => review(i, 5, '2026-07-01T00:00:00.000Z', true)),
      replyFieldTrusted: true,
    }),
  }),
  input({
    reviews: ok({
      items: [1, 2, 3, 4, 5, 6].map((i) => review(i, 5, '2026-01-01T00:00:00.000Z', true)),
      replyFieldTrusted: true,
    }),
  }),
  // G1 — never posted, quiet for a month, quiet for half a year.
  input({ localPosts: ok({ items: [] }) }),
  input({
    localPosts: ok({
      items: [{ createTime: '2026-07-15T00:00:00.000Z', hasCallToAction: true }],
    }),
  }),
  input({
    localPosts: ok({
      items: [{ createTime: '2026-01-15T00:00:00.000Z', hasCallToAction: true }],
    }),
  }),
  // G2 — posting, but rarely and with nothing to tap.
  input({
    localPosts: ok({
      items: [
        { createTime: '2026-08-20T00:00:00.000Z', hasCallToAction: false },
        { createTime: '2026-08-10T00:00:00.000Z', hasCallToAction: false },
      ],
    }),
  }),
  // H1 / H2 — no description, a banned link in one, and a thin one.
  input({ location: ok(locationDetail({ profileDescription: null })) }),
  input({
    location: ok(
      locationDetail({
        profileDescription:
          'Come to us for haircuts in Nerul and book online at https://example.com today.',
      }),
    ),
  }),
  input({ location: ok(locationDetail({ profileDescription: 'We cut hair.' })) }),
  // H3 — none of the labels Google offers have been ticked.
  input({ location: ok(locationDetail({ attributeIds: [] })) }),
  // I1 — a site that does not respond, and one that is not built for phones.
  input({
    website: ok(websiteObservation({ fetchOutcome: 'network_error', httpStatus: null })),
  }),
  input({ website: ok(websiteObservation({ hasViewportMeta: false })) }),
  // I2 — no details block at all, and an incomplete one.
  input({ website: ok(websiteObservation({ jsonLdLocalBusiness: null })) }),
  input({
    website: ok(
      websiteObservation({
        jsonLdLocalBusiness: {
          type: 'HairSalon',
          name: null,
          telephone: null,
          streetAddress: null,
          geoPrecision: null,
          hasOpeningHoursSpecification: false,
        },
      }),
    ),
  }),
  // I3 — a phone number nobody can tap.
  input({ website: ok(websiteObservation({ telLinkPresent: false })) }),
];

function everyFinding(): ShoogleFinding[] {
  return SCENARIOS.flatMap((scenario) => runAuditEngine(scenario).findings);
}

/** Checks with no write path Shoogle can take today. Read off the registry. */
const NO_WRITE_PATH: CheckId[] = ALL_CHECKS.filter(
  (c) => c.capability.providerMethod === null,
).map((c) => c.id);

describe('a check with no write path never promises one', () => {
  const findings = everyFinding();

  it('is a real battery, not an empty one', () => {
    // Guards against the whole file passing vacuously: every assertion below
    // iterates `findings`, so an empty list would prove nothing.
    expect(findings.length).toBeGreaterThan(50);
    // Every check but the four with a genuine provider method: D1, D2 (hours)
    // and F3, F4 (review replies). G1 and G2 belong here now, not there.
    expect(NO_WRITE_PATH).toHaveLength(ALL_CHECKS.length - 4);
    expect(NO_WRITE_PATH).toEqual(expect.arrayContaining(['G1', 'G2']));
    expect(NO_WRITE_PATH).not.toContain('D1');
    expect(NO_WRITE_PATH).not.toContain('F3');
  });

  it('drove every no-write-path check to actually say something', () => {
    // The coverage guard. If a new check lands with providerMethod null and no
    // scenario reaches it, this fails and the fix is a new scenario above — not
    // a narrower assertion below.
    const spoke = new Set(findings.map((f) => f.checkId));
    const silent = NO_WRITE_PATH.filter((id) => !spoke.has(id));
    expect(silent).toEqual([]);
  });

  it('never uses first-person-fix language in a title or a detail', () => {
    const offenders = findings
      .filter((f) => !f.fixableByShoogle)
      .filter((f) => FIRST_PERSON_FIX.test(`${f.title} ${f.detail}`))
      .map((f) => `${f.checkId}: ${f.detail}`);
    expect(offenders).toEqual([]);
  });

  it('degrades every one of them to a guided or owner fix, with no Shoogle button', () => {
    for (const f of findings) {
      if (NO_WRITE_PATH.includes(f.checkId)) {
        expect(f.fixableByShoogle).toBe(false);
        expect(['guided', 'owner']).toContain(f.fixMode);
      }
    }
  });

  it('still tells the owner what to do — the copy got honest, not empty', () => {
    for (const f of findings) {
      expect(f.detail.trim().length).toBeGreaterThan(40);
      expect(f.detail.trim().endsWith('.')).toBe(true);
    }
  });
});

describe('the Google post checks (G1, G2) specifically', () => {
  const posted = (items: { createTime: string; hasCallToAction: boolean }[]): ShoogleFinding[] =>
    runAuditEngine(input({ localPosts: ok({ items }) }, NOW)).findings;

  it('offers a guided fix, because the post composer is not ours to open', () => {
    const g1 = posted([]).find((f) => f.checkId === 'G1');
    expect(g1).toBeDefined();
    expect(g1?.fixableByShoogle).toBe(false);
    expect(g1?.fixMode).toBe('guided');
  });

  it('drops the weekly-scheduling promise from every branch of the copy', () => {
    const branches = [
      posted([]),
      posted([{ createTime: '2026-07-15T00:00:00.000Z', hasCallToAction: true }]),
      posted([{ createTime: '2026-01-15T00:00:00.000Z', hasCallToAction: true }]),
      posted([{ createTime: '2026-08-20T00:00:00.000Z', hasCallToAction: false }]),
    ].flat();

    const postFindings = branches.filter((f) => f.checkId === 'G1' || f.checkId === 'G2');
    expect(postFindings.length).toBeGreaterThan(3);
    for (const f of postFindings) {
      const text = `${f.title} ${f.detail}`.toLowerCase();
      expect(text).not.toContain('schedule');
      expect(text).not.toContain('one a week');
      expect(text).not.toContain('one post a week');
      expect(text).not.toContain('every week');
      expect(FIRST_PERSON_FIX.test(text)).toBe(false);
    }
  });
});
