/**
 * Two ways the score gates could let a number out that has not been earned.
 *
 * 1. G-freshness read an UNPARSEABLE timestamp as fresh. `daysBetween` returns
 *    NaN for one, and NaN fails every comparison — so a filter of
 *    `!Number.isNaN(age) && age >= MAX` excluded it from the stale set and the
 *    gate passed. An age we could not work out is an UNKNOWN age, and an unknown
 *    age is not evidence that a score describes today. It must fail the gate.
 *
 * 2. `overallCoverage` was `0` when no check applied at all, which reads as "we
 *    measured none of what applies to you" and prints "We measured 0% of what
 *    applies to you". Nothing applied; there was no percentage to state. It is
 *    `null`, and the gate sentence has to branch on that.
 */

import { runAuditEngine } from '../engine';
import { computeScore } from '../scoring';
import {
  input,
  ok,
  outcomes,
  syntheticInput,
  syntheticResults,
  NOW,
} from '../test-support/build';
import { AREA_WEIGHT, type AuditArea, type AuditInput } from '../types';

/** Runs the real checks, so `needs` genuinely points at the reading under test. */
const scoreOf = (scenario: AuditInput): ReturnType<typeof computeScore> =>
  computeScore(runAuditEngine(scenario).results, scenario);

const freshnessDetail = (score: ReturnType<typeof computeScore>): string =>
  score.gates.find((g) => g.id === 'G-freshness')?.detail ?? '';

const coverageDetail = (score: ReturnType<typeof computeScore>): string =>
  score.gates.find((g) => g.id === 'G-coverage')?.detail ?? '';

describe('G-freshness never treats an unreadable timestamp as fresh', () => {
  /**
   * Healthy observations, except the location carries a `fetchedAt` nothing can
   * parse. Everything else about the run is unchanged, so the gate is the only
   * thing under test.
   */
  function withCorruptLocationTimestamp(fetchedAt: string, now: string = NOW): AuditInput {
    const location = input().observations.location;
    if (location.status !== 'ready') throw new Error('expected a ready location');
    return input({ location: ok(location.value, fetchedAt) }, now);
  }

  it.each([
    ['not a date at all', 'yesterday-ish'],
    ['an empty string', ''],
    ['a half-written ISO stamp', '2026-13-45T99:99:99.000Z'],
  ])('fails the gate when a contributing observation carries %s', (_name, stamp) => {
    const score = scoreOf(withCorruptLocationTimestamp(stamp));

    expect(score.failedGates).toContain('G-freshness');
    expect(score.score).toBeNull();
  });

  it('says the age is unknown rather than saying the reading is old', () => {
    const score = scoreOf(withCorruptLocationTimestamp('yesterday-ish'));

    const detail = freshnessDetail(score);
    expect(detail).toContain('could not tell how old');
    expect(detail).toContain('location');
    // Two different facts, two different sentences: we are not claiming the
    // reading is a week old, only that we cannot tell.
    expect(detail).not.toContain('over a week old');
  });

  it('still fails, and still says "over a week old", for a genuinely stale reading', () => {
    const score = scoreOf(input({}, '2026-09-30T00:00:00.000Z'));

    expect(score.failedGates).toContain('G-freshness');
    expect(freshnessDetail(score)).toContain('over a week old');
    expect(freshnessDetail(score)).not.toContain('could not tell how old');
  });

  it('passes, with the plain sentence, when every reading has a real date', () => {
    const score = scoreOf(input({}, NOW));

    expect(score.failedGates).not.toContain('G-freshness');
    expect(freshnessDetail(score)).toBe(
      'Everything the score rests on was read in the last week.',
    );
  });

  it('reports both problems at once rather than hiding one behind the other', () => {
    // Everything else is a month old; the location's timestamp is unreadable.
    const score = scoreOf(
      withCorruptLocationTimestamp('not-a-date', '2026-09-30T00:00:00.000Z'),
    );

    expect(freshnessDetail(score)).toContain('over a week old');
    expect(freshnessDetail(score)).toContain('could not tell how old');
  });
});

describe('overallCoverage is null, never 0, when nothing applies', () => {
  /** Every scored check in every area marked not_applicable. */
  const nothingApplies = (): ReturnType<typeof syntheticResults> => {
    const notApplicable: Partial<Record<AuditArea, number>> = {};
    for (const area of Object.keys(AREA_WEIGHT) as AuditArea[]) {
      notApplicable[area] = AREA_WEIGHT[area];
    }
    return syntheticResults({ notApplicable });
  };

  it('reports null coverage rather than a zero it did not measure', () => {
    const score = computeScore(nothingApplies(), syntheticInput());
    expect(score.totalApplicableWeight).toBe(0);
    expect(score.overallCoverage).toBeNull();
    expect(score.overallCoverage).not.toBe(0);
  });

  it('says nothing applies, instead of claiming we measured 0% of what does', () => {
    const score = computeScore(nothingApplies(), syntheticInput());
    expect(coverageDetail(score)).toBe(
      'Nothing we check applies to this business yet, so there is nothing to build a score from.',
    );
    expect(coverageDetail(score)).not.toContain('0%');
  });

  it('still refuses to emit a score', () => {
    const score = computeScore(nothingApplies(), syntheticInput());
    expect(score.failedGates).toContain('G-coverage');
    expect(score.score).toBeNull();
  });

  it('keeps the percentage sentence whenever there IS something to measure', () => {
    const score = computeScore(
      syntheticResults({ notChecked: { media: 9, posts: 7, description: 7, website: 4, nap: 4 } }),
      syntheticInput(),
    );
    expect(score.overallCoverage).toBeCloseTo(0.69, 5);
    expect(coverageDetail(score)).toBe(
      'We measured 69% of what applies to you; a score needs at least 70%.',
    );
  });

  it('a fully measured run is still 1, not null', () => {
    const score = computeScore(syntheticResults(), syntheticInput());
    expect(score.overallCoverage).toBe(1);
  });
});

describe('a scored area with nothing earned is still a measured zero', () => {
  it('separates "we measured everything and it all failed" from "nothing applied"', () => {
    const allFailed = computeScore(
      syntheticResults({ failed: { website: 4 } }),
      syntheticInput(),
    );
    const website = allFailed.areas.find((a) => a.area === 'website');
    expect(website?.areaScore).toBe(0);
    expect(website?.coverage).toBe(1);
    // Coverage overall is unaffected: we measured it, it just failed.
    expect(allFailed.overallCoverage).toBe(1);
  });

  it('keeps a partial credit partial, so coverage and score stay separate ideas', () => {
    const results = syntheticResults();
    const target = results.find((r) => r.check.scored && r.check.area === 'website');
    if (target === undefined) throw new Error('expected a website stub');
    target.outcome = outcomes.warn(0.5);
    const score = computeScore(results, syntheticInput());
    // Half a point earned, but the check RAN — so coverage is still complete.
    expect(score.totalEarnedWeight).toBe(99.5);
    expect(score.overallCoverage).toBe(1);
  });
});
