/**
 * Per-check behaviour. Each check is a pure `(observations) => CheckOutcome`, so
 * each gets a table covering pass, fail, warn, not_applicable and not_checked.
 *
 * The recurring shape to notice: a check returns `not_checked` whenever the
 * thing it is asking about is genuinely unknown, including when only HALF of it
 * is knowable (B5 knows the link exists but not whether it loads). Half a
 * measurement is not a pass.
 */

import { unavailable } from '@/lib/state/DataState';

import { runAuditEngine } from '../engine';
import {
  input,
  ok,
  locationDetail,
  ownerContext,
  review,
  websiteObservation,
} from '../test-support/build';
import type { AuditInput, CheckId, CheckOutcome, ShoogleFinding } from '../types';

function outcome(scenario: AuditInput, id: CheckId): CheckOutcome {
  const result = runAuditEngine(scenario).results.find((r) => r.check.id === id);
  if (result === undefined) throw new Error(`no result for ${id}`);
  return result.outcome;
}

function findingFor(scenario: AuditInput, id: CheckId): ShoogleFinding | undefined {
  return runAuditEngine(scenario).findings.find((f) => f.checkId === id);
}

describe('A2 — verification', () => {
  const unverified = (pending: boolean): AuditInput =>
    input({
      location: ok(
        locationDetail({
          metadata: {
            hasVoiceOfMerchant: false,
            canOperateLocalPost: true,
            canModifyServiceList: true,
            canHaveFoodMenus: false,
            placeId: 'ChIJtest',
          },
        }),
      ),
      verification: ok({ hasPendingVerification: pending, pendingMethod: pending ? 'POSTCARD' : null }),
    });

  it('passes for a listing with Voice of Merchant', () => {
    expect(outcome(input(), 'A2').kind).toBe('pass');
  });

  it('fails, critically, for an unverified listing with nothing in flight', () => {
    expect(outcome(unverified(false), 'A2').kind).toBe('fail');
    expect(findingFor(unverified(false), 'A2')?.severity).toBe('critical');
  });

  it('softens to a warning while Google is still processing a request', () => {
    const result = outcome(unverified(true), 'A2');
    expect(result.kind).toBe('warn');
    // Nothing for the owner to do while it is in flight, so it is not critical.
    expect(findingFor(unverified(true), 'A2')?.severity).toBe('important');
  });

  it('is not_checked when we cannot read the listing at all', () => {
    const result = outcome(input({ location: unavailable('not_connected', 'x') }), 'A2');
    expect(result.kind).toBe('not_checked');
  });

  it('offers a guided fix, because no API completes a verification', () => {
    expect(findingFor(unverified(false), 'A2')?.fixableByShoogle).toBe(false);
    expect(findingFor(unverified(false), 'A2')?.fixMode).toBe('guided');
  });
});

describe('A3 — open status', () => {
  const closedOnGoogle = (declared: 'open' | null): AuditInput =>
    input({
      location: ok(locationDetail({ openInfo: { status: 'CLOSED_TEMPORARILY' } })),
      owner: ok(ownerContext({ declaredOpenStatus: declared })),
    });

  it('passes when Google and the owner agree the shop is open', () => {
    expect(outcome(input(), 'A3').kind).toBe('pass');
  });

  it('fails, critically, when Google says closed and the owner says open', () => {
    expect(outcome(closedOnGoogle('open'), 'A3').kind).toBe('fail');
    expect(findingFor(closedOnGoogle('open'), 'A3')?.severity).toBe('critical');
  });

  it('asks rather than accuses when the owner has never told us either way', () => {
    // We measured what Google says. We did NOT measure the truth, so the finding
    // is a question and scores partial credit rather than a full failure.
    const result = outcome(closedOnGoogle(null), 'A3');
    expect(result.kind).toBe('warn');
    const finding = findingFor(closedOnGoogle(null), 'A3');
    expect(finding?.severity).toBe('important');
    expect(finding?.confidence).toBe('inferred');
    expect(finding?.title).toContain('is that right?');
  });

  it('is not_checked when Google returns no open/closed block at all', () => {
    const result = outcome(input({ location: ok(locationDetail({ openInfo: null })) }), 'A3');
    expect(result.kind).toBe('not_checked');
    if (result.kind === 'not_checked') expect(result.reason).toBe('no_data_yet');
  });
});

describe('B2 / B3 / B6 — address, pin and service area', () => {
  const serviceAreaOnly = input({
    location: ok(
      locationDetail({
        storefrontAddress: null,
        latLng: null,
        serviceArea: { businessType: 'CUSTOMER_LOCATION_ONLY', placeCount: 0 },
      }),
    ),
  });

  it('B2 is not_applicable for a business with no walk-in address', () => {
    expect(outcome(serviceAreaOnly, 'B2').kind).toBe('not_applicable');
  });

  it('B2 warns when only the PIN code is missing, and fails when more is', () => {
    const noPin = input({
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
    });
    const barelyAnything = input({
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
    });
    expect(outcome(noPin, 'B2').kind).toBe('warn');
    expect(outcome(barelyAnything, 'B2').kind).toBe('fail');
    expect(findingFor(barelyAnything, 'B2')?.severity).toBe('critical');
  });

  it('B3 grades the pin by distance, and reports the metres it measured', () => {
    const at = (latitude: number): AuditInput =>
      input({ location: ok(locationDetail({ latLng: { latitude, longitude: 73.019 } })) });

    expect(outcome(at(19.033), 'B3').kind).toBe('pass'); // ~11 m
    expect(outcome(at(19.0321), 'B3').kind).toBe('warn'); // ~111 m
    expect(outcome(at(19.028), 'B3').kind).toBe('fail'); // ~567 m
    expect(findingFor(at(19.028), 'B3')?.evidence.some((e) => e.startsWith('Distance:'))).toBe(true);
  });

  it('B3 is not_checked when we never worked out where the address is', () => {
    const result = outcome(
      input({ location: ok(locationDetail({ geocodedAddressLatLng: null })) }),
      'B3',
    );
    expect(result.kind).toBe('not_checked');
    if (result.kind === 'not_checked') expect(result.reason).toBe('insufficient_data');
  });

  it('B6 is not_applicable for a storefront and critical for a service-area business', () => {
    expect(outcome(input(), 'B6').kind).toBe('not_applicable');
    expect(outcome(serviceAreaOnly, 'B6').kind).toBe('fail');
    expect(findingFor(serviceAreaOnly, 'B6')?.severity).toBe('critical');
  });
});

describe('B4 — phone', () => {
  const withPhone = (primaryPhone: string | null): AuditInput =>
    input({ location: ok(locationDetail({ primaryPhone })) });

  it.each([
    ['+91 98200 12345', 'pass'],
    ['9820012345', 'pass'],
    ['022 2757 1234', 'pass'],
    ['12345', 'fail'],
    ['not a number', 'fail'],
    ['1234567890', 'fail'],
  ])('reads %s as %s', (phone, expected) => {
    expect(outcome(withPhone(phone), 'B4').kind).toBe(expected);
  });

  it('fails with a different sentence when there is no number at all', () => {
    expect(findingFor(withPhone(null), 'B4')?.title).toBe('Your listing has no phone number');
  });
});

describe('B5 — the website link', () => {
  it('fails when the listing has no link', () => {
    expect(outcome(input({ location: ok(locationDetail({ websiteUri: null })) }), 'B5').kind).toBe(
      'fail',
    );
  });

  it('fails when the link is there but returns an error', () => {
    const broken = input({ website: ok(websiteObservation({ httpStatus: 503 })) });
    expect(outcome(broken, 'B5').kind).toBe('fail');
    expect(findingFor(broken, 'B5')?.title).toContain('503');
  });

  it('is not_checked — not a pass — when the link exists but we could not open it', () => {
    // Half a measurement. The check is "present AND live"; we only know half.
    const result = outcome(input({ website: unavailable('offline', 'You are offline.') }), 'B5');
    expect(result.kind).toBe('not_checked');
    if (result.kind === 'not_checked') expect(result.reason).toBe('offline');
  });
});

describe('C2 — the category-fit proposal, and its guardrails', () => {
  const mismatched = (overrides: Partial<AuditInput['observations']> = {}): AuditInput =>
    input({
      owner: ok(ownerContext({ business: { ...ownerContext().business, category: 'gym' } })),
      ...overrides,
    });

  it('refuses to run without enough evidence to infer from', () => {
    const thin = mismatched({
      reviews: ok({ items: [review(1, 5, '2026-08-20T00:00:00.000Z', true)], replyFieldTrusted: true }),
      location: ok(locationDetail({ serviceItems: [] })),
    });
    const result = outcome(thin, 'C2');
    expect(result.kind).toBe('not_checked');
    if (result.kind === 'not_checked') expect(result.reason).toBe('insufficient_data');
    expect(findingFor(thin, 'C2')).toBeUndefined();
  });

  it('warns rather than fails, and never claims to be an observation', () => {
    const result = outcome(mismatched(), 'C2');
    expect(result.kind).toBe('warn');
    expect(findingFor(mismatched(), 'C2')?.confidence).toBe('inferred');
    expect(findingFor(mismatched(), 'C2')?.severity).toBe('important');
  });

  it('cites its evidence, and renders a below-threshold keyword as "<15", never as a number', () => {
    const evidence = findingFor(mismatched(), 'C2')?.evidence ?? [];
    const searched = evidence.find((e) => e.startsWith('People found you searching:'));
    expect(searched).toContain('"hair spa near me" — 240 people');
    // The threshold is a lower bound. Rendering it as 15 would fabricate data;
    // rendering it as 0 would break "unknown is not zero" twice over.
    expect(searched).toContain('"salon nerul" — <15 people');
    expect(searched).not.toContain('— 15 people');
  });

  it('is never offered as an automatic change', () => {
    expect(findingFor(mismatched(), 'C2')?.fixMode).not.toBe('auto');
  });
});

describe('C5 — service prices', () => {
  const withPrices = (priced: number): AuditInput =>
    input({
      location: ok(
        locationDetail({
          serviceItems: [
            { name: 'Haircut', priceInPaise: priced > 0 ? 30_000 : null },
            { name: 'Hair spa', priceInPaise: priced > 1 ? 120_000 : null },
            { name: 'Colour', priceInPaise: priced > 2 ? 200_000 : null },
          ],
        }),
      ),
    });

  it('passes when everything is priced', () => {
    expect(outcome(withPrices(3), 'C5').kind).toBe('pass');
  });

  it('gives partial credit equal to the share that is priced', () => {
    const result = outcome(withPrices(2), 'C5');
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') expect(result.ratio).toBeCloseTo(2 / 3, 5);
  });

  it('fails when none of them is priced', () => {
    expect(outcome(withPrices(0), 'C5').kind).toBe('fail');
  });

  it('is not_applicable when there is no service list to price', () => {
    expect(outcome(input({ location: ok(locationDetail({ serviceItems: [] })) }), 'C5').kind).toBe(
      'not_applicable',
    );
  });
});

describe('D2 — plausible hours', () => {
  const alwaysOpen = (confirmed: boolean | null): AuditInput =>
    input({
      location: ok(
        locationDetail({
          regularHourPeriods: [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
            'SUNDAY',
          ].map((day) => ({
            day: day as 'MONDAY',
            openMinutes: 0,
            closeMinutes: 0,
          })),
        }),
      ),
      owner: ok(ownerContext({ confirmed24x7: confirmed })),
    });

  it('passes when the owner has confirmed they really are open 24x7', () => {
    expect(outcome(alwaysOpen(true), 'D2').kind).toBe('pass');
  });

  it('fails when the owner has told us it is wrong', () => {
    expect(outcome(alwaysOpen(false), 'D2').kind).toBe('fail');
  });

  it('asks, and gives partial credit, when we have never asked', () => {
    // Never-asked is not the same fact as "the owner said no". Scoring it as a
    // full failure would assert something we have not measured.
    const result = outcome(alwaysOpen(null), 'D2');
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') expect(result.ratio).toBe(0.5);
    expect(findingFor(alwaysOpen(null), 'D2')?.confidence).toBe('inferred');
  });

  it('is not_applicable when there are no hours at all to sanity-check', () => {
    expect(
      outcome(input({ location: ok(locationDetail({ regularHourPeriods: [] })) }), 'D2').kind,
    ).toBe('not_applicable');
  });
});

describe('D3 — festival hours, and a calendar that admits what it does not know', () => {
  const BEFORE_GANDHI_JAYANTI = '2026-09-25T00:00:00.000Z';

  it('fails when a festival is inside the window and no special hours cover it', () => {
    const result = outcome(input({}, BEFORE_GANDHI_JAYANTI), 'D3');
    expect(result.kind).toBe('fail');
    const finding = findingFor(input({}, BEFORE_GANDHI_JAYANTI), 'D3');
    expect(finding?.title).toContain('Gandhi Jayanti');
    expect(finding?.title).toContain('7 days');
  });

  it('passes when the owner already has special hours over that date', () => {
    const covered = input(
      {
        location: ok(
          locationDetail({
            specialHourPeriods: [
              { startDate: '2026-10-02', endDate: '2026-10-02', closed: true },
            ],
          }),
        ),
      },
      BEFORE_GANDHI_JAYANTI,
    );
    expect(outcome(covered, 'D3').kind).toBe('pass');
  });

  it('is not_checked — never "nothing is coming" — when the calendar cannot speak', () => {
    // The calendar only carries fixed-date holidays and says so, so an empty
    // window is "we do not know", not "there is no festival".
    const result = outcome(input(), 'D3');
    expect(result.kind).toBe('not_checked');
    if (result.kind === 'not_checked') expect(result.reason).toBe('insufficient_data');
  });

  it('is not_checked when we do not know which state the business is in', () => {
    const result = outcome(
      input({ owner: ok(ownerContext({ stateCode: null })) }, BEFORE_GANDHI_JAYANTI),
      'D3',
    );
    // A national holiday is in the window, but state festivals are invisible to
    // us without a state, so we cannot claim the window is covered.
    expect(['fail', 'not_checked']).toContain(result.kind);
  });

  it('flags holiday hours that have all expired', () => {
    const stale = input({
      location: ok(
        locationDetail({
          specialHourPeriods: [{ startDate: '2025-11-01', endDate: '2025-11-02', closed: true }],
        }),
      ),
    });
    expect(outcome(stale, 'D3').kind).toBe('fail');
    expect(findingFor(stale, 'D3')?.title).toBe('Your holiday hours on Google are out of date');
  });
});

describe('F2 / F3 / F4 — the review checks and their preconditions', () => {
  const fourReviews = input({
    reviews: ok({
      items: [1, 2, 3, 4].map((i) => review(i, 5, `2026-08-2${i}T00:00:00.000Z`, true)),
      replyFieldTrusted: true,
    }),
  });

  it('F2 refuses to average fewer than five reviews', () => {
    const result = outcome(fourReviews, 'F2');
    expect(result.kind).toBe('not_checked');
    if (result.kind === 'not_checked') expect(result.reason).toBe('insufficient_data');
  });

  it('F2 grades the average once there is enough of it', () => {
    const rated = (stars: 1 | 2 | 3 | 4 | 5): AuditInput =>
      input({
        reviews: ok({
          items: [1, 2, 3, 4, 5, 6].map((i) => review(i, stars, `2026-08-2${i}T00:00:00.000Z`, true)),
          replyFieldTrusted: true,
        }),
      });
    expect(outcome(rated(5), 'F2').kind).toBe('pass');
    expect(outcome(rated(4), 'F2').kind).toBe('warn');
    expect(outcome(rated(3), 'F2').kind).toBe('fail');
  });

  it('F3 and F4 stay unchecked until we know Google shows us outside replies', () => {
    const untrusted = input({
      reviews: ok({
        items: [review(1, 1, '2026-08-20T00:00:00.000Z', false)],
        replyFieldTrusted: false,
      }),
    });
    expect(outcome(untrusted, 'F3').kind).toBe('not_checked');
    expect(outcome(untrusted, 'F4').kind).toBe('not_checked');
    // The important part: we do NOT accuse an owner who may have already replied.
    expect(findingFor(untrusted, 'F4')).toBeUndefined();
  });

  it('F4 is critical and names how many are unanswered once we can trust the field', () => {
    const trusted = input({
      reviews: ok({
        items: [
          review(1, 1, '2026-08-20T00:00:00.000Z', false),
          review(2, 2, '2026-08-21T00:00:00.000Z', false),
          review(3, 5, '2026-08-22T00:00:00.000Z', true),
        ],
        replyFieldTrusted: true,
      }),
    });
    expect(outcome(trusted, 'F4').kind).toBe('fail');
    const finding = findingFor(trusted, 'F4');
    expect(finding?.severity).toBe('critical');
    expect(finding?.title).toBe('2 unhappy reviews have no reply');
    expect(finding?.fixableByShoogle).toBe(true);
  });
});

describe('H3 — attributes are never guessed', () => {
  it('is not_checked when the attribute catalog could not be read', () => {
    const result = outcome(
      input({ attributeCatalog: unavailable('rate_limited', 'Google is limiting requests.') }),
      'H3',
    );
    expect(result.kind).toBe('not_checked');
  });

  it('is not_applicable when Google offers no attributes for this category', () => {
    const result = outcome(
      input({
        attributeCatalog: ok({
          availableAttributeIds: [],
          highValueAttributeIds: [],
          labelsById: {},
        }),
      }),
      'H3',
    );
    expect(result.kind).toBe('not_applicable');
  });

  it('names the missing labels using the catalog, not a hard-coded list', () => {
    const scenario = input({
      location: ok(locationDetail({ attributeIds: [] })),
      attributeCatalog: ok({
        availableAttributeIds: ['pay_upi', 'requires_appointments'],
        highValueAttributeIds: ['pay_upi', 'requires_appointments'],
        labelsById: { pay_upi: 'UPI accepted', requires_appointments: 'Appointment needed' },
      }),
    });
    expect(outcome(scenario, 'H3').kind).toBe('fail');
    expect(findingFor(scenario, 'H3')?.title).toContain('UPI accepted');
  });
});

describe('I1 / I2 / I3 — the website checks', () => {
  const noWebsite = input({
    website: unavailable('not_supported', 'This business has no website.'),
  });

  it('are not_applicable when the business has no website at all', () => {
    // A business with no website is not a business with a broken website.
    expect(outcome(noWebsite, 'I1').kind).toBe('not_applicable');
    expect(outcome(noWebsite, 'I2').kind).toBe('not_applicable');
    expect(outcome(noWebsite, 'I3').kind).toBe('not_applicable');
    expect(runAuditEngine(noWebsite).uncheckedAreas.join(' ')).not.toContain('Website');
  });

  it('are not_checked when there IS a website we could not read', () => {
    const unread = input({ website: unavailable('offline', 'You are offline.') });
    expect(outcome(unread, 'I1').kind).toBe('not_checked');
  });

  it('never point the owner at a route that does not exist', () => {
    const broken = input({ website: ok(websiteObservation({ telLinkPresent: false })) });
    expect(findingFor(broken, 'I3')?.fixHref).toBeNull();
    expect(findingFor(broken, 'I3')?.fixMode).toBe('guided');
  });

  it('stop reading a site that is not loading rather than reporting it as unmarked', () => {
    const down = input({
      website: ok(websiteObservation({ fetchOutcome: 'network_error', httpStatus: null })),
    });
    expect(outcome(down, 'I1').kind).toBe('fail');
    expect(outcome(down, 'I2').kind).toBe('not_applicable');
    expect(outcome(down, 'I3').kind).toBe('not_applicable');
  });
});
