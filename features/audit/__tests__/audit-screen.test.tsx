import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import AuditScreen from '@/app/seo/audit';
import { ToastProvider } from '@/components/ui';
import { auditFixtureInput, auditUnconnectedInput } from '@/fixtures/audit';
import type { ConnectionInfo } from '@/lib/providers/types';
import type { DataState } from '@/lib/state/DataState';
import { ThemeProvider } from '@/theme';
import { control } from '@/theme/tokens';

import { AuditSummaryCard } from '../components';
import { runAuditEngine } from '../engine';

/**
 * THE AUDIT REPORT SCREEN — all four states, and the promises it must not break.
 *
 * The engine already has its own tests; these are about what an owner SEES.
 * Four things are asserted here that no engine test can catch, because they are
 * failures of rendering rather than of arithmetic:
 *
 *  1. No rank position is ever on screen. Google publishes none through any
 *     API, so any number that looks like one is fabricated by definition.
 *  2. A finding Shoogle cannot fix never gets a "Fix this for me" button. The
 *     write path does not exist; a button offering it is a lie with a tap
 *     target (CONTRIBUTING rule 7).
 *  3. Unchecked areas are on screen whenever there are any. This is the caveat
 *     that makes the score credible, and a caveat that can be dropped is not a
 *     caveat.
 *  4. The insufficient-data state still lists every finding the checks that DID
 *     run produced. §3.3: a missing score must never suppress a real problem.
 */

let mockFixtures = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    ...actual,
    isFixtureModeEnabled: () => mockFixtures,
    isDevPreviewEnabled: () => false,
  };
});

/**
 * Lets one test hold the connection read open so the LOADING state is reachable
 * deterministically. Null means "use the registry's real answer", which today
 * is an honest `unavailable('not_connected', …)` for every provider.
 */
let mockGetConnection: (() => Promise<DataState<ConnectionInfo>>) | null = null;
jest.mock('@/lib/providers', () => {
  const actual = jest.requireActual('@/lib/providers');
  return {
    ...actual,
    getProvider: (id: string) => {
      const provider = actual.getProvider(id);
      return {
        ...provider,
        getConnection: () =>
          mockGetConnection ? mockGetConnection() : provider.getConnection(),
      };
    },
  };
});

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const scoredRun = runAuditEngine(auditFixtureInput);
const unconnectedRun = runAuditEngine(auditUnconnectedInput);

function renderAuditScreen() {
  return renderRouter(
    {
      'seo/audit': () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>
            <AuditScreen />
          </ToastProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: '/seo/audit' },
  );
}

function renderPlain(ui: ReactNode) {
  return render(<ThemeProvider forceScheme="light">{ui}</ThemeProvider>);
}

/** Switches the development preview to the run with no score. */
async function showInsufficientRun() {
  await fireEvent.press(screen.getByTestId('fixture-view-insufficient'));
}

/**
 * Nothing on screen may read as a search rank.
 *
 * Two shapes are banned: a "#4"-style position, and the word rank followed by a
 * number in the same sentence. The copy is allowed to SAY that ranks do not
 * exist — that sentence carries no digits, which is exactly the difference.
 */
function expectNoRankRendered() {
  expect(screen.queryAllByText(/#\s?\d/)).toHaveLength(0);
  expect(screen.queryAllByText(/\brank\w*\b[^.]*\d/i)).toHaveLength(0);
  expect(screen.queryAllByText(/\bposition\b[^.]*\d/i)).toHaveLength(0);
}

/* -------------------------------------------------------------------------- */
/* State 3 — not connected                                                    */
/* -------------------------------------------------------------------------- */

describe('audit screen — NOT CONNECTED', () => {
  beforeEach(() => {
    mockFixtures = false;
    mockGetConnection = null;
  });

  it('says nothing was measured, and shows no score, no findings and no zero', async () => {
    await renderAuditScreen();

    await waitFor(() => expect(screen.getByTestId('audit-not-run')).toBeOnTheScreen());

    expect(screen.getByText('Nothing measured yet')).toBeOnTheScreen();
    // A business nobody has audited has no score. Not zero, not an empty dial.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).toBeNull();

    // None of the other three states leaks in.
    expect(screen.queryByTestId('audit-score-hero')).toBeNull();
    expect(screen.queryByTestId('audit-insufficient')).toBeNull();
    expect(screen.queryByTestId('audit-loading')).toBeNull();
    expect(screen.queryByTestId('findings-list')).toBeNull();

    // Real state, so no fixture banner and no fixture switch.
    expect(screen.queryByTestId('fixture-banner')).toBeNull();
    expect(screen.queryByTestId('fixture-view-switch')).toBeNull();

    expectNoRankRendered();
  });

  it('has no dead control: the connect action says it is not built yet', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-not-run')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Connect Google Business Profile'));

    await waitFor(() =>
      expect(screen.getByText(/Connecting Google Business Profile is not built yet/)).toBeOnTheScreen(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* State 4 — loading                                                          */
/* -------------------------------------------------------------------------- */

describe('audit screen — LOADING', () => {
  beforeEach(() => {
    mockFixtures = false;
    // Never resolves, so the screen stays in the state it is actually in.
    mockGetConnection = () => new Promise<DataState<ConnectionInfo>>(() => {});
  });

  afterEach(() => {
    mockGetConnection = null;
  });

  it('shows skeletons and never a placeholder number', async () => {
    await renderAuditScreen();

    expect(screen.getByTestId('audit-loading')).toBeOnTheScreen();
    expect(screen.queryByTestId('audit-not-run')).toBeNull();
    expect(screen.queryByTestId('audit-score-hero')).toBeNull();
    expect(screen.queryByTestId('audit-insufficient')).toBeNull();

    // A skeleton means "we are fetching". It must never resolve into a zero.
    expect(screen.queryByText('0')).toBeNull();
    expectNoRankRendered();
  });
});

/* -------------------------------------------------------------------------- */
/* State 1 — scored                                                           */
/* -------------------------------------------------------------------------- */

describe('audit screen — SCORED', () => {
  beforeEach(() => {
    mockFixtures = true;
    mockGetConnection = null;
  });

  afterEach(() => {
    mockFixtures = false;
  });

  it('renders the score the engine produced, under a fixture banner', async () => {
    await renderAuditScreen();

    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());

    const score = scoredRun.report.status === 'ready' ? scoredRun.report.value.score : null;
    expect(score).not.toBeNull();
    expect(screen.getByText(String(score))).toBeOnTheScreen();

    // Fixture data is never allowed to look like the owner's own data.
    expect(screen.getByTestId('fixture-banner')).toBeOnTheScreen();

    expect(screen.queryByTestId('audit-insufficient')).toBeNull();
    expectNoRankRendered();
  });

  it('shows the top three findings in the engine order, with the rest behind a fold', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());

    const [first, second, third, ...rest] = scoredRun.findings;
    expect(first).toBeDefined();
    expect(rest.length).toBeGreaterThan(0);

    for (const finding of [first, second, third]) {
      expect(screen.getByTestId(`finding-${finding?.checkId}`)).toBeOnTheScreen();
    }
    for (const finding of rest) {
      expect(screen.queryByTestId(`finding-${finding.checkId}`)).toBeNull();
    }

    await fireEvent.press(screen.getByTestId('findings-fold'));

    for (const finding of rest) {
      expect(screen.getByTestId(`finding-${finding.checkId}`)).toBeOnTheScreen();
    }
  });

  it('shows the evidence each finding rests on, not just the verdict', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());

    const top = scoredRun.findings[0];
    expect(top).toBeDefined();
    if (!top) return;

    expect(screen.getByText(top.title)).toBeOnTheScreen();
    expect(screen.getByText(top.detail)).toBeOnTheScreen();
    expect(screen.getByText(top.observation)).toBeOnTheScreen();
    for (const line of top.evidence) {
      // `getAllBy`: two findings can legitimately rest on the same reading
      // ("Total reviews: 12"), and both must show it rather than one hiding it.
      expect(screen.getAllByText(line).length).toBeGreaterThan(0);
    }
  });

  it('offers "Fix this for me" only where Shoogle can genuinely write', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('findings-fold'));

    for (const finding of scoredRun.findings) {
      if (finding.fixableByShoogle) {
        expect(screen.getByTestId(`finding-fix-${finding.checkId}`)).toBeOnTheScreen();
      } else {
        // A guided finding NEVER gets a fix button — there is no write path
        // behind it, and offering one would be a promise with nothing behind it.
        expect(screen.queryByTestId(`finding-fix-${finding.checkId}`)).toBeNull();
        expect(screen.getByTestId(`finding-guide-${finding.checkId}`)).toBeOnTheScreen();
      }
    }

    // Today that is exactly the four checks the capability matrix allows.
    const fixable = scoredRun.findings.filter((f) => f.fixableByShoogle).map((f) => f.checkId);
    for (const id of fixable) {
      expect(['D1', 'D2', 'F3', 'F4']).toContain(id);
    }
    expect(fixable.length).toBeGreaterThan(0);
  });

  it('admits the fix is not built rather than pretending it worked', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());

    const fixable = scoredRun.findings.find((f) => f.fixableByShoogle);
    expect(fixable).toBeDefined();
    if (!fixable) return;

    await fireEvent.press(screen.getByTestId(`finding-fix-${fixable.checkId}`));

    await waitFor(() =>
      expect(screen.getByText(/is not built yet\. No change has been sent to Google\./)).toBeOnTheScreen(),
    );
  });

  it('expands real guidance for a guided finding', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());

    const guided = scoredRun.findings.find((f) => !f.fixableByShoogle);
    expect(guided).toBeDefined();
    if (!guided) return;

    expect(screen.queryByTestId(`finding-guidance-${guided.checkId}`)).toBeNull();
    await fireEvent.press(screen.getByTestId(`finding-guide-${guided.checkId}`));

    expect(screen.getByTestId(`finding-guidance-${guided.checkId}`)).toBeOnTheScreen();
    expect(screen.getByText(guided.failureCheck)).toBeOnTheScreen();
  });

  it('keeps the unchecked areas on screen even though a score was produced', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());

    expect(scoredRun.uncheckedAreas.length).toBeGreaterThan(0);
    expect(screen.getByTestId('unchecked-areas')).toBeOnTheScreen();
    for (const line of scoredRun.uncheckedAreas) {
      expect(screen.getByText(line)).toBeOnTheScreen();
    }
  });

  it('names every area it could measure, without turning "does not apply" into 0%', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());

    expect(screen.getByTestId('coverage-by-area')).toBeOnTheScreen();
    for (const area of scoredRun.score.areas) {
      // An area name also appears on the findings that belong to it, so this
      // asserts presence rather than uniqueness.
      expect(screen.getAllByText(area.label).length).toBeGreaterThan(0);
    }
    expect(screen.queryAllByText('0%')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* State 2 — insufficient data                                                */
/* -------------------------------------------------------------------------- */

describe('audit screen — INSUFFICIENT DATA', () => {
  beforeEach(() => {
    mockFixtures = true;
    mockGetConnection = null;
  });

  afterEach(() => {
    mockFixtures = false;
  });

  it('explains the missing score instead of erroring or emptying out', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());
    await showInsufficientRun();

    expect(screen.getByTestId('audit-insufficient')).toBeOnTheScreen();
    expect(screen.queryByTestId('audit-score-hero')).toBeNull();

    // The engine's own sentence, verbatim.
    expect(unconnectedRun.report.status).toBe('unavailable');
    if (unconnectedRun.report.status === 'unavailable') {
      expect(screen.getByText(unconnectedRun.report.message)).toBeOnTheScreen();
    }

    // Every gate is named, passed ones included, so the owner can see WHICH
    // test the result failed rather than being told "not enough data".
    for (const gate of unconnectedRun.score.gates) {
      expect(screen.getByText(gate.detail)).toBeOnTheScreen();
    }

    // No number, and no zero standing in for one.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).toBeNull();
    expectNoRankRendered();
  });

  it('still lists every finding the checks that DID run produced', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());
    await showInsufficientRun();

    expect(unconnectedRun.findings.length).toBeGreaterThan(0);
    for (const finding of unconnectedRun.findings.slice(0, 3)) {
      expect(screen.getByTestId(`finding-${finding.checkId}`)).toBeOnTheScreen();
      expect(screen.getByText(finding.title)).toBeOnTheScreen();
    }

    // The connect finding is pinned first by §5.3.1 and the screen does not
    // re-sort, so it must be the first card rendered.
    expect(unconnectedRun.findings[0]?.checkId).toBe('A1');

    // It is not fixable by Shoogle, so it gets guidance and not a button.
    expect(screen.queryByTestId('finding-fix-A1')).toBeNull();
    expect(screen.getByTestId('finding-guide-A1')).toBeOnTheScreen();
  });

  it('shows every unchecked area, because that is what a missing score is made of', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());
    await showInsufficientRun();

    expect(unconnectedRun.uncheckedAreas.length).toBeGreaterThan(0);
    expect(screen.getByTestId('unchecked-areas')).toBeOnTheScreen();
    for (const line of unconnectedRun.uncheckedAreas) {
      expect(screen.getByText(line)).toBeOnTheScreen();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Android QA                                                                 */
/* -------------------------------------------------------------------------- */

interface TreeNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (TreeNode | string)[] | null;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return typeof style === 'object' ? (style as Record<string, unknown>) : {};
}

function walk(node: TreeNode | string | null, visit: (n: TreeNode) => void): void {
  if (!node || typeof node === 'string') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

/** Declared widths wider than the viewport, unlabelled controls, small targets. */
function inspect(tree: TreeNode | string | null, viewportWidth: number) {
  const overflow: number[] = [];
  const unlabelled: string[] = [];
  const smallTargets: { height: number; label: string }[] = [];
  let controls = 0;

  walk(tree, (node) => {
    const props = node.props ?? {};
    const style = flattenStyle(props.style);

    if (typeof style.width === 'number' && style.width > viewportWidth) {
      overflow.push(style.width);
    }

    const role = props.accessibilityRole;
    if (role !== 'button' && role !== 'tab' && role !== 'switch') return;
    controls += 1;

    const label = typeof props.accessibilityLabel === 'string' ? props.accessibilityLabel : '';
    if (label.trim().length === 0) unlabelled.push(String(role));

    const declared =
      typeof style.minHeight === 'number'
        ? style.minHeight
        : typeof style.height === 'number'
          ? style.height
          : null;
    const slop = typeof props.hitSlop === 'number' ? props.hitSlop * 2 : 0;
    if (declared !== null && declared + slop < control.minTouchTarget) {
      smallTargets.push({ height: declared, label });
    }
  });

  return { overflow, unlabelled, smallTargets, controls };
}

describe.each([
  { name: '390x844', width: 390 },
  { name: '412x915', width: 412 },
])('audit screen on Android at $name', ({ width }) => {
  beforeEach(() => {
    mockFixtures = true;
    mockGetConnection = null;
  });

  afterEach(() => {
    mockFixtures = false;
  });

  it('declares no over-wide element, no unlabelled control and no small target', async () => {
    await renderAuditScreen();
    await waitFor(() => expect(screen.getByTestId('audit-score-hero')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('findings-fold'));

    const report = inspect(screen.toJSON() as TreeNode, width);

    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);
    // Guards against the whole check passing because nothing was found.
    expect(report.controls).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The compact card the Business tab embeds                                   */
/* -------------------------------------------------------------------------- */

describe('AuditSummaryCard', () => {
  it('says "not measured yet" when no audit has run, and never shows a zero', async () => {
    const onPress = jest.fn();
    await renderPlain(<AuditSummaryCard run={null} onPress={onPress} />);

    expect(screen.getByText('Profile health')).toBeOnTheScreen();
    // The dial says it, once: not measured, not zero.
    expect(screen.getByText('Not measured yet')).toBeOnTheScreen();
    expect(screen.getByText('—')).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows the score and the top finding, and opens the report', async () => {
    const onPress = jest.fn();
    await renderPlain(<AuditSummaryCard run={scoredRun} onPress={onPress} />);

    const score = scoredRun.report.status === 'ready' ? scoredRun.report.value.score : null;
    expect(screen.getByText(String(score))).toBeOnTheScreen();
    expect(screen.getByText(scoredRun.findings[0]?.title ?? '')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('audit-summary'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carries the unchecked caveat and the top finding when there is no score', async () => {
    await renderPlain(<AuditSummaryCard run={unconnectedRun} onPress={jest.fn()} />);

    expect(screen.getByText('Not enough measured to score yet')).toBeOnTheScreen();
    expect(screen.getByText('—')).toBeOnTheScreen();
    // A missing score never suppresses the problem it failed to score.
    expect(screen.getByText(unconnectedRun.findings[0]?.title ?? '')).toBeOnTheScreen();
    expect(
      screen.getByText(`${unconnectedRun.uncheckedCount} checks could not be run`),
    ).toBeOnTheScreen();
  });

  it('renders a skeleton while loading rather than an empty card', async () => {
    await renderPlain(<AuditSummaryCard run={null} loading onPress={jest.fn()} />);
    expect(screen.getByTestId('audit-summary')).toBeOnTheScreen();
    expect(screen.queryByText('Not measured yet')).toBeNull();
  });
});
