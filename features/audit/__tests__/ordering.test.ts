/**
 * Ordering (§5). The owner acts on two or three things, so the order IS the
 * feature — a correct finding in position seven is a finding nobody fixes.
 */

import { runAuditEngine } from '../engine';
import {
  TOP_FINDINGS_COUNT,
  computePriority,
  notifiableFindings,
  orderFindings,
  resolveFixMode,
  splitForDisplay,
} from '../ordering';
import { input, ok, locationDetail } from '../test-support/build';
import type { CheckDefinition, CheckId, Confidence, FixMode, Severity, ShoogleFinding } from '../types';

function finding(
  checkId: CheckId,
  severity: Severity,
  confidence: Confidence,
  fixMode: FixMode,
): ShoogleFinding {
  return {
    id: checkId,
    title: `${checkId} title`,
    detail: 'detail',
    severity,
    fixHref: null,
    checkId,
    area: 'nap',
    observation: 'observation',
    evidence: ['evidence'],
    observedAt: '2026-08-29T00:00:00.000Z',
    source: 'gbp.info',
    fixMode,
    failureCheck: 'failureCheck',
    leadingIndicator: 'leadingIndicator',
    confidence,
    fixableByShoogle: fixMode === 'auto' || fixMode === 'assisted',
    priority: computePriority({ severity, confidence, fixMode }),
  };
}

describe('the priority formula', () => {
  it('is severityWeight x confidenceFactor x fixability / effort', () => {
    // critical(100) x observed(1.0) x assisted(1.2) / 2 minutes
    expect(computePriority({ severity: 'critical', confidence: 'observed', fixMode: 'assisted' })).toBe(60);
    // important(40) x inferred(0.6) x guided(1.0) / 5 minutes
    expect(computePriority({ severity: 'important', confidence: 'inferred', fixMode: 'guided' })).toBe(4.8);
    // minor(10) x observed(1.0) x owner(0.8) / 15 minutes
    expect(computePriority({ severity: 'minor', confidence: 'observed', fixMode: 'owner' })).toBe(0.53);
  });

  it('rewards a fix Shoogle can do over one that costs the owner an afternoon', () => {
    const oneTap = computePriority({ severity: 'important', confidence: 'observed', fixMode: 'assisted' });
    const ownerErrand = computePriority({ severity: 'important', confidence: 'observed', fixMode: 'owner' });
    expect(oneTap).toBeGreaterThan(ownerErrand);
  });
});

describe('fix mode degrades to what Shoogle can honestly offer', () => {
  const check = (intended: FixMode): CheckDefinition =>
    ({ intendedFixMode: intended }) as CheckDefinition;

  it('keeps the intended mode when the write path exists', () => {
    expect(resolveFixMode(check('assisted'), true)).toBe('assisted');
    expect(resolveFixMode(check('auto'), true)).toBe('auto');
  });

  it('falls back to guided when it does not — no dead controls', () => {
    expect(resolveFixMode(check('assisted'), false)).toBe('guided');
    expect(resolveFixMode(check('auto'), false)).toBe('guided');
  });

  it('never pretends an owner-only fact can be automated', () => {
    expect(resolveFixMode(check('owner'), true)).toBe('owner');
  });
});

describe('ordering rules', () => {
  it('puts critical before important before minor', () => {
    const ordered = orderFindings([
      finding('H2', 'minor', 'observed', 'assisted'),
      finding('B5', 'important', 'observed', 'assisted'),
      finding('F4', 'critical', 'observed', 'assisted'),
    ]);
    expect(ordered.map((f) => f.checkId)).toEqual(['F4', 'B5', 'H2']);
  });

  it('does not let a cheap important fix outrank a costly critical one', () => {
    // The formula alone would rank the one-tap important fix higher; §5.1 says a
    // customer being lost today comes first regardless.
    const cheapImportant = finding('B5', 'important', 'observed', 'auto');
    const costlyCritical = finding('A2', 'critical', 'observed', 'owner');
    expect(cheapImportant.priority).toBeGreaterThan(costlyCritical.priority);
    expect(orderFindings([cheapImportant, costlyCritical]).map((f) => f.checkId)).toEqual([
      'A2',
      'B5',
    ]);
  });

  it('§5.3.4 — observed beats inferred at equal severity, whatever the formula says', () => {
    const inferredEasy = finding('C3', 'important', 'inferred', 'auto');
    const observedHard = finding('B4', 'important', 'observed', 'owner');
    expect(inferredEasy.priority).toBeGreaterThan(observedHard.priority);
    expect(orderFindings([inferredEasy, observedHard]).map((f) => f.checkId)).toEqual(['B4', 'C3']);
  });

  it('§5.3.2 — an unverified listing outranks everything, because it blocks the rest', () => {
    const ordered = orderFindings([
      finding('F4', 'critical', 'observed', 'assisted'),
      finding('A2', 'critical', 'observed', 'guided'),
      finding('B2', 'critical', 'observed', 'assisted'),
    ]);
    expect(ordered[0]?.checkId).toBe('A2');
  });

  it('§5.3.1 — the connect finding sorts first of all', () => {
    const ordered = orderFindings([
      finding('I1', 'important', 'observed', 'guided'),
      finding('A1', 'critical', 'observed', 'owner'),
    ]);
    expect(ordered[0]?.checkId).toBe('A1');
  });

  it('§5.3.3 — at most one category-change proposal survives a run', () => {
    const first = finding('C2', 'important', 'inferred', 'assisted');
    const second = { ...finding('C2', 'important', 'inferred', 'guided'), priority: 1 };
    const ordered = orderFindings([first, second]);
    expect(ordered.filter((f) => f.checkId === 'C2')).toHaveLength(1);
    expect(ordered.find((f) => f.checkId === 'C2')).toBe(first);
  });

  it('is a total order: the result does not depend on input order', () => {
    const findings = [
      finding('F4', 'critical', 'observed', 'assisted'),
      finding('A2', 'critical', 'observed', 'guided'),
      finding('C3', 'important', 'inferred', 'assisted'),
      finding('B4', 'important', 'observed', 'owner'),
      finding('H2', 'minor', 'inferred', 'assisted'),
      finding('E3', 'minor', 'observed', 'guided'),
    ];
    const forward = orderFindings(findings).map((f) => f.checkId);
    const backward = orderFindings([...findings].reverse()).map((f) => f.checkId);
    expect(backward).toEqual(forward);
  });
});

describe('what reaches the owner', () => {
  it('shows three and folds the rest', () => {
    const findings = Array.from({ length: 7 }, (_, i) =>
      finding(['A2', 'B2', 'B4', 'C1', 'D1', 'E1', 'F4'][i] as CheckId, 'important', 'observed', 'guided'),
    );
    const { top, remaining } = splitForDisplay(orderFindings(findings));
    expect(top).toHaveLength(TOP_FINDINGS_COUNT);
    expect(remaining).toHaveLength(4);
  });

  it('notifies about criticals only, at most one', () => {
    const notifiable = notifiableFindings(
      orderFindings([
        finding('F4', 'critical', 'observed', 'assisted'),
        finding('B2', 'critical', 'observed', 'assisted'),
        finding('H2', 'minor', 'observed', 'assisted'),
      ]),
    );
    expect(notifiable).toHaveLength(1);
    expect(notifiable[0]?.severity).toBe('critical');
  });
});

describe('ordering on a real run', () => {
  it('puts the unanswered one-star review above the missing prices', () => {
    const run = runAuditEngine(
      input({
        reviews: ok({
          items: [
            {
              reviewId: 'reviews/1',
              authorDisplayName: 'A',
              starRating: 1,
              comment: 'Bad haircut.',
              createTime: '2026-08-20T00:00:00.000Z',
              reply: null,
            },
            {
              reviewId: 'reviews/2',
              authorDisplayName: 'B',
              starRating: 5,
              comment: 'Great.',
              createTime: '2026-08-22T00:00:00.000Z',
              reply: { comment: 'Thanks', updateTime: '2026-08-22T00:00:00.000Z' },
            },
          ],
          replyFieldTrusted: true,
        }),
        location: ok(
          locationDetail({
            serviceItems: [
              { name: 'Haircut', priceInPaise: null },
              { name: 'Hair spa', priceInPaise: null },
            ],
          }),
        ),
      }),
    );

    const ids = run.findings.map((f) => f.checkId);
    expect(ids).toContain('F4');
    expect(ids).toContain('C5');
    expect(ids.indexOf('F4')).toBeLessThan(ids.indexOf('C5'));
    expect(run.findings[0]?.checkId).toBe('F4');
  });
});
