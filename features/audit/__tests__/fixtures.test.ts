/**
 * The audit fixtures follow the same three rules as every other fixture in the
 * repo: gated behind `isFixtureModeEnabled()`, visibly marked, and carrying
 * `isFixture: true` on anything wrapped in a `DataState`.
 *
 * `lib/env` reads the public env once at module load, so each case resets the
 * module registry rather than mutating a live value.
 */

import type { AuditFixtures } from '@/fixtures/audit';

function loadFixtures(enabled: boolean): AuditFixtures | null {
  if (enabled) {
    process.env.EXPO_PUBLIC_ENABLE_FIXTURES = '1';
  } else {
    delete process.env.EXPO_PUBLIC_ENABLE_FIXTURES;
  }
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/fixtures/audit') as typeof import('@/fixtures/audit');
  return mod.getAuditFixtures();
}

describe('audit fixtures', () => {
  const original = process.env.EXPO_PUBLIC_ENABLE_FIXTURES;

  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_ENABLE_FIXTURES;
    else process.env.EXPO_PUBLIC_ENABLE_FIXTURES = original;
    jest.resetModules();
  });

  it('are unreachable unless fixture mode is explicitly on', () => {
    expect(loadFixtures(false)).toBeNull();
  });

  it('produce a scored run when fixture mode is on', () => {
    const fixtures = loadFixtures(true);
    expect(fixtures).not.toBeNull();
    if (fixtures === null) return;

    expect(fixtures.scored.report.status).toBe('ready');
    if (fixtures.scored.report.status !== 'ready') return;
    expect(fixtures.scored.report.value.score).toBeGreaterThan(0);
    expect(fixtures.scored.report.value.score).toBeLessThan(100);
    // The flag travels with the value rather than depending on someone
    // remembering to set it at the call site.
    expect(fixtures.scored.report.isFixture).toBe(true);
  });

  it('carry the [FIXTURE] marker on anything that could reach a screen', () => {
    const fixtures = loadFixtures(true);
    if (fixtures === null) throw new Error('expected fixtures');

    const findings = fixtures.scored.findings;
    expect(findings.length).toBeGreaterThan(0);
    // At least one finding must quote fixture content, so a screenshot of the
    // fixture state is immediately identifiable as fake.
    const allText = findings.map((f) => `${f.title} ${f.detail} ${f.evidence.join(' ')}`).join(' ');
    expect(allText).toContain('[FIXTURE]');
  });

  it('include the honest unconnected state beside the scored one', () => {
    const fixtures = loadFixtures(true);
    if (fixtures === null) throw new Error('expected fixtures');

    expect(fixtures.unconnected.report.status).toBe('unavailable');
    if (fixtures.unconnected.report.status !== 'unavailable') return;
    expect(fixtures.unconnected.report.reason).toBe('insufficient_data');
    expect(fixtures.unconnected.findings.map((f) => f.checkId)).toContain('A1');
    expect(fixtures.unconnected.uncheckedAreas.length).toBeGreaterThan(0);
  });

  it('leaves at least one area unchecked even in the happy fixture, so the caveat renders', () => {
    const fixtures = loadFixtures(true);
    if (fixtures === null) throw new Error('expected fixtures');
    expect(fixtures.scored.uncheckedAreas.length).toBeGreaterThan(0);
    expect(fixtures.scored.uncheckedCount).toBeGreaterThan(0);
  });
});
