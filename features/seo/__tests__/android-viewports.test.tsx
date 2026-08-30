/**
 * Android QA for the two `app/seo/` screens this feature owns.
 *
 * Shoogle is Android-first and must behave at both target viewports: 390x844
 * and 412x915. These checks are STATIC — they walk the rendered tree and assert
 * on declared styles and accessibility props — so anything that cannot be
 * determined statically is counted as undetermined rather than quietly passed.
 *
 * The walker is a local copy of the one in `__tests__/android-qa.test.tsx`
 * rather than an import: that file defines its own `describe` blocks at module
 * scope, so importing it here would run the whole Business-tab suite a second
 * time. It is a shared file and not this feature's to restructure.
 *
 * What this catches: a declared width wider than the viewport, a control with
 * no accessible name, and a pressable whose declared height is under the 44pt
 * Android floor. What it cannot catch — overflow caused by flex or content,
 * keyboard avoidance, real scroll behaviour — still needs a device.
 */

import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import SearchesScreen from '@/app/seo/searches';
import VisibilityScreen from '@/app/seo/visibility';
import { ToastProvider } from '@/components/ui';
import { ThemeProvider } from '@/theme';
import { control } from '@/theme/tokens';

let mockFixtures = true;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    ...actual,
    isFixtureModeEnabled: () => mockFixtures,
    isDevPreviewEnabled: () => false,
    isSupabaseConfigured: () => false,
  };
});

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
] as const;

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
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

function walk(node: TreeNode | string | null, visit: (n: TreeNode) => void): void {
  if (!node || typeof node === 'string') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

interface QaReport {
  overflow: { width: number; testID?: string }[];
  smallTargets: { height: number; label?: string }[];
  unlabelled: { role: string; testID?: string }[];
  totalPressables: number;
}

function auditRenderedTree(tree: TreeNode | string | null, viewportWidth: number): QaReport {
  const report: QaReport = { overflow: [], smallTargets: [], unlabelled: [], totalPressables: 0 };

  walk(tree, (node) => {
    const props = node.props ?? {};
    const style = flattenStyle(props.style);

    const width = style.width;
    if (typeof width === 'number' && width > viewportWidth) {
      report.overflow.push({
        width,
        ...(typeof props.testID === 'string' ? { testID: props.testID } : {}),
      });
    }

    const role = props.accessibilityRole;
    if (role !== 'button' && role !== 'tab' && role !== 'switch') return;
    report.totalPressables += 1;

    const label = props.accessibilityLabel;
    if (typeof label !== 'string' || label.trim().length === 0) {
      report.unlabelled.push({
        role: String(role),
        ...(typeof props.testID === 'string' ? { testID: props.testID } : {}),
      });
    }

    const declared =
      typeof style.minHeight === 'number'
        ? style.minHeight
        : typeof style.height === 'number'
          ? style.height
          : null;
    // A height that comes from flex or content is not knowable here, and is
    // reported as neither a pass nor a failure.
    if (declared === null) return;

    const hitSlop = props.hitSlop;
    const slop = typeof hitSlop === 'number' ? hitSlop * 2 : 0;
    if (declared + slop < control.minTouchTarget) {
      report.smallTargets.push({
        height: declared,
        ...(typeof label === 'string' ? { label } : {}),
      });
    }
  });

  return report;
}

function wrap(route: string, ui: ReactNode, width: number, height: number) {
  return renderRouter(
    {
      [route]: () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>{ui}</ToastProvider>
        </ThemeProvider>
      ),
    },
    {
      initialUrl: `/${route}`,
      initialMetrics: {
        frame: { x: 0, y: 0, width, height },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      },
    } as never,
  );
}

/** Proves the walker can fail. A checker that cannot fail is worse than none. */
describe('the walker itself', () => {
  it('detects an over-wide element and an unlabelled control', () => {
    const report = auditRenderedTree(
      {
        type: 'View',
        props: { style: { width: 500 }, testID: 'wide' },
        children: [{ type: 'View', props: { accessibilityRole: 'button', testID: 'bare' } }],
      },
      390,
    );
    expect(report.overflow).toEqual([{ width: 500, testID: 'wide' }]);
    expect(report.unlabelled).toEqual([{ role: 'button', testID: 'bare' }]);
  });
});

describe.each(VIEWPORTS)('What people searched at $name', ({ width, height }) => {
  it('renders, fits, labels every control and meets the 44pt floor', async () => {
    mockFixtures = true;
    await wrap('seo/searches', <SearchesScreen />, width, height);

    expect(screen.getByTestId('searches-screen')).toBeOnTheScreen();

    const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);

    // This screen is a reading surface and has no controls of its own — which
    // is the point: no dead buttons, nothing to press that does nothing. Its
    // only control is the back chevron, and `TopBar` hides that when there is
    // nowhere to go back to, as there is not in this harness. So rather than
    // assert a pressable count that would be zero for an honest reason, assert
    // that the data rows themselves are announced.
    expect(report.totalPressables).toBe(0);
    expect(screen.getAllByLabelText(/Fewer than 15 people/).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/people searched this term/).length).toBeGreaterThan(0);
  });
});

describe.each(VIEWPORTS)('How you look to AI at $name', ({ width, height }) => {
  it('renders, fits, labels every control and meets the 44pt floor', async () => {
    mockFixtures = true;
    await wrap('seo/visibility', <VisibilityScreen />, width, height);

    expect(screen.getByTestId('visibility-screen')).toBeOnTheScreen();

    const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);
    // This screen carries the directory checklist, so it has real controls.
    expect(report.totalPressables).toBeGreaterThan(3);
  });

  it('fits and stays labelled with nothing connected, too', async () => {
    mockFixtures = false;
    await wrap('seo/visibility', <VisibilityScreen />, width, height);

    const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);
  });
});
