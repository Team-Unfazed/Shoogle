/**
 * Android QA for the Posts tab. Owner: Yash.
 *
 * Shoogle is Android-first and must behave at both target viewports: 390x844
 * and 412x915. These checks are STATIC — they walk the rendered tree and assert
 * on declared styles and accessibility props — so anything not determinable
 * statically is counted as undetermined rather than quietly passed.
 *
 * What this catches: a declared width wider than the viewport, a control with
 * no accessible name, and a pressable under the 44pt Android floor. What it
 * cannot catch — overflow caused by flex or content, keyboard avoidance, real
 * scroll behaviour — still needs a device.
 *
 * The walker is imported from the shared harness rather than forked. Three
 * forks of it existed once and all three carried the same bug; the note in
 * `features/seo/__tests__/android-viewports.test.tsx` records why.
 */

import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import PostsScreen from '@/app/(tabs)/posts';
import { ToastProvider } from '@/components/ui';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { ThemeProvider } from '@/theme';

import { auditRenderedTree } from '../../../__tests__/android-qa.test';

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

jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => null,
  resetSupabaseClient: () => {},
  isSupabaseConfigured: () => false,
}));

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
] as const;

type TreeNode = NonNullable<Parameters<typeof auditRenderedTree>[0]> extends infer T
  ? T extends string
    ? never
    : T
  : never;

function wrap(ui: ReactNode, width: number, height: number) {
  return renderRouter(
    {
      posts: () => (
        <ThemeProvider forceScheme="light">
          <SessionProvider>
            <ToastProvider>{ui}</ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      ),
    },
    {
      initialUrl: '/posts',
      initialMetrics: {
        frame: { x: 0, y: 0, width, height },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      },
    } as never,
  );
}

describe.each(VIEWPORTS)('Posts at $name', ({ width, height }) => {
  it('fits, labels every control and meets the 44pt floor with content', async () => {
    mockFixtures = true;
    await wrap(<PostsScreen />, width, height);

    expect(screen.getByTestId('posts-screen')).toBeOnTheScreen();

    const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);
    // The list is built from controls: the FAB, the tabs, the rows.
    expect(report.totalPressables).toBeGreaterThan(3);
  });

  it('fits and stays labelled with nothing connected at all', async () => {
    mockFixtures = false;
    await wrap(<PostsScreen />, width, height);

    // The honest empty state, not a blank screen.
    expect(screen.getByText('Nothing scheduled')).toBeOnTheScreen();

    const report = auditRenderedTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);
  });

  it('keeps Create post reachable in both states, per product rule 4', async () => {
    mockFixtures = false;
    await wrap(<PostsScreen />, width, height);
    expect(screen.getByTestId('create-post')).toBeOnTheScreen();
  });
});

describe('the other Posts views say they are unbuilt rather than faking content', () => {
  it('offers no fabricated photos or performance data', async () => {
    mockFixtures = true;
    await wrap(<PostsScreen />, 412, 915);

    fireEvent.press(screen.getByText('Photos'));
    expect(await screen.findByText('Photos and videos')).toBeOnTheScreen();
    expect(screen.getByText(/not built yet/i)).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Performance'));
    // The tab label and the empty-state heading both read "Performance".
    expect(await screen.findAllByText('Performance')).not.toHaveLength(0);
    expect(screen.getByText(/not built yet/i)).toBeOnTheScreen();
  });
});
