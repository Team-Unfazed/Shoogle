import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import BusinessScreen from '@/app/(tabs)/business';
import { ToastProvider } from '@/components/ui';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { ThemeProvider } from '@/theme';
import { control } from '@/theme/tokens';

/**
 * ANDROID QA HARNESS — sprint day 6.
 *
 * Shoogle is Android-first and must behave at both target viewports. These
 * checks are STATIC: they walk the rendered tree and assert on declared styles
 * and accessibility props. A static pass cannot measure flex layout, so
 * anything it cannot determine is reported as undetermined rather than quietly
 * counted as a pass — an assertion that cannot fail is worse than no assertion.
 *
 * What this catches:
 *  - a fixed width wider than the viewport (horizontal overflow)
 *  - a pressable whose declared height is below the 44pt Android floor
 *  - a control with no accessible name
 *
 * What it cannot catch, and needs a device or emulator:
 *  - overflow caused by flex/content rather than a declared width
 *  - keyboard avoidance, scroll momentum, back-gesture behaviour
 *  - anything about real network conditions
 */

export const ANDROID_VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
] as const;

function metricsFor(width: number, height: number) {
  return {
    frame: { x: 0, y: 0, width, height },
    insets: { top: 24, left: 0, right: 0, bottom: 24 },
  };
}

/** Collapses a possibly-nested RN style prop into one object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...flattenStyle(s) }),
      {},
    );
  }
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
}

interface TreeNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (TreeNode | string)[] | null;
}

function walk(node: TreeNode | string | null, visit: (n: TreeNode) => void): void {
  if (!node || typeof node === 'string') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

export interface QaReport {
  /** Declared widths wider than the viewport. */
  overflow: { width: number; testID?: string }[];
  /** Pressables whose declared height is under the 44pt floor. */
  smallTargets: { height: number; label?: string; testID?: string }[];
  /** Controls with no accessible name. */
  unlabelled: { role: string; testID?: string }[];
  /** Pressables whose height is layout-driven and cannot be checked statically. */
  undeterminedTargets: number;
  totalPressables: number;
}

export function auditRenderedTree(tree: TreeNode | string | null, viewportWidth: number): QaReport {
  const report: QaReport = {
    overflow: [],
    smallTargets: [],
    unlabelled: [],
    undeterminedTargets: 0,
    totalPressables: 0,
  };

  walk(tree, (node) => {
    const props = node.props ?? {};
    const style = flattenStyle(props.style);

    // --- horizontal overflow -------------------------------------------------
    const width = style.width;
    if (typeof width === 'number' && width > viewportWidth) {
      report.overflow.push({
        width,
        ...(typeof props.testID === 'string' ? { testID: props.testID } : {}),
      });
    }

    // --- touch targets and labels -------------------------------------------
    const role = props.accessibilityRole;
    const isControl = role === 'button' || role === 'tab' || role === 'switch';
    if (!isControl) return;

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

    if (declared === null) {
      // Height comes from flex or content. Not a failure — just not knowable here.
      report.undeterminedTargets += 1;
      return;
    }

    // hitSlop legitimately extends a small glyph to a compliant target.
    const hitSlop = props.hitSlop;
    const slop = typeof hitSlop === 'number' ? hitSlop * 2 : 0;
    if (declared + slop < control.minTouchTarget) {
      report.smallTargets.push({
        height: declared,
        ...(typeof label === 'string' ? { label } : {}),
        ...(typeof props.testID === 'string' ? { testID: props.testID } : {}),
      });
    }
  });

  return report;
}

function wrap(ui: ReactNode, width: number, height: number) {
  return renderRouter(
    {
      business: () => (
        <ThemeProvider forceScheme="light">
          <SessionProvider>
            <ToastProvider>{ui}</ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: '/business', initialMetrics: metricsFor(width, height) } as never,
  );
}

describe('Android QA — Business tab', () => {
  describe.each(ANDROID_VIEWPORTS)('at $name', ({ width, height }) => {
    it('renders without crashing', async () => {
      await wrap(<BusinessScreen />, width, height);
      expect(screen.getByText('Business')).toBeOnTheScreen();
    });

    it('declares no element wider than the viewport', async () => {
      await wrap(<BusinessScreen />, width, height);
      const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
      expect(report.overflow).toEqual([]);
    });

    it('gives every control an accessible name', async () => {
      await wrap(<BusinessScreen />, width, height);
      const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
      expect(report.unlabelled).toEqual([]);
    });

    it('keeps every measurable touch target at or above the 44pt floor', async () => {
      await wrap(<BusinessScreen />, width, height);
      const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
      expect(report.smallTargets).toEqual([]);
    });

    it('actually inspected some controls', async () => {
      // Guards against the whole suite passing because the walker found nothing.
      await wrap(<BusinessScreen />, width, height);
      const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
      expect(report.totalPressables).toBeGreaterThan(0);
    });
  });
});

describe('the QA harness itself', () => {
  // A checker that cannot fail is worse than no checker, so prove it fails.
  it('detects an over-wide element', () => {
    const tree: TreeNode = { type: 'View', props: { style: { width: 500 }, testID: 'wide' } };
    const report = auditRenderedTree(tree, 390);
    expect(report.overflow).toEqual([{ width: 500, testID: 'wide' }]);
  });

  it('detects a short touch target', () => {
    const tree: TreeNode = {
      type: 'View',
      props: { accessibilityRole: 'button', accessibilityLabel: 'Tiny', style: { height: 20 } },
    };
    expect(auditRenderedTree(tree, 390).smallTargets).toEqual([{ height: 20, label: 'Tiny' }]);
  });

  it('accepts a short target that hitSlop brings up to the floor', () => {
    const tree: TreeNode = {
      type: 'View',
      props: {
        accessibilityRole: 'button',
        accessibilityLabel: 'Small but padded',
        style: { height: 28 },
        hitSlop: 10,
      },
    };
    expect(auditRenderedTree(tree, 390).smallTargets).toEqual([]);
  });

  it('detects an unlabelled control', () => {
    const tree: TreeNode = { type: 'View', props: { accessibilityRole: 'button' } };
    expect(auditRenderedTree(tree, 390).unlabelled).toEqual([{ role: 'button' }]);
  });

  it('reports layout-driven heights as undetermined rather than passing them', () => {
    const tree: TreeNode = {
      type: 'View',
      props: { accessibilityRole: 'button', accessibilityLabel: 'Flexed', style: { flex: 1 } },
    };
    const report = auditRenderedTree(tree, 390);
    expect(report.undeterminedTargets).toBe(1);
    expect(report.smallTargets).toEqual([]);
  });
});
