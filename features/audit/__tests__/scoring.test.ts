/**
 * Scoring arithmetic and the four gates (§3).
 *
 * The centrepiece is `describe('the coverage gate points the right way')`. The
 * research notes that an earlier version of this spec had the sign backwards,
 * which would have emitted a confident number exactly when the app knew least.
 * The direction is therefore asserted in three independent ways: at the
 * boundary, by monotonicity, and by an explicit statement of what the ratio
 * means.
 */

import { unavailable } from '@/lib/state/DataState';

import { runAuditEngine } from '../engine';
import { BREADTH_GATE, COVERAGE_GATE, computeScore } from '../scoring';
import {
  input,
  ok,
  outcomes,
  syntheticInput,
  syntheticResults,
  NOW,
} from '../test-support/build';
import type { AuditArea, GateId } from '../types';

const gateFailed = (id: GateId, score: ReturnType<typeof computeScore>): boolean =>
  score.failedGates.includes(id);

/**
 * `overallCoverage` is `number | null` because "nothing applies to this
 * business" is not "we measured 0% of what applies". Every scenario in this
 * file has applicable weight, so a null here is a bug in the scorer, not a
 * shape the assertions should quietly tolerate.
 */
function coverageOf(score: ReturnType<typeof computeScore>): number {
  const coverage = score.overallCoverage;
  if (coverage === null) throw new Error('expected a coverage ratio, got null');
  return coverage;
}

describe('the coverage gate points the right way', () => {
  it('defines coverage as measured-over-applicable, so more knowledge means higher coverage', () => {
    const knowLittle = computeScore(
      syntheticResults({ notChecked: { media: 9, posts: 7, description: 7, website: 4 } }),
      syntheticInput(),
    );
    const knowEverything = computeScore(syntheticResults(), syntheticInput());

    expect(coverageOf(knowEverything)).toBeGreaterThan(coverageOf(knowLittle));
    expect(knowEverything.overallCoverage).toBe(1);
    expect(knowLittle.overallCoverage).toBeCloseTo(0.73, 5);
  });

  it('emits a score at 71% coverage and refuses one at 69%', () => {
    // 29 of 100 weight unmeasured -> coverage 0.71, above the 0.70 gate.
    const justEnough = computeScore(
      syntheticResults({ notChecked: { media: 9, posts: 7, description: 7, website: 4, nap: 2 } }),
      syntheticInput(),
    );
    // 31 unmeasured -> coverage 0.69, below it.
    const notEnough = computeScore(
      syntheticResults({ notChecked: { media: 9, posts: 7, description: 7, website: 4, nap: 4 } }),
      syntheticInput(),
    );

    expect(justEnough.overallCoverage).toBeCloseTo(0.71, 5);
    expect(justEnough.score).not.toBeNull();
    expect(gateFailed('G-coverage', justEnough)).toBe(false);

    expect(notEnough.overallCoverage).toBeCloseTo(0.69, 5);
    expect(notEnough.score).toBeNull();
    expect(gateFailed('G-coverage', notEnough)).toBe(true);
  });

  it('is monotone: measuring one more thing can never take a score away', () => {
    // Walk from "we measured everything we could reach" down to "we measured
    // almost nothing", one unit of weight at a time, only in areas light enough
    // not to trip the breadth gate.
    const budget: [AuditArea, number][] = [
      ['media', 9],
      ['posts', 7],
      ['description', 7],
      ['website', 4],
      // Half of Name/address/phone can go unmeasured before the breadth gate
      // (>= 50% per heavy area) would fire and confuse what we are testing.
      ['nap', 7],
    ];

    let previousCoverage = Number.POSITIVE_INFINITY;
    let previousScoreWasEmitted = true;

    for (let unchecked = 0; unchecked <= 34; unchecked += 1) {
      let remaining = unchecked;
      const notChecked: Partial<Record<AuditArea, number>> = {};
      for (const [area, capacity] of budget) {
        const take = Math.min(capacity, remaining);
        if (take > 0) notChecked[area] = take;
        remaining -= take;
      }

      const score = computeScore(syntheticResults({ notChecked }), syntheticInput());

      // Coverage falls as we measure less. Never the other way round.
      expect(coverageOf(score)).toBeLessThanOrEqual(previousCoverage);
      previousCoverage = coverageOf(score);

      // And once the gate has closed it never reopens as we measure even less.
      const emitted = score.score !== null;
      if (!previousScoreWasEmitted) expect(emitted).toBe(false);
      previousScoreWasEmitted = emitted;
    }

    // Sanity: the walk really did cross the gate rather than staying on one side.
    expect(previousScoreWasEmitted).toBe(false);
  });

  it('states the gate in owner-facing words with the same direction', () => {
    const score = computeScore(
      syntheticResults({ notChecked: { media: 9, posts: 7, description: 7, website: 4, nap: 4 } }),
      syntheticInput(),
    );
    const gate = score.gates.find((g) => g.id === 'G-coverage');
    expect(gate?.detail).toBe('We measured 69% of what applies to you; a score needs at least 70%.');
    expect(COVERAGE_GATE).toBe(0.7);
  });
});

describe('not_checked is never scored as a fail', () => {
  it('leaves both the numerator and the denominator', () => {
    const allMeasured = computeScore(syntheticResults(), syntheticInput());
    const someUnmeasured = computeScore(
      syntheticResults({ notChecked: { media: 9 } }),
      syntheticInput(),
    );

    expect(allMeasured.score).toBe(100);
    // Nine points of unknown do not become nine points of failure.
    expect(someUnmeasured.score).toBe(100);
    expect(someUnmeasured.totalEarnableWeight).toBe(91);
    expect(someUnmeasured.totalApplicableWeight).toBe(100);
  });

  it('scores differently from a fail of exactly the same weight', () => {
    const unmeasured = computeScore(syntheticResults({ notChecked: { media: 9 } }), syntheticInput());
    const failed = computeScore(syntheticResults({ failed: { media: 9 } }), syntheticInput());

    expect(unmeasured.score).toBe(100);
    expect(failed.score).toBe(91);
  });

  it('is never scored as a pass either', () => {
    // If not_checked counted as a pass, an area we know nothing about would
    // report a perfect area score. It must report null instead.
    const score = computeScore(syntheticResults({ notChecked: { media: 9 } }), syntheticInput());
    const media = score.areas.find((a) => a.area === 'media');
    expect(media?.areaScore).toBeNull();
    expect(media?.coverage).toBe(0);
    expect(media?.checkedCount).toBe(0);
  });
});

describe('area arithmetic never turns absence into zero', () => {
  it('reports areaScore null, not 0, when nothing in the area was measurable', () => {
    const score = computeScore(syntheticResults({ notChecked: { website: 4 } }), syntheticInput());
    const website = score.areas.find((a) => a.area === 'website');
    expect(website?.areaScore).toBeNull();
    expect(website?.areaScore).not.toBe(0);
  });

  it('reports coverage null, not 0, when nothing in the area applies', () => {
    const score = computeScore(
      syntheticResults({ notApplicable: { website: 4 } }),
      syntheticInput(),
    );
    const website = score.areas.find((a) => a.area === 'website');
    // "None of this applies to you" is not "we measured nothing about you".
    expect(website?.coverage).toBeNull();
    expect(website?.applicableWeight).toBe(0);
    expect(website?.notCheckedReasons).toEqual([]);
  });

  it('gives a genuine zero only when checks were measured and failed', () => {
    const score = computeScore(syntheticResults({ failed: { website: 4 } }), syntheticInput());
    const website = score.areas.find((a) => a.area === 'website');
    expect(website?.areaScore).toBe(0);
  });
});

describe('the four gates', () => {
  it('G-identity fails when no listing is connected, whatever else we know', () => {
    const score = computeScore(syntheticResults({ gatePasses: false }), syntheticInput());
    expect(gateFailed('G-identity', score)).toBe(true);
    expect(score.score).toBeNull();
  });

  it('G-identity fails when a listing is connected but nothing about it could be read', () => {
    const score = computeScore(
      syntheticResults({ notChecked: { foundation: 10 } }),
      syntheticInput(),
    );
    expect(gateFailed('G-identity', score)).toBe(true);
  });

  it('G-breadth fails when one heavy area is mostly unknown, even at high overall coverage', () => {
    // Reviews carry 18 points; knowing only 8 of them is 44% of that area.
    const score = computeScore(syntheticResults({ notChecked: { reviews: 10 } }), syntheticInput());
    expect(coverageOf(score)).toBeGreaterThan(COVERAGE_GATE);
    expect(gateFailed('G-breadth', score)).toBe(true);
    expect(score.gates.find((g) => g.id === 'G-breadth')?.detail).toContain('Reviews');
    expect(score.score).toBeNull();
  });

  it('G-breadth exempts a heavy area where nothing applies rather than failing it', () => {
    const score = computeScore(
      syntheticResults({ notApplicable: { nap: 14 } }),
      syntheticInput(),
    );
    expect(gateFailed('G-breadth', score)).toBe(false);
    expect(BREADTH_GATE).toBe(0.5);
  });

  it('G-freshness fails when the audit is assembled from week-old fragments', () => {
    const stale = runAuditEngine(input({}, '2026-09-30T00:00:00.000Z'));
    expect(stale.score.failedGates).toContain('G-freshness');
    expect(stale.report.status).toBe('unavailable');

    const fresh = runAuditEngine(input({}, NOW));
    expect(fresh.score.failedGates).toEqual([]);
  });
});

describe('no code path produces a score of 0 from absent data', () => {
  const scenarios: Record<string, ReturnType<typeof input>> = {
    'nothing connected at all': input({
      connection: unavailable('not_connected', 'x'),
      locations: unavailable('not_connected', 'x'),
      location: unavailable('not_connected', 'x'),
      verification: unavailable('not_connected', 'x'),
      reviews: unavailable('not_connected', 'x'),
      media: unavailable('not_connected', 'x'),
      localPosts: unavailable('not_connected', 'x'),
      attributeCatalog: unavailable('not_connected', 'x'),
      searchKeywords: unavailable('not_connected', 'x'),
      website: unavailable('not_connected', 'x'),
    }),
    'everything still loading': input({
      location: { status: 'loading' },
      reviews: { status: 'loading' },
      media: { status: 'loading' },
      localPosts: { status: 'loading' },
      website: { status: 'loading' },
      attributeCatalog: { status: 'loading' },
      verification: { status: 'loading' },
    }),
    'every provider erroring': input({
      location: { status: 'error', code: 'e', message: 'e', retryable: true },
      reviews: { status: 'error', code: 'e', message: 'e', retryable: true },
      media: { status: 'error', code: 'e', message: 'e', retryable: true },
      localPosts: { status: 'error', code: 'e', message: 'e', retryable: true },
      website: { status: 'error', code: 'e', message: 'e', retryable: true },
      attributeCatalog: { status: 'error', code: 'e', message: 'e', retryable: true },
      verification: { status: 'error', code: 'e', message: 'e', retryable: true },
    }),
    'an empty but connected profile': input({
      reviews: ok({ items: [], replyFieldTrusted: true }),
      media: ok({ ownerUploaded: [] }),
      localPosts: ok({ items: [] }),
    }),
  };

  for (const [name, scenario] of Object.entries(scenarios)) {
    it(`never reports 0 for: ${name}`, () => {
      const run = runAuditEngine(scenario);
      expect(run.score.score).not.toBe(0);
      if (run.report.status === 'ready') expect(run.report.value.score).toBeGreaterThan(0);
    });
  }
});

describe('credit', () => {
  it('gives a warn exactly its ratio, between a fail and a pass', () => {
    const results = syntheticResults();
    const target = results.find((r) => r.check.scored && r.check.area === 'website');
    expect(target).toBeDefined();
    if (target === undefined) return;

    target.outcome = outcomes.warn(0.25);
    const warned = computeScore(results, syntheticInput());
    expect(warned.totalEarnedWeight).toBe(99.25);

    target.outcome = outcomes.fail;
    expect(computeScore(results, syntheticInput()).totalEarnedWeight).toBe(99);

    target.outcome = outcomes.pass;
    expect(computeScore(results, syntheticInput()).totalEarnedWeight).toBe(100);
  });
});
