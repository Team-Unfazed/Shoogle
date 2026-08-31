/**
 * The engine end to end: what comes back, what never comes back, and the two
 * places where a well-meaning implementation would quietly start lying —
 * `uncheckedAreas` going empty, and a missing score swallowing real findings.
 */

import { unavailable } from '@/lib/state/DataState';

import { runAuditEngine } from '../engine';
import { AREA_LABEL, type AuditArea, type AuditInput } from '../types';
import { input, ok, locationDetail, websiteObservation, ownerContext, NOW } from '../test-support/build';

const scenarios: Record<string, AuditInput> = {
  'a healthy connected salon': input(),
  'nothing connected': input({
    connection: unavailable('not_connected', 'x'),
    locations: unavailable('not_connected', 'x'),
    location: unavailable('not_connected', 'x'),
    verification: unavailable('not_connected', 'x'),
    reviews: unavailable('not_connected', 'x'),
    media: unavailable('not_connected', 'x'),
    localPosts: unavailable('not_connected', 'x'),
    attributeCatalog: unavailable('not_connected', 'x'),
    searchKeywords: unavailable('not_connected', 'x'),
  }),
  'connected but reviews are rate limited': input({
    reviews: unavailable('rate_limited', 'Google is limiting requests.'),
  }),
  'an empty but connected profile': input({
    reviews: ok({ items: [], replyFieldTrusted: true }),
    media: ok({ ownerUploaded: [] }),
    localPosts: ok({ items: [] }),
  }),
  'a business with no website': input({
    website: unavailable('not_supported', 'This business has no website.'),
  }),
  'a service-area business': input({
    location: ok(
      locationDetail({
        storefrontAddress: null,
        latLng: null,
        serviceArea: { businessType: 'CUSTOMER_LOCATION_ONLY', placeCount: 3 },
      }),
    ),
  }),
};

describe('uncheckedAreas is never silently empty', () => {
  for (const [name, scenario] of Object.entries(scenarios)) {
    it(`declares every unchecked area for: ${name}`, () => {
      const run = runAuditEngine(scenario);

      const areasWithUnchecked = new Set<AuditArea>();
      for (const result of run.results) {
        if (result.check.scored && result.outcome.kind === 'not_checked') {
          areasWithUnchecked.add(result.check.area);
        }
      }

      // The invariant, both directions: a partial audit always says so, and a
      // complete one does not invent a caveat it does not have.
      expect(run.uncheckedAreas.length > 0).toBe(areasWithUnchecked.size > 0);
      for (const area of areasWithUnchecked) {
        expect(run.uncheckedAreas.some((line) => line.startsWith(AREA_LABEL[area]))).toBe(true);
      }

      // Every line names a reason, not just an area.
      for (const line of run.uncheckedAreas) {
        expect(line).toContain(' — ');
        expect(line.split(' — ')[1]?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it(`keeps uncheckedCount consistent with the outcomes for: ${name}`, () => {
      const run = runAuditEngine(scenario);
      const expected = run.results.filter(
        (r) => r.check.scored && r.outcome.kind === 'not_checked',
      ).length;
      expect(run.uncheckedCount).toBe(expected);
    });
  }

  it('names an area that is only partly unchecked, not just a fully dark one', () => {
    // The baseline salon can read its hours but not the festival calendar.
    const run = runAuditEngine(input());
    expect(run.uncheckedAreas).toEqual(['Hours — not enough to judge']);
    const hours = run.score.areas.find((a) => a.area === 'hours');
    expect(hours?.coverage).toBeGreaterThan(0);
    expect(hours?.coverage).toBeLessThan(1);
  });
});

describe('a missing score never suppresses a real finding', () => {
  const disconnectedWithBrokenSite = input({
    connection: unavailable('not_connected', 'No Google Business Profile is linked.'),
    locations: unavailable('not_connected', 'x'),
    location: unavailable('not_connected', 'x'),
    verification: unavailable('not_connected', 'x'),
    reviews: unavailable('not_connected', 'x'),
    media: unavailable('not_connected', 'x'),
    localPosts: unavailable('not_connected', 'x'),
    attributeCatalog: unavailable('not_connected', 'x'),
    searchKeywords: unavailable('not_connected', 'x'),
    website: ok(
      websiteObservation({ fetchOutcome: 'network_error', httpStatus: null, finalUrl: null }),
    ),
  });

  it('returns the connect finding AND every finding from a check that did run', () => {
    const run = runAuditEngine(disconnectedWithBrokenSite);

    expect(run.report.status).toBe('unavailable');
    const ids = run.findings.map((f) => f.checkId);
    expect(ids).toContain('A1');
    expect(ids).toContain('I1'); // the website really is down; that is still true
    expect(run.findings[0]?.checkId).toBe('A1');
  });

  it('emits no finding for any of the things it could not see', () => {
    const run = runAuditEngine(disconnectedWithBrokenSite);
    const ids = run.findings.map((f) => f.checkId);
    for (const invisible of ['A2', 'B2', 'B4', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1']) {
      expect(ids).not.toContain(invisible);
    }
  });

  it('explains the missing number in the owner-facing message', () => {
    const run = runAuditEngine(disconnectedWithBrokenSite);
    if (run.report.status !== 'unavailable') throw new Error('expected unavailable');
    expect(run.report.reason).toBe('insufficient_data');
    expect(run.report.message).toContain(`Shoogle checked ${run.score.ranCount} of`);
    expect(run.report.message).toContain("isn't enough to score your profile honestly");
  });

  it('never hands back a report object carrying a fabricated score', () => {
    const run = runAuditEngine(disconnectedWithBrokenSite);
    // AuditReport.score is `number`, not `number | null`, so the only honest
    // move when there is no number is to not produce a report at all.
    expect(run.report.status).not.toBe('ready');
    expect(run.score.score).toBeNull();
  });
});

describe('the contract narrowing', () => {
  it('mirrors each ShoogleFinding into an AuditFinding without losing or inventing one', () => {
    const run = runAuditEngine(input({ media: ok({ ownerUploaded: [] }) }));
    if (run.report.status !== 'ready') throw new Error('expected a scored report');

    expect(run.report.value.findings).toHaveLength(run.findings.length);
    run.report.value.findings.forEach((contract, i) => {
      const rich = run.findings[i];
      expect(contract.id).toBe(rich?.id);
      expect(contract.title).toBe(rich?.title);
      expect(contract.detail).toBe(rich?.detail);
      expect(contract.severity).toBe(rich?.severity);
      expect(contract.fixHref).toBe(rich?.fixHref);
    });
    expect(run.report.value.uncheckedAreas).toEqual(run.uncheckedAreas);
    expect(run.report.value.generatedAt).toBe(NOW);
  });

  it('produces no fixHref by default, because the engine does not know what routes exist', () => {
    const run = runAuditEngine(input({ media: ok({ ownerUploaded: [] }) }));
    expect(run.findings.every((f) => f.fixHref === null)).toBe(true);
  });

  it('uses the resolver the screen supplies, when it supplies one', () => {
    const run = runAuditEngine(input({ media: ok({ ownerUploaded: [] }) }), {
      fixHrefFor: (checkId) => (checkId === 'E1' ? '/seo/photos' : null),
    });
    expect(run.findings.find((f) => f.checkId === 'E1')?.fixHref).toBe('/seo/photos');
    expect(run.findings.find((f) => f.checkId === 'E2')?.fixHref).toBeNull();
  });
});

describe('every finding carries its evidence and a fix in plain English', () => {
  const run = runAuditEngine(
    input({
      media: ok({ ownerUploaded: [] }),
      reviews: ok({ items: [], replyFieldTrusted: true }),
      localPosts: ok({ items: [] }),
      location: ok(locationDetail({ primaryPhone: null, profileDescription: null })),
    }),
  );

  it('produced enough findings to make this test meaningful', () => {
    expect(run.findings.length).toBeGreaterThan(4);
  });

  it('states what was literally observed, and cites at least one data point', () => {
    for (const f of run.findings) {
      expect(f.observation.length).toBeGreaterThan(10);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.observedAt).toBeTruthy();
    }
  });

  it('never uses consultant language in a title or detail', () => {
    const banned = [
      'seo',
      'nap',
      'schema markup',
      'citation',
      'solv',
      'optimi', // optimise / optimize / optimization
      'leverage',
      'synerg',
    ];
    for (const f of run.findings) {
      const text = `${f.title} ${f.detail}`.toLowerCase();
      for (const word of banned) expect(text).not.toContain(word);
    }
  });

  it('tells the owner what will happen, not just what is wrong', () => {
    for (const f of run.findings) {
      // Every detail is at least a sentence and ends like one.
      expect(f.detail.length).toBeGreaterThan(40);
      expect(f.detail.trim().endsWith('.')).toBe(true);
    }
  });

  it('records a falsifiability check and a leading indicator on every finding', () => {
    for (const f of run.findings) {
      expect(f.failureCheck.length).toBeGreaterThan(20);
      expect(f.leadingIndicator.length).toBeGreaterThan(5);
    }
  });

  it('only offers a Shoogle fix where the write path genuinely exists', () => {
    for (const f of run.findings) {
      if (f.fixableByShoogle) {
        expect(['auto', 'assisted']).toContain(f.fixMode);
      } else {
        expect(['guided', 'owner']).toContain(f.fixMode);
      }
    }
  });
});

describe('dismissal is data (§5.3.6)', () => {
  const brokenNames = input({
    location: ok(locationDetail({ title: 'Sunrise Hair Studio' })),
  });

  it('raises the inferred finding the first time', () => {
    const run = runAuditEngine(brokenNames);
    expect(run.findings.map((f) => f.checkId)).toContain('B1');
  });

  it('stops re-raising it once the owner has judged it, without scoring it as a failure', () => {
    const run = runAuditEngine(
      input({
        location: ok(locationDetail({ title: 'Sunrise Hair Studio' })),
        owner: ok(ownerContext({ dismissedCheckIds: ['B1'] })),
      }),
    );

    expect(run.findings.map((f) => f.checkId)).not.toContain('B1');
    const b1 = run.results.find((r) => r.check.id === 'B1');
    expect(b1?.outcome.kind).toBe('not_applicable');
    // Dismissed is not unchecked: the owner answered, so nothing is unknown.
    expect(run.uncheckedAreas.some((l) => l.startsWith('Address and phone'))).toBe(false);
  });
});

describe('purity', () => {
  it('is deterministic: the same input twice gives the same report', () => {
    const first = runAuditEngine(input());
    const second = runAuditEngine(input());
    expect(second.report).toEqual(first.report);
    expect(second.findings).toEqual(first.findings);
    expect(second.score).toEqual(first.score);
  });

  it('does not read the clock — a different `now` is the only thing that moves it', () => {
    const early = runAuditEngine(input({}, '2026-08-30T00:00:00.000Z'));
    const later = runAuditEngine(input({}, '2026-08-31T00:00:00.000Z'));
    expect(later.report.status).toBe('ready');
    if (early.report.status === 'ready' && later.report.status === 'ready') {
      expect(later.report.value.generatedAt).not.toBe(early.report.value.generatedAt);
      expect(later.report.value.score).toBe(early.report.value.score);
    }
  });
});
