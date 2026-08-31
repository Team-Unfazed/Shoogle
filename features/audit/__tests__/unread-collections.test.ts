/**
 * "Google returned this list and it was empty" vs "Google never returned this
 * list at all", inside a location we DID read.
 *
 * `DataState` already draws that line for a whole observation, and
 * `measured-zero-vs-unknown.test.ts` pins it there. It cannot draw it for one
 * FIELD: a field mask, a scope or an API version can drop `serviceItems` while
 * every other field on the same `Location` comes back fine, and the observation
 * is still, correctly, `ready`. Modelled as a bare array, both facts arrive as
 * `[]` and the audit tells the owner they have listed no services when nobody
 * ever asked Google for the list.
 *
 * So every collection on `GbpLocationDetail` is a `ReadCollection`, and each
 * pair below asserts the same shape of thing twice: `read([])` is a measured
 * zero that earns a real finding, `not_read` is an unknown that earns
 * `not_checked`, no finding, and a named line in `uncheckedAreas`.
 */

import { runAuditEngine } from '../engine';
import { input, locationDetail, ok, ownerContext, NOW } from '../test-support/build';
import {
  readCollection,
  unreadCollection,
  type CheckId,
  type CheckOutcome,
  type GbpLocationDetail,
  type NotCheckedReason,
} from '../types';

type LocationPatch = Parameters<typeof locationDetail>[0];

function run(patch: LocationPatch, now: string = NOW): ReturnType<typeof runAuditEngine> {
  return runAuditEngine(input({ location: ok(locationDetail(patch)) }, now));
}

function outcomeOf(result: ReturnType<typeof runAuditEngine>, id: CheckId): CheckOutcome {
  const found = result.results.find((r) => r.check.id === id);
  if (found === undefined) throw new Error(`no result for ${id}`);
  return found.outcome;
}

const findingIds = (result: ReturnType<typeof runAuditEngine>): string[] =>
  result.findings.map((f) => f.checkId);

/**
 * Each row is one collection, the check that reads it, and the two patches that
 * differ ONLY in whether Google answered. Data-driven so a new collection added
 * to `GbpLocationDetail` has an obvious place to be pinned.
 */
interface CollectionCase {
  field: keyof GbpLocationDetail;
  checkId: CheckId;
  /** Google answered, and the answer was "none". */
  measuredZero: LocationPatch;
  /** Google never sent the list. */
  unread: LocationPatch;
  unreadReason: NotCheckedReason;
  /** Extra patch applied to both, so the check reaches the collection at all. */
  now?: string;
}

const NEVER_ASKED = 'Google did not return this list for your location.';

const CASES: CollectionCase[] = [
  {
    field: 'regularHourPeriods',
    checkId: 'D1',
    measuredZero: { regularHourPeriods: readCollection([]) },
    unread: { regularHourPeriods: unreadCollection('not_supported', NEVER_ASKED) },
    unreadReason: 'not_supported',
  },
  {
    field: 'serviceItems',
    checkId: 'C4',
    measuredZero: { serviceItems: readCollection([]) },
    unread: { serviceItems: unreadCollection('rate_limited', NEVER_ASKED) },
    unreadReason: 'rate_limited',
  },
  {
    field: 'additionalCategories',
    checkId: 'C3',
    measuredZero: { additionalCategories: readCollection([]) },
    unread: { additionalCategories: unreadCollection('no_data_yet', NEVER_ASKED) },
    unreadReason: 'no_data_yet',
  },
  {
    field: 'attributeIds',
    checkId: 'H3',
    measuredZero: { attributeIds: readCollection([]) },
    unread: { attributeIds: unreadCollection('provider_error', NEVER_ASKED) },
    unreadReason: 'provider_error',
  },
  {
    field: 'specialHourPeriods',
    checkId: 'D3',
    // A festival is 7 days away, so an empty special-hours list is a real,
    // measured "you have not set holiday hours for it".
    measuredZero: { specialHourPeriods: readCollection([]) },
    unread: { specialHourPeriods: unreadCollection('offline', NEVER_ASKED) },
    unreadReason: 'offline',
    now: '2026-09-25T00:00:00.000Z',
  },
];

describe('an unread collection is not an empty one', () => {
  for (const testCase of CASES) {
    describe(`${String(testCase.field)} (read by ${testCase.checkId})`, () => {
      it('produces a real finding when Google answered "none"', () => {
        const result = run(testCase.measuredZero, testCase.now);
        const outcome = outcomeOf(result, testCase.checkId);
        expect(['fail', 'warn']).toContain(outcome.kind);
        expect(findingIds(result)).toContain(testCase.checkId);
      });

      it('produces not_checked, carrying the reason, when Google never sent it', () => {
        const result = run(testCase.unread, testCase.now);
        const outcome = outcomeOf(result, testCase.checkId);
        expect(outcome.kind).toBe('not_checked');
        if (outcome.kind === 'not_checked') {
          expect(outcome.reason).toBe(testCase.unreadReason);
          expect(outcome.detail).toBe(NEVER_ASKED);
        }
      });

      it('emits no finding at all for the unread list', () => {
        // The whole point: we must not accuse an owner of an empty list we
        // never actually read.
        expect(findingIds(run(testCase.unread, testCase.now))).not.toContain(testCase.checkId);
      });

      it('names the area as unchecked instead of scoring it', () => {
        const result = run(testCase.unread, testCase.now);
        const check = result.results.find((r) => r.check.id === testCase.checkId);
        const area = check?.check.area;
        expect(area).toBeDefined();
        const areaCoverage = result.score.areas.find((a) => a.area === area);
        expect(areaCoverage?.notCheckedReasons).toContain(testCase.unreadReason);
        expect(result.uncheckedAreas.join(' ')).toContain(areaCoverage?.label ?? '!!');
      });

      it('never scores the unknown as the failure the measured zero is', () => {
        const measuredRun = run(testCase.measuredZero, testCase.now);
        const unreadRun = run(testCase.unread, testCase.now);
        const check = measuredRun.results.find((r) => r.check.id === testCase.checkId)?.check;
        expect(check).toBeDefined();
        if (check === undefined) return;

        const areaIn = (result: ReturnType<typeof runAuditEngine>) => {
          const area = result.score.areas.find((a) => a.area === check.area);
          if (area === undefined) throw new Error(`no coverage for ${check.area}`);
          return area;
        };
        const measured = areaIn(measuredRun);
        const unread = areaIn(unreadRun);

        // The measured zero is a real, scored failure inside its area.
        expect(measured.areaScore).not.toBeNull();
        expect(measured.areaScore ?? 1).toBeLessThan(1);

        // The unknown never manufactures that failure. Either nothing in the
        // area was measurable at all (null — never 0), or what WAS measurable
        // is left standing higher than the measured failure.
        expect(
          unread.areaScore === null || unread.areaScore > (measured.areaScore ?? 0),
        ).toBe(true);

        // And it does not quietly leave the denominator either: the check still
        // applies to this business, it just could not be run.
        expect(unread.applicableWeight).toBeGreaterThanOrEqual(check.weight);
        expect(unread.notCheckedReasons).toContain(testCase.unreadReason);
      });
    });
  }
});

describe('the collections that feed a check only as evidence', () => {
  it('D2 refuses to sanity-check hours it was never given', () => {
    const result = run({ regularHourPeriods: unreadCollection('offline', NEVER_ASKED) });
    const outcome = outcomeOf(result, 'D2');
    // NOT `not_applicable` ("there are no hours to check") — that would assert
    // the listing has no hours, which we did not measure.
    expect(outcome.kind).toBe('not_checked');
    expect(outcomeOf(run({ regularHourPeriods: readCollection([]) }), 'D2').kind).toBe(
      'not_applicable',
    );
  });

  it('D4 does not report "no separate hours" when it was never sent them', () => {
    const clinic = ownerContext({
      business: { ...ownerContext().business, category: 'clinic' },
    });
    const unread = runAuditEngine(
      input({
        owner: ok(clinic),
        location: ok(locationDetail({ moreHours: unreadCollection('not_supported', NEVER_ASKED) })),
      }),
    );
    const measured = runAuditEngine(
      input({ owner: ok(clinic), location: ok(locationDetail({ moreHours: readCollection([]) })) }),
    );
    expect(outcomeOf(unread, 'D4').kind).toBe('not_checked');
    expect(outcomeOf(measured, 'D4').kind).toBe('warn');
  });

  it('C5 will not price a service list it never read', () => {
    const result = run({ serviceItems: unreadCollection('provider_error', NEVER_ASKED) });
    expect(outcomeOf(result, 'C5').kind).toBe('not_checked');
    expect(findingIds(result)).not.toContain('C5');
  });

  it('C2 falls back to not_checked rather than inferring from an unread service list', () => {
    // Thin reviews plus an unread service list is no evidence base at all, and
    // C2 is the check the research calls the most dangerous in the audit.
    const result = runAuditEngine(
      input({
        reviews: ok({ items: [], replyFieldTrusted: true }),
        location: ok(
          locationDetail({ serviceItems: unreadCollection('rate_limited', NEVER_ASKED) }),
        ),
      }),
    );
    const outcome = outcomeOf(result, 'C2');
    expect(outcome.kind).toBe('not_checked');
    if (outcome.kind === 'not_checked') expect(outcome.reason).toBe('rate_limited');
  });

  it('H2 does not accuse a description of hiding services it never saw listed', () => {
    // With no declared services and an unread service list there is nothing to
    // look for, so the "it does not say what you actually do" complaint must
    // not appear — it would rest on a list we were never given.
    const result = runAuditEngine(
      input({
        owner: ok(ownerContext({ declaredServices: [] })),
        location: ok(
          locationDetail({
            profileDescription:
              'Sunrise Salon has been open in Nerul since 2009 and our team of six has been with ' +
              'us for years. Walk in on a weekday or book ahead for the weekend, when we are at ' +
              'our busiest, and every tool is sterilised between clients without exception here.',
            serviceItems: unreadCollection('not_supported', NEVER_ASKED),
          }),
        ),
      }),
    );
    const finding = result.findings.find((f) => f.checkId === 'H2');
    expect(finding?.detail ?? '').not.toContain('does not say what you actually do');
  });
});
