/**
 * ANDROID QA — THE WHOLE SEO VERTICAL. Sprint day 6. Owner: Pranay.
 *
 * `__tests__/android-qa.test.tsx` proved one screen (the Business tab) fits,
 * labels its controls and meets the 44pt floor at both Android target
 * viewports. This file extends that same audit to every route the vertical
 * ships: the twelve screens under `app/seo/`, their `_layout`, and the tab that
 * is the door to all of them.
 *
 * THE WALKER IS IMPORTED, NOT COPIED.
 * `auditRenderedTree` and `ANDROID_VIEWPORTS` come from the shared harness. A
 * second copy of a checker is a second thing to keep true, and the copy always
 * loses. Importing that module also re-registers its Business-tab suite here,
 * which is a small duplicate cost paid deliberately in exchange for one
 * definition of what "passes Android QA" means.
 *
 * BOTH DATA MODES, AND THE DEFAULT ONE MATTERS MOST.
 * There are no Google Business Profile credentials and there cannot be any for
 * weeks, so `unavailable('not_connected')` is the PRODUCTION state of this
 * whole vertical, not an edge case. Every screen is therefore audited twice:
 * with fixtures OFF (what ships) and with fixtures ON (what an engineer sees).
 * A screen that only lays out correctly with fixtures is broken.
 *
 * EVERY SCREEN IS REACHED BY PUSHING TO IT, NOT BY BOOTING INTO IT.
 * That is how an owner arrives — from the Business tab — and it is the only way
 * the back control exists, since `TopBar` hides the chevron when there is
 * nowhere to go back to. It also means each push is a live check that the href
 * resolves to a route that actually exists.
 *
 * WHAT THIS STILL CANNOT SEE: overflow caused by flex or content rather than a
 * declared width, keyboard avoidance, scroll momentum, and real back-gesture
 * behaviour. Heights that layout decides are reported as UNDETERMINED and
 * counted, never silently passed.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import BusinessScreen from '@/app/(tabs)/business';
import SeoLayout from '@/app/seo/_layout';
import AgentScreen from '@/app/seo/agent';
import AreasScreen from '@/app/seo/areas';
import AuditScreen from '@/app/seo/audit';
import GetReviewsScreen from '@/app/seo/get-reviews';
import HoursScreen from '@/app/seo/hours';
import PerformanceScreen from '@/app/seo/performance';
import PhotosScreen from '@/app/seo/photos';
import ProfileScreen from '@/app/seo/profile';
import ReviewReplyScreen from '@/app/seo/review-reply';
import ReviewsScreen from '@/app/seo/reviews';
import SearchesScreen from '@/app/seo/searches';
import VisibilityScreen from '@/app/seo/visibility';
import { ToastProvider } from '@/components/ui';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { ThemeProvider } from '@/theme';

import { ANDROID_VIEWPORTS, auditRenderedTree } from './android-qa.test';

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Fixture mode is a runtime gate, not a build flag, so it is mocked rather than
 * set. `false` is the default because `false` is what ships.
 */
let mockFixtures = false;
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

/**
 * The development Gemini client reads a NON-public key from `process.env`.
 * Clearing both names makes the AI cards deterministic here rather than
 * dependent on whichever engineer's machine runs the suite.
 */
const savedGeminiKeys = {
  key: process.env['GEMINI_API_KEY'],
  publicKey: process.env['EXPO_PUBLIC_GEMINI_API_KEY'],
};

beforeAll(() => {
  delete process.env['GEMINI_API_KEY'];
  delete process.env['EXPO_PUBLIC_GEMINI_API_KEY'];
});

afterAll(() => {
  if (savedGeminiKeys.key !== undefined) process.env['GEMINI_API_KEY'] = savedGeminiKeys.key;
  if (savedGeminiKeys.publicKey !== undefined) {
    process.env['EXPO_PUBLIC_GEMINI_API_KEY'] = savedGeminiKeys.publicKey;
  }
});

/** The tree shape `auditRenderedTree` accepts, taken from it rather than redeclared. */
type QaTree = Parameters<typeof auditRenderedTree>[0];

/**
 * The viewport is applied with a real `SafeAreaProvider`, not with
 * `renderRouter`'s `initialMetrics` option. That option is not one RNTL's
 * `render` understands: it is dropped with an "Unknown option(s)" warning and
 * the frame never reaches the tree, so a test written that way audits both
 * "viewports" at the same default size. The shared harness passes it and has
 * the same gap; that file is not this feature's to restructure, and the gap is
 * mostly cosmetic there because `auditRenderedTree` takes the width as an
 * argument rather than reading it from the tree.
 */
function wrap(Component: () => React.JSX.Element, metrics: Metrics) {
  function Route() {
    return (
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider forceScheme="light">
          <SessionProvider>
            <ToastProvider>
              <Component />
            </ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }
  Route.displayName = `Route(${Component.name})`;
  return Route;
}

interface VerticalScreen {
  /** Human name used in test titles and in the summary table. */
  readonly name: string;
  /** Path pushed to, params included. Must resolve to a registered route. */
  readonly href: string;
  /** Root testID, proving the screen itself rendered rather than a fallback. */
  readonly testID: string;
}

/**
 * `reviewId` names a fixture review. With fixtures ON the reply composer
 * renders; with fixtures OFF the screen must still lay out its "Shoogle does
 * not have this review" state, which is the production case.
 */
const REVIEW_REPLY_HREF = '/seo/review-reply?reviewId=fixture-review-0001';

/** The twelve screens under `app/seo/`. `_layout` is exercised by all of them. */
const SEO_SCREENS: readonly VerticalScreen[] = [
  { name: 'Profile audit', href: '/seo/audit', testID: 'audit-screen' },
  { name: 'What people searched', href: '/seo/searches', testID: 'searches-screen' },
  { name: 'How you look to AI', href: '/seo/visibility', testID: 'visibility-screen' },
  { name: 'Reviews', href: '/seo/reviews', testID: 'reviews-screen' },
  { name: 'Reply to a review', href: REVIEW_REPLY_HREF, testID: 'review-reply-screen' },
  { name: 'Photos', href: '/seo/photos', testID: 'photos-screen' },
  { name: 'Performance', href: '/seo/performance', testID: 'performance-screen' },
  { name: 'Shoogle agent', href: '/seo/agent', testID: 'agent-screen' },
  { name: 'Get more reviews', href: '/seo/get-reviews', testID: 'get-reviews-screen' },
  { name: 'Business profile', href: '/seo/profile', testID: 'profile-screen' },
  { name: 'Opening hours', href: '/seo/hours', testID: 'hours-screen' },
  { name: 'Service areas', href: '/seo/areas', testID: 'areas-screen' },
] as const;

/**
 * The whole vertical, wired to the REAL components behind every route — so a
 * push to a route that does not exist, or to one that cannot render, fails here
 * rather than becoming a dead tap on a phone. `app/seo/_layout` is registered
 * as the real Stack layout, which is what the twelve screens actually sit in.
 */
function verticalRoutes(metrics: Metrics) {
  return {
    business: wrap(BusinessScreen, metrics),
    'seo/_layout': SeoLayout,
    'seo/audit': wrap(AuditScreen, metrics),
    'seo/searches': wrap(SearchesScreen, metrics),
    'seo/visibility': wrap(VisibilityScreen, metrics),
    'seo/reviews': wrap(ReviewsScreen, metrics),
    'seo/review-reply': wrap(ReviewReplyScreen, metrics),
    'seo/photos': wrap(PhotosScreen, metrics),
    'seo/performance': wrap(PerformanceScreen, metrics),
    'seo/agent': wrap(AgentScreen, metrics),
    'seo/get-reviews': wrap(GetReviewsScreen, metrics),
    'seo/profile': wrap(ProfileScreen, metrics),
    'seo/hours': wrap(HoursScreen, metrics),
    'seo/areas': wrap(AreasScreen, metrics),
  };
}

function metricsFor(width: number, height: number): Metrics {
  return {
    frame: { x: 0, y: 0, width, height },
    insets: { top: 24, left: 0, right: 0, bottom: 24 },
  };
}

/**
 * Boots the vertical at the Business tab, at a given viewport.
 *
 * The `await` is load-bearing rather than decorative: `renderRouter` switches
 * Jest to fake timers and renders concurrently, and the global `screen` is only
 * bound to the result once that has flushed. Without it every query in the file
 * fails with "`render` function has not been called".
 */
async function bootVertical(width: number, height: number) {
  await renderRouter(verticalRoutes(metricsFor(width, height)), { initialUrl: '/business' });
}

/**
 * Boots at Business and pushes to `href`, the way an owner reaches the screen.
 *
 * Two details here are not stylistic:
 *
 *  - `testRouter.push` from expo-router's own testing library is not used. It
 *    asserts against `rnTestingLibrary.screen` rather than the augmented screen
 *    object `renderRouter` returns, so it throws `getPathnameWithParams is not
 *    a function` before it can assert anything.
 *  - the timers must be advanced. `renderRouter` installs fake timers and React
 *    Navigation settles a push on a timer, so without this the push is silently
 *    a no-op and all thirteen screens would be audited as the Business tab. The
 *    `getByTestId` in each test is what catches that if it ever regresses.
 */
async function openScreen(href: string, width: number, height: number) {
  await bootVertical(width, height);
  await act(async () => {
    router.push(href);
    jest.advanceTimersByTime(1000);
  });
}

/* -------------------------------------------------------------------------- */
/* Per-screen record, printed once at the end                                  */
/* -------------------------------------------------------------------------- */

interface Observation {
  screen: string;
  viewport: string;
  fixtures: 'off' | 'on';
  controls: number;
  undetermined: number;
}

const OBSERVED: Observation[] = [];

afterAll(() => {
  if (OBSERVED.length === 0) return;
  const rows = OBSERVED.map(
    (o) =>
      `  ${o.screen.padEnd(22)} ${o.viewport.padEnd(8)} fixtures ${o.fixtures.padEnd(3)}` +
      `  controls ${String(o.controls).padStart(3)}` +
      `  UNDETERMINED heights ${String(o.undetermined).padStart(3)}`,
  );
  console.log(
    ['', 'ANDROID QA — SEO vertical, controls inspected per screen:', ...rows, ''].join('\n'),
  );
});

/* -------------------------------------------------------------------------- */
/* The audit                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Controls whose height the walker could actually read.
 *
 * `undeterminedTargets` is the honest half of the report: a control laid out by
 * flex or content has no declared height, so the 44pt assertion never touched
 * it. If a whole screen is undetermined then "no target is under 44pt" is true
 * only because nothing was measured.
 */
function measurableTargets(report: ReturnType<typeof auditRenderedTree>): number {
  return report.totalPressables - report.undeterminedTargets;
}

const MODES = [
  // Fixtures OFF first, on purpose: it is the production state, so it is the
  // one that must be best tested rather than worst.
  { fixtures: 'off' as const, enabled: false },
  { fixtures: 'on' as const, enabled: true },
];

describe.each(MODES)('SEO vertical with fixtures $fixtures', ({ fixtures, enabled }) => {
  afterEach(() => {
    mockFixtures = false;
  });

  describe.each(ANDROID_VIEWPORTS)('at $name', ({ name: viewport, width, height }) => {
    it.each(SEO_SCREENS)('$name fits, labels and sizes every control', async (target) => {
      mockFixtures = enabled;
      await openScreen(target.href, width, height);

      // The screen rendered at all, and it is the real one, not a fallback.
      expect(screen.getByTestId(target.testID)).toBeOnTheScreen();

      const report = auditRenderedTree(screen.toJSON() as QaTree, width);
      OBSERVED.push({
        screen: target.name,
        viewport,
        fixtures,
        controls: report.totalPressables,
        undetermined: report.undeterminedTargets,
      });

      expect(report.overflow).toEqual([]);
      expect(report.unlabelled).toEqual([]);
      expect(report.smallTargets).toEqual([]);

      // A pass with nothing inspected is not a pass. Every screen here is
      // pushed onto a stack, so it has at least a back control.
      expect(report.totalPressables).toBeGreaterThan(0);

      // And at least one of those controls must have a height the walker can
      // actually read. All-undetermined means the 44pt assertion above ran
      // against nothing, which reads as a pass and is not one.
      expect(measurableTargets(report)).toBeGreaterThan(0);
    });

    it('the Business tab itself fits, labels and sizes every control', async () => {
      mockFixtures = enabled;
      await bootVertical(width, height);

      expect(screen.getByText('Business')).toBeOnTheScreen();

      const report = auditRenderedTree(screen.toJSON() as QaTree, width);
      OBSERVED.push({
        screen: 'Business tab',
        viewport,
        fixtures,
        controls: report.totalPressables,
        undetermined: report.undeterminedTargets,
      });

      expect(report.overflow).toEqual([]);
      expect(report.unlabelled).toEqual([]);
      expect(report.smallTargets).toEqual([]);
      expect(report.totalPressables).toBeGreaterThan(0);
      expect(measurableTargets(report)).toBeGreaterThan(0);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Coverage: the audit is only worth its name if it covers the whole vertical  */
/* -------------------------------------------------------------------------- */

const SEO_DIR = join(__dirname, '..', 'app', 'seo');

/** Every `/seo/...` path any of Pranay's screens navigates to. */
function linkedSeoPaths(): string[] {
  const sources = [
    join(__dirname, '..', 'app', '(tabs)', 'business.tsx'),
    ...readdirSync(SEO_DIR)
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => join(SEO_DIR, file)),
  ];

  const found = new Set<string>();
  for (const file of sources) {
    for (const match of readFileSync(file, 'utf8').matchAll(/['`](\/seo\/[a-z-]+)/g)) {
      const path = match[1];
      if (path !== undefined) found.add(path);
    }
  }
  return [...found].sort();
}

/** The pathname half of an entry in `SEO_SCREENS`, params stripped. */
function auditedPaths(): string[] {
  return SEO_SCREENS.map((entry) => entry.href.replace(/\?.*$/, '')).sort();
}

describe('coverage', () => {
  it('audits every screen file that exists under app/seo', () => {
    const files = readdirSync(SEO_DIR)
      .filter((file) => file.endsWith('.tsx') && file !== '_layout.tsx')
      .map((file) => `/seo/${file.replace(/\.tsx$/, '')}`)
      .sort();

    // Adding a route without adding it here would leave it unaudited, and the
    // suite would still be green. That is the failure mode this prevents.
    expect(auditedPaths()).toEqual(files);
  });

  it('every /seo/ link in the vertical points at a route that exists and is audited', () => {
    const linked = linkedSeoPaths();
    expect(linked.length).toBeGreaterThan(0);

    for (const path of linked) {
      // typedRoutes cannot catch this today: tsconfig excludes `.expo/types`,
      // so the generated href union is not part of the type check.
      expect(existsSync(join(SEO_DIR, `${path.replace('/seo/', '')}.tsx`))).toBe(true);
      expect(auditedPaths()).toContain(path);
    }
  });
});
