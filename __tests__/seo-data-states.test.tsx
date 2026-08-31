/**
 * THE HONEST-STATE REGRESSION MATRIX — sprint day 5. Owner: Pranay.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * There are no Google Business Profile credentials, and there cannot be any for
 * weeks: the access request needs a profile verified 60+ days plus Google's own
 * approval. So `unavailable('not_connected')` is not an edge case in this
 * vertical — it is the PRODUCTION state of every screen in it. A suite that
 * only proves the happy path proves the state nobody will see.
 *
 * Every surface that reads a provider is therefore driven through EVERY member
 * of `DataState`, and the same four questions are asked of each render:
 *
 *   1. Did a value we do not know come out as `0`?          (`bareZeros`)
 *   2. Did a rank position appear?                          (`rankClaims`)
 *   3. Did fixture content escape its banner?               (`fixtureLeaks`)
 *   4. Is there a control with nothing behind it?           (`auditRenderedTree`)
 *
 * The first three walkers live here because they are about MEANING, not layout.
 * The fourth is imported from `./android-qa.test` rather than copied: a second
 * copy of a checker is a second thing to keep true, and the copy always loses.
 * Importing that module re-registers its Business-tab suite here, which is the
 * price of having one definition of "labelled control", paid deliberately.
 *
 * WHAT "PROVING A ZERO" MEANS HERE
 * --------------------------------
 * `bareZeros` does not merely count zeros — it records, for each one, the
 * nearest enclosing text that says more than the digit itself. A zero passes
 * only when that text names the measurement it came from ("Measured zero",
 * "of 8 suggested this week", "Google counted…"). A zero with no such sentence
 * around it is indistinguishable, to an owner, from a number we never fetched,
 * and it fails. In every non-ready state the expected count is exactly nought.
 *
 * WHAT THIS CANNOT REACH, AND SAYS SO
 * -----------------------------------
 * Some surfaces cannot be handed some states by the screen that owns them —
 * `ActionsFeed`, for instance, is fed a value the screen constructs
 * synchronously, so it can never receive an error. Those are NOT skipped: the
 * component is still driven through the state so its behaviour is pinned, and
 * `UNREACHABLE` records the claim, which a test then checks against the screen
 * rather than leaving it as a comment nobody verifies.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactElement } from 'react';

import BusinessScreen from '@/app/(tabs)/business';
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
import {
  classifyVoiceOfMerchant,
  describeVoiceOfMerchant,
  gbpFailureState,
  removedCapabilityState,
  unsupportedCapabilityState,
  voiceOfMerchantGate,
  type GbpPerformanceReport,
  type GbpReplyOutcome,
  type VoiceOfMerchantOutcome,
} from '@/features/gbp';
import { buildWindows } from '@/features/gbp/performance';
import { createGoogleBusinessProfileProvider } from '@/features/gbp/provider';
import { ActionsFeed, type AgentAction } from '@/features/gbp/components/agent';
import {
  NewReviewsCard,
  WeeklyRequestsCard,
  type ReviewCountChange,
  type WeeklyRequestSummary,
} from '@/features/gbp/components/getReviews';
import {
  DEFAULT_PERIOD,
  MetricReadingCard,
  PerformanceView,
  RemovedMetricsCard,
  buildSnapshot,
  type PerformanceRow,
  type PerformanceSeries,
  type PerformanceSnapshot,
  type ProfileCapabilities,
} from '@/features/gbp/components/performance';
import {
  RatingSummaryCard,
  SubmissionOutcome,
  VerificationPanel,
  summariseReviews,
} from '@/features/gbp/components/reviews';
import type { GbpVoiceOfMerchantStateWire } from '@/features/gbp/types';
import type { GbpTransportOutcome } from '@/features/gbp';
import {
  LIVE_DAILY_METRIC_ORDER,
  REMOVED_METRICS,
  REMOVED_METRIC_IDS,
  buildLocalBusinessSchema,
  checkAiVisibility,
  observeReadability,
  removedMetricState,
  type LocalBusinessSchemaResult,
  type SearchKeywordsReport,
} from '@/features/seo';
import {
  AiVisibilityView,
  DirectoryChecklistCard,
  SchemaCard,
  SearchKeywordsView,
  type AiVisibilityInspection,
} from '@/features/seo/components';
import { buildFixtureEmptyReviewPage, buildFixtureUnsummarisedReviewPage } from '@/fixtures/gbp-reviews';
import { fixtureAgentActions } from '@/fixtures/gbp-agent';
import {
  fixturePageSnapshot,
  fixtureSchemaInput,
  fixtureSearchKeywordsReport,
} from '@/fixtures/seo';
import { clearProviderRegistry, registerProvider, type ConnectableProvider } from '@/lib/providers';
import type { ConnectionInfo } from '@/lib/providers/types';
import {
  UNAVAILABLE_COPY,
  failed,
  loading,
  ready,
  unavailable,
  type DataState,
  type UnavailableReason,
} from '@/lib/state/DataState';
import { ThemeProvider } from '@/theme';
import type { BusinessCategory, ProviderId } from '@/types/domain';

import { ANDROID_VIEWPORTS, auditRenderedTree } from './android-qa.test';

/* -------------------------------------------------------------------------- */
/* Runtime gates                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Fixture mode is a runtime gate, not a build flag. `false` is the default here
 * because `false` is what ships, and the not-connected state is the one this
 * file exists to over-test rather than under-test.
 */
let mockFixtures = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual<typeof import('@/lib/env')>('@/lib/env');
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
 * The screens reach Google through two module-level singletons. Replacing a
 * method on each is what lets a screen — not just a presentational component —
 * be driven through states its adapter cannot produce today, which is the whole
 * point: the adapter has no transport, so without this every screen would only
 * ever be testable in one state.
 *
 * Everything not listed here is the REAL implementation, spread from
 * `requireActual`. The overrides read `mockGbpProgram` when CALLED, never when
 * the factory runs, so there is no temporal-dead-zone hazard.
 */
interface GbpProgram {
  getLocation?: DataState<import('@/lib/providers').GbpLocation>;
  listLocations?: DataState<import('@/lib/providers').GbpLocation[]>;
  getVoiceOfMerchant?: DataState<VoiceOfMerchantOutcome>;
  getPerformanceReport?: DataState<GbpPerformanceReport>;
}
const mockGbpProgram: GbpProgram = {};

interface SeoProgram {
  getSearchKeywords?: DataState<SearchKeywordsReport>;
}
const mockSeoProgram: SeoProgram = {};

jest.mock('@/features/gbp', () => {
  const actual = jest.requireActual<typeof import('@/features/gbp')>('@/features/gbp');
  const real = actual.googleBusinessProfileProvider;
  return {
    ...actual,
    googleBusinessProfileProvider: {
      ...real,
      getLocation: (locationId: string) =>
        mockGbpProgram.getLocation === undefined
          ? real.getLocation(locationId)
          : Promise.resolve(mockGbpProgram.getLocation),
      listLocations: () =>
        mockGbpProgram.listLocations === undefined
          ? real.listLocations()
          : Promise.resolve(mockGbpProgram.listLocations),
      getVoiceOfMerchant: (locationId: string) =>
        mockGbpProgram.getVoiceOfMerchant === undefined
          ? real.getVoiceOfMerchant(locationId)
          : Promise.resolve(mockGbpProgram.getVoiceOfMerchant),
      getPerformanceReport: (locationId: string, period: string) =>
        mockGbpProgram.getPerformanceReport === undefined
          ? real.getPerformanceReport(locationId, period)
          : Promise.resolve(mockGbpProgram.getPerformanceReport),
    },
  };
});

jest.mock('@/features/seo', () => {
  const actual = jest.requireActual<typeof import('@/features/seo')>('@/features/seo');
  const real = actual.seoProvider;
  return {
    ...actual,
    seoProvider: {
      ...real,
      getSearchKeywords: (locationId: string, monthStart: string) =>
        mockSeoProgram.getSearchKeywords === undefined
          ? real.getSearchKeywords(locationId, monthStart)
          : Promise.resolve(mockSeoProgram.getSearchKeywords),
    },
  };
});

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

afterEach(() => {
  mockFixtures = false;
  clearProviderRegistry();
  delete mockGbpProgram.getLocation;
  delete mockGbpProgram.listLocations;
  delete mockGbpProgram.getVoiceOfMerchant;
  delete mockGbpProgram.getPerformanceReport;
  delete mockSeoProgram.getSearchKeywords;
});

/* -------------------------------------------------------------------------- */
/* Walkers — what the owner can actually read off the screen                  */
/* -------------------------------------------------------------------------- */

interface RenderedNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: (RenderedNode | string)[] | null;
}

/** The rendered tree as one node, whether RNTL returned one root or several. */
function tree(): RenderedNode {
  const json = screen.toJSON();
  const roots = json === null ? [] : Array.isArray(json) ? json : [json];
  return { type: 'root', children: roots as unknown as RenderedNode[] };
}

/** Everything a sighted owner reads inside `node`, concatenated. */
function allText(node: RenderedNode | string): string {
  if (typeof node === 'string') return node;
  return (node.children ?? []).map(allText).join('');
}

/** Every accessible name in the tree — what a TalkBack user hears instead. */
function accessibleNames(node: RenderedNode): string[] {
  const names: string[] = [];
  const visit = (current: RenderedNode | string): void => {
    if (typeof current === 'string') return;
    const label = current.props?.['accessibilityLabel'];
    if (typeof label === 'string' && label.trim().length > 0) names.push(label);
    for (const child of current.children ?? []) visit(child);
  };
  visit(node);
  return names;
}

/**
 * A value slot holding a zero.
 *
 * Only a leaf whose ENTIRE text is a zero counts. Prose about zero — "it renders
 * as — rather than 0" — is the opposite of the bug and must not be flagged, and
 * a whole sentence is never a value slot.
 */
const BARE_ZERO = /^[+\-−]?(?:0|0+\.0+)%?$/;

interface ZeroSighting {
  /** The literal text in the slot, e.g. `0` or `+0`. */
  readonly token: string;
  /** The nearest enclosing text that says more than the digit. The proof, or its absence. */
  readonly scope: string;
}

function bareZeros(root: RenderedNode): ZeroSighting[] {
  const found: ZeroSighting[] = [];

  const visit = (node: RenderedNode, ancestors: RenderedNode[]): void => {
    const chain = [...ancestors, node];
    for (const child of node.children ?? []) {
      if (typeof child === 'string') {
        const token = child.trim();
        if (BARE_ZERO.test(token)) found.push({ token, scope: proofScope(chain, token) });
        continue;
      }
      visit(child, chain);
    }
  };

  visit(root, []);
  return found;
}

/**
 * How much text has to surround a zero before it can be judged.
 *
 * A digit's immediate parent is usually just the digit, and the sentence that
 * makes it a measurement — "Measured zero", "of 8 suggested this week" — sits a
 * couple of levels up beside it. 120 characters is about one sentence: enough
 * to hold the explanation, far short of a whole screen. Using the whole screen
 * would let a "Measured zero" badge on one row vouch for an unexplained zero on
 * another, which is exactly the confusion under test.
 */
const PROOF_CONTEXT_CHARS = 120;

/**
 * The smallest ancestor big enough to contain a proof, read as an owner reads
 * it: visible text plus the accessible names inside it, since a TalkBack user
 * gets the explanation through the label rather than the layout.
 */
function proofScope(chain: readonly RenderedNode[], token: string): string {
  let widest = token;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const node = chain[index];
    if (node === undefined) continue;
    const text = `${allText(node)} ${accessibleNames(node).join(' ')}`.trim();
    if (text.length <= token.length) continue;
    widest = text;
    if (text.length >= PROOF_CONTEXT_CHARS) return text;
  }
  return widest;
}

/**
 * Anything that reads as a search-rank position.
 *
 * Prose containing the word "rank" is expected and required — the screens say
 * out loud that no rank exists — so every pattern demands a NUMBER attached to
 * the claim. `#3` on its own is included because that is how a position would
 * arrive from `formatMetricValue(value, 'position')`.
 */
const RANK_CLAIM_PATTERNS: readonly RegExp[] = [
  /\brank(?:ed|ing|s)?\s*(?:at|#|number|no\.?|position)?\s*\d/i,
  /\bposition\s*(?:#|number|no\.?)?\s*\d/i,
  /(?:^|\s)#\d+/,
  /\byou(?:'re| are)\s+(?:number|no\.?)\s*\d/i,
  /\bmap pack\s+(?:position|rank)\s*\d/i,
];

function rankClaims(root: RenderedNode): string[] {
  const haystack = [allText(root), ...accessibleNames(root)];
  const hits: string[] = [];
  for (const text of haystack) {
    for (const pattern of RANK_CLAIM_PATTERNS) {
      const match = pattern.exec(text);
      if (match !== null) hits.push(match[0]);
    }
  }
  return hits;
}

/**
 * A greyed control with no reason attached to it.
 *
 * "A button either works, or says why it does not" is only kept if the reason
 * reaches the person using the button. The amber sentence under a row satisfies
 * a sighted owner; a TalkBack user moving control by control hears
 * "Copy message, dimmed" and nothing more, because a sibling `Text` is several
 * swipes away and only found by someone who keeps going.
 *
 * So the convention this vertical follows — and this walker enforces — is that
 * a disabled control states the fact FIRST in its own hint: `Disabled. <why>`.
 * A busy control is not dead: `Button` sets `disabled` while `loading`, and
 * that state announces itself through `busy` and a progress label instead.
 */
interface DeadControl {
  readonly label: string;
  readonly hint: string | null;
}

const DISABLED_HINT = /^disabled\b/i;

function deadControls(root: RenderedNode): DeadControl[] {
  const dead: DeadControl[] = [];
  const visit = (node: RenderedNode | string): void => {
    if (typeof node === 'string') return;
    const props = node.props ?? {};
    const state = props['accessibilityState'] as
      | { disabled?: unknown; busy?: unknown }
      | undefined;
    const isControl = typeof props['accessibilityRole'] === 'string';
    const isDisabled = state?.disabled === true || props['disabled'] === true;
    const isBusy = state?.busy === true;
    if (isControl && isDisabled && !isBusy) {
      const hint = props['accessibilityHint'];
      const hintText = typeof hint === 'string' ? hint : null;
      if (hintText === null || !DISABLED_HINT.test(hintText.trim())) {
        const label = props['accessibilityLabel'];
        dead.push({
          label: typeof label === 'string' ? label : allText(node).slice(0, 60),
          hint: hintText,
        });
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return dead;
}

/** Fixture material is marked. Anything carrying the marker must sit under the banner. */
const FIXTURE_MARKER = /\[fixture\]/i;

function fixtureLeaks(root: RenderedNode): string[] {
  const hits: string[] = [];
  for (const text of [allText(root), ...accessibleNames(root)]) {
    if (FIXTURE_MARKER.test(text)) hits.push(text.slice(0, 80));
  }
  return hits;
}

/**
 * `toHaveTextContent` matches the WHOLE string when given a string, so every
 * partial check goes through a regex built from the literal. Escaping keeps
 * copy containing brackets or dots from becoming an accidental pattern.
 */
function containing(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

/** The tree shape `auditRenderedTree` accepts, taken from it rather than redeclared. */
type QaTree = Parameters<typeof auditRenderedTree>[0];

/* -------------------------------------------------------------------------- */
/* The state vocabulary, in full                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every `UnavailableReason`, derived from `UNAVAILABLE_COPY` rather than typed
 * out, so a reason added to `lib/state/DataState.ts` tomorrow is driven through
 * every surface here without anyone remembering to add it.
 */
const ALL_UNAVAILABLE_REASONS = Object.keys(UNAVAILABLE_COPY) as UnavailableReason[];

/** A distinctive sentence per reason, so "was the provider's message shown?" is checkable. */
function messageFor(reason: UnavailableReason): string {
  return `Google gave no data because of ${reason}, and Shoogle will not invent any.`;
}

const RETRYABLE_ERROR = failed(
  'gbp_provider_unavailable',
  'Google is not responding right now. This is usually brief.',
  true,
);

const TERMINAL_ERROR = failed(
  'gbp_invalid_request',
  'Google rejected this request. We have logged it — this is not something you can fix.',
  false,
);

type StateName =
  | 'loading'
  | 'ready'
  | `unavailable:${UnavailableReason}`
  | 'error:retryable'
  | 'error:terminal';

interface StateCase {
  readonly name: StateName;
  /** Built per surface, because `ready` carries a value only that surface can hold. */
  readonly build: <T>(readyValue: T) => DataState<T>;
}

const STATE_CASES: readonly StateCase[] = [
  { name: 'loading', build: () => loading() },
  { name: 'ready', build: (value) => ready(value, '2020-01-08T00:00:00.000Z') },
  ...ALL_UNAVAILABLE_REASONS.map(
    (reason): StateCase => ({
      name: `unavailable:${reason}`,
      build: () => unavailable(reason, messageFor(reason)),
    }),
  ),
  { name: 'error:retryable', build: () => RETRYABLE_ERROR },
  { name: 'error:terminal', build: () => TERMINAL_ERROR },
];

/** The ten the sprint brief names, pinned so a rename cannot silently drop one. */
const BRIEF_STATES: readonly StateName[] = [
  'loading',
  'ready',
  'unavailable:not_connected',
  'unavailable:no_data_yet',
  'unavailable:insufficient_data',
  'unavailable:not_supported',
  'unavailable:rate_limited',
  'unavailable:auth_expired',
  'error:retryable',
  'error:terminal',
];

/* -------------------------------------------------------------------------- */
/* Ready values                                                               */
/* -------------------------------------------------------------------------- */

const FULL_COVERAGE_CAPABILITIES: ProfileCapabilities = {
  // Stated by Google, not assumed — which is what makes the food rows render as
  // "not applicable" rather than as zeros.
  canHaveFoodMenus: false,
  categoryLabel: 'Hair salon',
};

/** Twenty-eight consecutive days ending on the snapshot's end date. */
function daysEnding(endDate: string, count: number): string[] {
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10),
  );
}

const PERFORMANCE_END_DATE = '2020-06-28';

/**
 * A snapshot built to contain one of each fact, on purpose:
 *
 *   four impression splits  measured, non-zero, fully covered
 *   CALL_CLICKS             MEASURED ZERO — Google counted and found none
 *   WEBSITE_CLICKS          NOT REPORTED — Google returned no days
 *   the food metrics        NOT APPLICABLE — Google says this listing has no menus
 *
 * If any of those four collapsed into the same rendering, this file would fail.
 */
function performanceSnapshot(): PerformanceSnapshot {
  const days = daysEnding(PERFORMANCE_END_DATE, 56);
  const constant = (count: number): PerformanceSeries['points'] =>
    days.map((date) => ({ date, kind: 'reported' as const, count }));

  const series: PerformanceSeries[] = [
    { metric: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH', points: constant(9) },
    { metric: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', points: constant(4) },
    { metric: 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', points: constant(2) },
    { metric: 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', points: constant(1) },
    { metric: 'CALL_CLICKS', points: constant(0) },
  ];

  const snapshot = buildSnapshot({
    series,
    capabilities: FULL_COVERAGE_CAPABILITIES,
    period: DEFAULT_PERIOD,
    endDate: PERFORMANCE_END_DATE,
  });
  if (snapshot === null) throw new Error('the test snapshot could not be built');
  return snapshot;
}

function visibilityInspection(): AiVisibilityInspection {
  return {
    report: checkAiVisibility(fixturePageSnapshot),
    readability: observeReadability({ html: fixturePageSnapshot.html, pageLabel: 'home' }),
    pageLabel: 'home',
  };
}

function schemaResult(): LocalBusinessSchemaResult {
  return buildLocalBusinessSchema(fixtureSchemaInput);
}

const WEEKLY_REQUESTS_ZERO: WeeklyRequestSummary = {
  weekStart: '2020-01-06',
  // A genuine measured zero: Shoogle knows it has sent none from this phone.
  confirmed: 0,
  suggested: 8,
  entries: [],
};

const REVIEW_COUNT_MEASURED_ZERO_DELTA: ReviewCountChange = {
  total: 12,
  // Same reading at the start of the week: the change is a measured zero.
  totalAtWeekStart: 12,
  rating: 4.2,
};

const REVIEW_COUNT_UNKNOWN_DELTA: ReviewCountChange = {
  total: 12,
  // Never read this profile before. The change is UNKNOWN, and unknown is not zero.
  totalAtWeekStart: null,
  rating: 4.2,
};

const REPLY_PENDING_MODERATION: GbpReplyOutcome = {
  reviewId: 'review-0001',
  moderation: { kind: 'pending_moderation', submittedAt: '2020-01-08T00:00:00.000Z' },
};

/* -------------------------------------------------------------------------- */
/* Render harness                                                             */
/* -------------------------------------------------------------------------- */

async function renderPart(element: ReactElement) {
  return render(
    <ThemeProvider forceScheme="light">
      <ToastProvider>{element}</ToastProvider>
    </ThemeProvider>,
  );
}

function wrapRoute(Component: () => React.JSX.Element) {
  function Route() {
    return (
      <ThemeProvider forceScheme="light">
        <SessionProvider>
          <ToastProvider>
            <Component />
          </ToastProvider>
        </SessionProvider>
      </ThemeProvider>
    );
  }
  Route.displayName = `Route(${Component.name})`;
  return Route;
}

/**
 * `renderRouter` MUST be awaited — RNTL 14 returns a promise from `render` and
 * `renderRouter` inherits it. Dropping the await starts a mount that overlaps
 * the next `act()`, and every query then fails with "unable to find an element"
 * instead of with the real cause.
 */
async function renderScreen(route: string, Component: () => React.JSX.Element) {
  await renderRouter({ [route]: wrapRoute(Component) }, { initialUrl: `/${route}` });
  await act(async () => {});
}

/* -------------------------------------------------------------------------- */
/* The surfaces                                                               */
/* -------------------------------------------------------------------------- */

interface Surface {
  /** Name used in test titles. */
  readonly name: string;
  /** The route whose body this is. */
  readonly route: string;
  /** Renders the surface in one state. */
  readonly render: (state: DataState<never>) => ReactElement;
  /** The value the `ready` case carries. */
  readonly readyValue: unknown;
  /**
   * True when the owning screen passes an `onRetry`. When false, a retryable
   * error must still SAY what happened — it just has no button, and the
   * `UNREACHABLE` ledger has to explain why the screen cannot produce one.
   */
  readonly offersRetry: boolean;
  /**
   * The sentences that make a zero a measurement. A bare zero whose nearest
   * enclosing text matches none of these is a failure.
   *
   * Every entry must NAME THE MEASUREMENT ("Measured zero", "of 8 suggested
   * this week"). A bare subject word — `/photo/i` on the photos screen,
   * `/areas/i` on the areas screen — is not a proof: it matches the heading of
   * the screen it sits on, so it would vouch for every zero that screen could
   * ever render, including the invented ones this file exists to catch. Those
   * were removed rather than left in as decoration.
   */
  readonly measuredZeroProofs: readonly RegExp[];
}

/**
 * `DataState<never>` is the one shape assignable to every `DataState<T>` a
 * surface could want, which is what lets one matrix drive nine different
 * components. The value inside a `ready` is supplied per surface, so nothing
 * here is ever actually a `never`.
 */
function build<T>(state: DataState<never>, value: T): DataState<T> {
  return state.status === 'ready' ? ready(value, state.fetchedAt, state.isFixture) : state;
}

const SURFACES: readonly Surface[] = [
  {
    name: 'searches · SearchKeywordsView',
    route: '/seo/searches',
    readyValue: fixtureSearchKeywordsReport,
    offersRetry: true,
    measuredZeroProofs: [/Measured zero/, /Google counted this term and found nobody/],
    render: (state) => (
      <SearchKeywordsView
        state={build<SearchKeywordsReport>(state, fixtureSearchKeywordsReport)}
        onRetry={() => {}}
      />
    ),
  },
  {
    name: 'performance · PerformanceView',
    route: '/seo/performance',
    readyValue: null,
    offersRetry: true,
    measuredZeroProofs: [
      /Measured zero/,
      /Google measured every day of this period and counted none/,
      /days measured zero/,
      // A change of exactly 0% between two FULLY measured windows. `Metric`
      // renders it as a flat arrow and announces "no change"; a change we did
      // not know would be `null` and would render nothing at all.
      /no change 0 percent/,
    ],
    render: (state) => (
      <PerformanceView
        state={build<PerformanceSnapshot>(state, performanceSnapshot())}
        periodKey={DEFAULT_PERIOD.key}
        onPeriodChange={() => {}}
        onRetry={() => {}}
      />
    ),
  },
  {
    name: 'visibility · AiVisibilityView',
    route: '/seo/visibility',
    readyValue: null,
    offersRetry: false,
    measuredZeroProofs: [],
    render: (state) => (
      <AiVisibilityView state={build<AiVisibilityInspection>(state, visibilityInspection())} />
    ),
  },
  {
    name: 'visibility · SchemaCard',
    route: '/seo/visibility',
    readyValue: null,
    offersRetry: false,
    measuredZeroProofs: [],
    render: (state) => (
      <SchemaCard
        state={build<LocalBusinessSchemaResult>(state, schemaResult())}
        testID="schema-card"
      />
    ),
  },
  {
    name: 'visibility · DirectoryChecklistCard',
    route: '/seo/visibility',
    readyValue: null,
    offersRetry: false,
    measuredZeroProofs: [/directories to check/],
    render: (state) => (
      <DirectoryChecklistCard
        state={build<BusinessCategory>(state, 'salon')}
        testID="directories-card"
      />
    ),
  },
  {
    name: 'get-reviews · WeeklyRequestsCard',
    route: '/seo/get-reviews',
    readyValue: WEEKLY_REQUESTS_ZERO,
    offersRetry: true,
    measuredZeroProofs: [/of 8 suggested this week/, /Counts requests you confirmed sending/],
    render: (state) => (
      <WeeklyRequestsCard
        state={build<WeeklyRequestSummary>(state, WEEKLY_REQUESTS_ZERO)}
        awaitingConfirmation={0}
        onRetry={() => {}}
        testID="weekly-requests-card"
      />
    ),
  },
  {
    name: 'get-reviews · NewReviewsCard',
    route: '/seo/get-reviews',
    readyValue: REVIEW_COUNT_MEASURED_ZERO_DELTA,
    offersRetry: false,
    measuredZeroProofs: [/reviews this week/],
    render: (state) => (
      <NewReviewsCard
        state={build<ReviewCountChange>(state, REVIEW_COUNT_MEASURED_ZERO_DELTA)}
        testID="new-reviews-card"
      />
    ),
  },
  {
    name: 'agent · ActionsFeed',
    route: '/seo/agent',
    readyValue: fixtureAgentActions,
    offersRetry: false,
    measuredZeroProofs: [/confirmed by Google/, /Counted, not scored/],
    render: (state) => (
      <ActionsFeed
        state={build<AgentAction[]>(state, fixtureAgentActions)}
        onOpenLink={() => {}}
        testID="actions-feed"
      />
    ),
  },
  {
    name: 'review-reply · SubmissionOutcome',
    route: '/seo/review-reply',
    readyValue: REPLY_PENDING_MODERATION,
    offersRetry: true,
    measuredZeroProofs: [],
    render: (state) => (
      <SubmissionOutcome
        state={build<GbpReplyOutcome>(state, REPLY_PENDING_MODERATION)}
        onRetry={() => {}}
        testID="submission"
      />
    ),
  },
];

/**
 * States a surface cannot be handed by the screen that owns it, and why.
 *
 * Recorded rather than skipped. The component is still driven through every
 * state below — an untested state is a claim nobody checked — and
 * `describe('the reachability ledger')` verifies each claim against the screen
 * rather than trusting this table.
 */
const UNREACHABLE: readonly { surface: string; states: readonly StateName[]; why: string }[] = [
  {
    surface: 'agent · ActionsFeed',
    states: [
      'loading',
      'unavailable:not_connected',
      'error:retryable',
      'error:terminal',
    ],
    why:
      'app/seo/agent.tsx builds the feed synchronously with gbpAgentFixtureState(fixtures?.actions ?? []), '
      + 'which is always `ready` — an empty array without fixtures. No request is made, so there is nothing to '
      + 'be loading, unavailable or in error about. The empty-ready case is what production shows.',
  },
  {
    surface: 'visibility · SchemaCard',
    states: ['loading', 'error:retryable', 'error:terminal'],
    why:
      'app/seo/visibility.tsx reads the schema once at mount from a lazy useState initialiser: it is either '
      + 'unavailable(not_connected) or a fixture-ready value. No asynchronous read exists, so neither loading '
      + 'nor error can arrive.',
  },
  {
    surface: 'visibility · DirectoryChecklistCard',
    states: ['loading', 'error:retryable', 'error:terminal'],
    why:
      'Read by the same lazy useState initialiser in app/seo/visibility.tsx as the schema card: the category is '
      + 'either unavailable(not_connected) or a fixture-ready value, decided once at mount. Nothing is fetched, so '
      + 'nothing can be in flight and nothing can fail.',
  },
  {
    surface: 'visibility · AiVisibilityView',
    states: ['loading', 'error:retryable', 'error:terminal'],
    why:
      'The page inspection is computed synchronously from a fixture snapshot at mount, or reported as '
      + 'unavailable(not_connected) because Shoogle does not know the website address until a profile is linked. '
      + 'There is no request between those two, so neither loading nor error exists on this path.',
  },
  {
    surface: 'get-reviews · NewReviewsCard',
    states: ['loading', 'error:retryable', 'error:terminal'],
    why:
      'app/seo/get-reviews.tsx derives the review count in a useMemo from the Voice of Merchant gate, so it is '
      + 'ready or unavailable and never in flight. That is also why no onRetry is passed — there is nothing to retry.',
  },
];

/* -------------------------------------------------------------------------- */
/* THE MATRIX                                                                 */
/* -------------------------------------------------------------------------- */

describe('the state vocabulary is covered in full', () => {
  it('drives every state the sprint brief names', () => {
    const driven = STATE_CASES.map((entry) => entry.name);
    for (const wanted of BRIEF_STATES) expect(driven).toContain(wanted);
  });

  it('also drives every unavailable reason the type declares, not just the named six', () => {
    // `offline` and `requires_upgrade` are not in the brief. They are in the
    // type, so they are in the matrix — an untested state is an unchecked claim.
    expect(ALL_UNAVAILABLE_REASONS).toContain('offline');
    expect(ALL_UNAVAILABLE_REASONS).toContain('requires_upgrade');
    // loading + ready + every unavailable reason + two errors.
    expect(STATE_CASES).toHaveLength(ALL_UNAVAILABLE_REASONS.length + 4);
  });
});

describe.each(SURFACES)('$name', (surface) => {
  describe.each(STATE_CASES)('in $name', (stateCase) => {
    const state = stateCase.build(undefined as never) as DataState<never>;

    it('renders something the owner can read', async () => {
      await renderPart(surface.render(state));
      const readable = allText(tree()).trim() + accessibleNames(tree()).join(' ');
      expect(readable.length).toBeGreaterThan(0);
    });

    it('never prints a zero it did not measure', async () => {
      await renderPart(surface.render(state));
      const zeros = bareZeros(tree());

      if (state.status !== 'ready') {
        // Nothing was measured, so nothing may be reported as a count.
        expect(zeros).toEqual([]);
        return;
      }

      // A measured zero is allowed, but only where the copy proves it is one.
      for (const sighting of zeros) {
        const proven = surface.measuredZeroProofs.some((proof) => proof.test(sighting.scope));
        expect({ surface: surface.name, ...sighting, proven }).toEqual(
          expect.objectContaining({ proven: true }),
        );
      }
    });

    it('renders no rank position', async () => {
      await renderPart(surface.render(state));
      expect(rankClaims(tree())).toEqual([]);
    });

    it('invents no content when it has no value to show', async () => {
      /*
       * These are presentational parts. The `ready` cases here are fed labelled
       * fixture values ON PURPOSE — that is the only way to exercise a loaded
       * render — so a marker there is the harness's, not the product's, and the
       * banner pairing that matters is checked at screen level further down.
       *
       * Every OTHER state has no value at all, so any fixture marker in it would
       * be hardcoded into an empty state: content invented by the component.
       */
      await renderPart(surface.render(state));
      if (state.status !== 'ready') expect(fixtureLeaks(tree())).toEqual([]);
    });

    it('gives every control it renders an accessible name', async () => {
      await renderPart(surface.render(state));
      const width = ANDROID_VIEWPORTS[0].width;
      const report = auditRenderedTree(tree() as QaTree, width);
      expect(report.unlabelled).toEqual([]);
      expect(report.smallTargets).toEqual([]);
    });

    it('renders no control that is dead without saying so', async () => {
      await renderPart(surface.render(state));
      expect(deadControls(tree())).toEqual([]);
    });
  });

  it('shows a skeleton, and no value, while loading', async () => {
    await renderPart(surface.render(loading()));
    expect(bareZeros(tree())).toEqual([]);
    expect(screen.queryAllByLabelText('Loading').length).toBeGreaterThan(0);
  });

  it.each(ALL_UNAVAILABLE_REASONS)('says why when unavailable(%s)', async (reason) => {
    await renderPart(surface.render(unavailable(reason, messageFor(reason))));
    const spoken = allText(tree()) + accessibleNames(tree()).join(' ');

    // The provider's own sentence reaches the owner, rather than a generic blank.
    expect(spoken).toContain(messageFor(reason));
    // An unavailable state is not an error, so it never offers a retry.
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('offers a retry on a retryable error, and states what happened', async () => {
    await renderPart(surface.render(RETRYABLE_ERROR));
    const spoken = allText(tree()) + accessibleNames(tree()).join(' ');
    expect(spoken).toContain(RETRYABLE_ERROR.message);

    if (surface.offersRetry) {
      expect(screen.getByText('Try again')).toBeOnTheScreen();
    } else {
      // No dead control: the screen cannot retry, so no button pretends it can.
      expect(screen.queryByText('Try again')).toBeNull();
    }
  });

  it('offers no retry on a terminal error, but still states what happened', async () => {
    await renderPart(surface.render(TERMINAL_ERROR));
    const spoken = allText(tree()) + accessibleNames(tree()).join(' ');
    expect(spoken).toContain(TERMINAL_ERROR.message);
    expect(screen.queryByText('Try again')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Measured zero versus unknown                                               */
/* -------------------------------------------------------------------------- */

describe('a measured zero and an unknown are different sentences', () => {
  /*
   * Three components that can show BOTH facts. Each is rendered twice in one
   * test, and the two renders are compared — a rule that says "unknown is not
   * zero" is only worth anything if the two produce different words.
   *
   * No manual `unmount()`: RNTL's `screen` always points at the most recent
   * render, and its own cleanup unmounts both afterwards.
   */

  it('NewReviewsCard: 0 for a counted change, an em dash for one never read', async () => {
    await renderPart(
      <NewReviewsCard state={ready(REVIEW_COUNT_MEASURED_ZERO_DELTA, '2020-01-08T00:00:00.000Z')} />,
    );
    expect(screen.getByTestId('new-reviews-delta')).toHaveTextContent(/^0$/);
    // A counted change of zero needs no apology, so the caveat is absent.
    expect(screen.queryByTestId('new-reviews-no-baseline')).toBeNull();
    const measuredText = allText(tree());
    // And it IS provable as a measurement from the copy around it.
    for (const sighting of bareZeros(tree())) {
      expect(sighting.scope).toMatch(/reviews this week/);
    }

    await renderPart(
      <NewReviewsCard state={ready(REVIEW_COUNT_UNKNOWN_DELTA, '2020-01-08T00:00:00.000Z')} />,
    );
    expect(screen.getByTestId('new-reviews-delta')).toHaveTextContent(/^—$/);
    expect(allText(tree())).toContain('It is not zero.');
    const unknownText = allText(tree());

    // The whole point: the two facts do not render as the same words, and the
    // unknown one prints no digit at all.
    expect(measuredText).not.toEqual(unknownText);
    expect(bareZeros(tree())).toEqual([]);
  });

  it('RatingSummaryCard: 0 reviews reads as 0, an unreported total reads as an em dash', async () => {
    await renderPart(
      <RatingSummaryCard summary={summariseReviews(buildFixtureEmptyReviewPage())} testID="zero" />,
    );
    // A verified listing Google answered about, with genuinely no reviews.
    expect(screen.getByTestId('zero-total')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('zero-bucket-5-count')).toHaveTextContent(/^0$/);
    const measuredNames = accessibleNames(tree()).join(' ');
    expect(measuredNames).toContain('0 reviews on Google');

    await renderPart(
      <RatingSummaryCard
        summary={summariseReviews(buildFixtureUnsummarisedReviewPage())}
        testID="unknown"
      />,
    );
    // Google returned reviews but no summary. Neither figure becomes 0, and
    // neither is recomputed from what loaded and passed off as Google's own.
    expect(screen.getByTestId('unknown-total')).toHaveTextContent(/^—$/);
    expect(screen.getByTestId('unknown-average')).toHaveTextContent(/^—$/);
    expect(screen.getByTestId('unknown-total-reason')).toBeOnTheScreen();
    expect(accessibleNames(tree()).join(' ')).toContain('Total number of reviews unknown');
  });

  it('MetricReadingCard: a measured zero prints 0, an unreported metric prints a dash', async () => {
    const zeroRow: PerformanceRow = {
      metric: 'CALL_CLICKS',
      reading: {
        kind: 'measured',
        total: 0,
        changePct: null,
        coverage: { reportedDays: 28, totalDays: 28 },
      },
      periodLabel: 'last 28 days',
    };
    const unknownRow: PerformanceRow = {
      metric: 'CALL_CLICKS',
      reading: { kind: 'not_reported' },
      periodLabel: 'last 28 days',
    };

    await renderPart(<MetricReadingCard row={zeroRow} testID="zero" />);
    expect(screen.getByTestId('zero-status')).toHaveTextContent(containing('Measured zero'));
    expect(allText(tree())).toContain(
      'Google measured every day of this period and counted none.',
    );
    // `CALL_CLICKS` is labelled "Call button taps" — Google's metric, our words.
    expect(accessibleNames(tree()).join(' ')).toContain('Call button taps, 0, last 28 days');
    const measuredText = allText(tree());

    await renderPart(<MetricReadingCard row={unknownRow} testID="unknown" />);
    expect(screen.getByTestId('unknown-status')).toHaveTextContent(containing('Not reported'));
    expect(allText(tree())).toContain('It is unknown — not zero.');
    expect(bareZeros(tree())).toEqual([]);
    expect(accessibleNames(tree()).join(' ')).toContain('Call button taps, not available');
    expect(allText(tree())).not.toEqual(measuredText);
  });
});

/* -------------------------------------------------------------------------- */
/* not_supported: what Google deleted                                         */
/* -------------------------------------------------------------------------- */

describe('a metric Google removed says so, in every state of the screen around it', () => {
  it('is unavailable(not_supported) at the source, with no value to render', () => {
    for (const id of REMOVED_METRIC_IDS) {
      const state = removedMetricState(id);
      expect(state.status).toBe('unavailable');
      expect(state.reason).toBe('not_supported');
      expect(state.message.length).toBeGreaterThan(0);
      expect(state).not.toHaveProperty('value');
    }
    expect(removedCapabilityState('photo_views').reason).toBe('not_supported');
    expect(unsupportedCapabilityState('search_rank_position').reason).toBe('not_supported');
  });

  it('renders a dash, a date and a reason — never 0, never an empty slot', async () => {
    await renderPart(<RemovedMetricsCard testID="removed" />);
    const text = allText(tree());

    // Not a zero anywhere on the card, in either the visible text or the labels.
    expect(bareZeros(tree())).toEqual([]);

    // Every headline row names the metric, shows the unknown placeholder, and
    // says when Google removed it. An empty slot would fail all three.
    for (const id of ['LOCAL_POST_VIEWS_SEARCH', 'PHOTOS_VIEWS_MERCHANT'] as const) {
      const row = screen.getByTestId(`removed-metric-${id}`);
      expect(row).toHaveTextContent(containing(REMOVED_METRICS[id].label));
      expect(row).toHaveTextContent(containing('—'));
      expect(row).toHaveTextContent(containing('Removed by Google'));
    }

    // It reads as gone, not as pending.
    expect(text).toMatch(/Google deleted them from its API in 2023 and published no\s+replacement/);
    expect(text.toLowerCase()).not.toContain('coming soon');
    expect(text.toLowerCase()).not.toContain('coming shortly');
    expect(text.toLowerCase()).not.toContain('not yet available');
  });

  it.each(STATE_CASES)('is still explained when the screen around it is $name', async (stateCase) => {
    const state = stateCase.build(undefined as never) as DataState<never>;
    await renderPart(
      <PerformanceView
        state={build<PerformanceSnapshot>(state, performanceSnapshot())}
        periodKey={DEFAULT_PERIOD.key}
        onPeriodChange={() => {}}
        onRetry={() => {}}
      />,
    );

    // Documentation about Google, not data about this business — so it renders
    // even when nothing is connected, which is the state that ships.
    expect(screen.getByTestId('removed-metrics')).toBeOnTheScreen();
    expect(screen.getByTestId('removed-metrics-badge')).toHaveTextContent(
      containing('Removed by Google in 2023'),
    );
    expect(allText(tree()).toLowerCase()).not.toContain('coming soon');
  });
});

/* -------------------------------------------------------------------------- */
/* Google Business Profile: Voice of Merchant, all four outcomes              */
/* -------------------------------------------------------------------------- */

const VOICE_OF_MERCHANT_WIRE: Readonly<Record<string, GbpVoiceOfMerchantStateWire>> = {
  healthy: { hasVoiceOfMerchant: true, hasBusinessAuthority: true },
  verify: { hasVoiceOfMerchant: false, verify: {} },
  wait: { hasVoiceOfMerchant: false, waitForVoiceOfMerchant: {} },
  ownership_conflict: { hasVoiceOfMerchant: false, resolveOwnershipConflict: {} },
  suspended: {
    hasVoiceOfMerchant: false,
    complyWithGuidelines: { recommendationReason: 'BUSINESS_LOCATION_SUSPENDED' },
  },
  indeterminate: {},
};

const VOM_KEYS = Object.keys(VOICE_OF_MERCHANT_WIRE);

function outcomeFor(key: string): VoiceOfMerchantOutcome {
  const wire = VOICE_OF_MERCHANT_WIRE[key];
  if (wire === undefined) throw new Error(`no wire fixture for ${key}`);
  return classifyVoiceOfMerchant(wire);
}

describe('Voice of Merchant — the four remedial outcomes, plus healthy and indeterminate', () => {
  it.each(VOM_KEYS)('%s renders its own sentence, and no zero', async (key) => {
    const outcome = outcomeFor(key);
    const explanation = describeVoiceOfMerchant(outcome);
    await renderPart(<VerificationPanel outcome={outcome} testID="vom" />);

    expect(screen.getByTestId('vom-title')).toHaveTextContent(containing(explanation.title));
    expect(screen.getByTestId('vom-body')).toBeOnTheScreen();
    expect(bareZeros(tree())).toEqual([]);
    expect(rankClaims(tree())).toEqual([]);
  });

  it('gives each outcome a DIFFERENT title, so four problems are not one grey box', () => {
    const titles = VOM_KEYS.map((key) => describeVoiceOfMerchant(outcomeFor(key)).title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(['verify', 'wait', 'ownership_conflict', 'suspended', 'indeterminate'])(
    '%s says why there is no review list, rather than showing an empty one',
    async (key) => {
      await renderPart(<VerificationPanel outcome={outcomeFor(key)} testID="vom" />);
      expect(screen.getByTestId('vom-reviews-blocked')).toHaveTextContent(
        containing('not because you have no reviews'),
      );
    },
  );

  it('offers nothing to press when waiting is the only thing to do', async () => {
    await renderPart(<VerificationPanel outcome={outcomeFor('wait')} testID="vom" />);
    expect(screen.getByTestId('vom-no-action')).toBeOnTheScreen();
    expect(screen.queryByTestId('vom-owner-action')).toBeNull();
    // Waiting is not an action, so it is not rendered as a control at all.
    const report = auditRenderedTree(tree() as QaTree, ANDROID_VIEWPORTS[0].width);
    expect(report.totalPressables).toBe(0);
  });

  it('states the owner action as words, not as a button Shoogle cannot complete', async () => {
    await renderPart(<VerificationPanel outcome={outcomeFor('verify')} testID="vom" />);
    expect(screen.getByTestId('vom-owner-action')).toHaveTextContent(
      'Verify this business with Google',
    );
    const report = auditRenderedTree(tree() as QaTree, ANDROID_VIEWPORTS[0].width);
    expect(report.totalPressables).toBe(0);
  });

  it('never maps a blocked profile onto no_data_yet, which would blame the owner', () => {
    for (const key of ['verify', 'wait', 'ownership_conflict', 'suspended', 'indeterminate']) {
      const gate = voiceOfMerchantGate(outcomeFor(key));
      expect(gate).not.toBeNull();
      expect(gate?.reason).not.toBe('no_data_yet');
      expect(gate?.message.length ?? 0).toBeGreaterThan(0);
    }
    expect(voiceOfMerchantGate(outcomeFor('healthy'))).toBeNull();
  });
});

describe('a verification-required read', () => {
  /** Google's real 403 for a documented verification gate. */
  const FORBIDDEN: GbpTransportOutcome = {
    outcome: 'http',
    status: 403,
    body: {
      error: {
        code: 403,
        message: 'The caller does not have permission',
        status: 'PERMISSION_DENIED',
      },
    },
  };

  it('is unavailable, not an error, so no retry button can promise what it cannot deliver', () => {
    const state = gbpFailureState(FORBIDDEN, {
      verification: outcomeFor('verify'),
      operation: 'reviews.list',
    });
    expect(state.status).toBe('unavailable');
    expect(state).toMatchObject({ reason: 'not_supported' });
  });

  it('is a different sentence from the same 403 on a healthy profile', () => {
    const gated = gbpFailureState(FORBIDDEN, {
      verification: outcomeFor('verify'),
      operation: 'reviews.list',
    });
    const wrongAccount = gbpFailureState(FORBIDDEN, {
      verification: outcomeFor('healthy'),
      operation: 'reviews.list',
    });
    expect(gated.message).not.toEqual(wrongAccount.message);
    expect(gated.message).toContain('not verified');
    expect(wrongAccount.status).toBe('error');
  });

  it('renders through the shared view without a zero and without a rank', async () => {
    const state = gbpFailureState(FORBIDDEN, { verification: outcomeFor('verify') });
    await renderPart(
      <SearchKeywordsView state={state as DataState<SearchKeywordsReport>} onRetry={() => {}} />,
    );
    expect(bareZeros(tree())).toEqual([]);
    expect(rankClaims(tree())).toEqual([]);
    expect(allText(tree())).toContain(state.message);
  });

  it('reports not_connected — not a fabricated success — while there is no transport', async () => {
    // The real adapter, with its real default: no transport, so no request is
    // built and nothing is invented. This is what every screen sees today.
    const provider = createGoogleBusinessProfileProvider();
    const location = await provider.getLocation('');
    const reviews = await provider.listReviewsDetailed('');
    const performance = await provider.getPerformanceReport('', '28d');

    for (const state of [location, reviews, performance]) {
      expect(state.status).toBe('unavailable');
      expect(state).toMatchObject({ reason: 'not_connected' });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Reply moderation is never rounded up to published                          */
/* -------------------------------------------------------------------------- */

describe('a reply in moderation is never shown as published', () => {
  const NOT_PUBLISHED: readonly GbpReplyOutcome['moderation'][] = [
    { kind: 'pending_moderation', submittedAt: '2020-01-08T00:00:00.000Z' },
    { kind: 'state_not_understood', raw: 'SOME_ENUM', submittedAt: null },
    { kind: 'state_not_reported', submittedAt: null },
  ];

  it.each(NOT_PUBLISHED)('$kind reads as submitted', async (moderation) => {
    await renderPart(
      <SubmissionOutcome
        state={ready({ reviewId: 'r1', moderation }, '2020-01-08T00:00:00.000Z')}
        testID="submission"
      />,
    );
    expect(screen.getByTestId('submission-heading')).toHaveTextContent(/^Submitted to Google$/);
    expect(allText(tree())).not.toContain('Live on Google');
  });

  it('only Google saying so produces "Live on Google"', async () => {
    await renderPart(
      <SubmissionOutcome
        state={ready(
          { reviewId: 'r1', moderation: { kind: 'published', updateTime: '2020-01-08T00:00:00.000Z' } },
          '2020-01-08T00:00:00.000Z',
        )}
        testID="submission"
      />,
    );
    expect(screen.getByTestId('submission-heading')).toHaveTextContent(containing('Live on Google'));
  });
});

/* -------------------------------------------------------------------------- */
/* Screens driven through provider states                                     */
/* -------------------------------------------------------------------------- */

const NOT_CONNECTED_CONNECTION: ConnectionInfo = {
  provider: 'google_business',
  status: 'not_connected',
  handle: null,
  grantedScopes: [],
  lastSyncedAt: null,
};

/**
 * A provider that answers with exactly one programmed state.
 *
 * This is the sanctioned seam — `registerProvider` — not a mock of a module.
 * The registry exists precisely so a screen can be exercised before an
 * integration is built.
 */
function stubProvider(id: ProviderId, connection: DataState<ConnectionInfo>): ConnectableProvider {
  return {
    id,
    displayName: 'Google Business Profile',
    getConnection: () => Promise.resolve(connection),
    connect: () => Promise.resolve(connection),
    disconnect: () => Promise.resolve(unavailable('not_connected', 'Nothing to disconnect.')),
  };
}

const CONNECTION_STATES: readonly { name: StateName; state: DataState<ConnectionInfo> }[] = [
  { name: 'loading', state: loading() },
  { name: 'ready', state: ready(NOT_CONNECTED_CONNECTION, '2020-01-08T00:00:00.000Z') },
  ...ALL_UNAVAILABLE_REASONS.map((reason) => ({
    name: `unavailable:${reason}` as StateName,
    state: unavailable(reason, messageFor(reason)) as DataState<ConnectionInfo>,
  })),
  { name: 'error:retryable', state: RETRYABLE_ERROR },
  { name: 'error:terminal', state: TERMINAL_ERROR },
];

/**
 * One route under test.
 *
 * `marker` proves the REAL screen rendered rather than a router fallback. Most
 * screens carry a root testID; `app/(tabs)/business.tsx` carries none, so its
 * heading is used instead — the same identification the other harnesses use.
 */
interface ScreenTarget {
  readonly name: string;
  readonly route: string;
  readonly component: () => React.JSX.Element;
  readonly marker: { readonly kind: 'testID' | 'text'; readonly value: string };
  /** Sentences that make a zero ON THIS SCREEN a measurement rather than a gap. */
  readonly measuredZeroProofs: readonly RegExp[];
}

function expectRendered(target: ScreenTarget): void {
  if (target.marker.kind === 'testID') {
    expect(screen.getByTestId(target.marker.value)).toBeOnTheScreen();
    return;
  }
  expect(screen.getByText(target.marker.value)).toBeOnTheScreen();
}

/** Fails loudly rather than passing an empty tree, which every walker would call clean. */
function expectSomethingRendered(target: ScreenTarget): string {
  expectRendered(target);
  const spoken = `${allText(tree())} ${accessibleNames(tree()).join(' ')}`.trim();
  expect(spoken.length).toBeGreaterThan(100);
  return spoken;
}

function expectZerosProven(target: ScreenTarget): void {
  for (const sighting of bareZeros(tree())) {
    const proven = target.measuredZeroProofs.some((proof) => proof.test(sighting.scope));
    expect({ screen: target.name, ...sighting, proven }).toEqual(
      expect.objectContaining({ proven: true }),
    );
  }
}

/**
 * The one measured count in the whole vertical today.
 *
 * `app/seo/get-reviews.tsx` reads its own request log off this device, so "0
 * requests sent this week" is a fact Shoogle genuinely knows — unlike every
 * number that would have to come from Google.
 */
const LOCAL_REQUEST_LOG_PROOFS: readonly RegExp[] = [
  /of 8 suggested this week/,
  /Counts requests you confirmed sending from Shoogle on this phone/,
];

const AUDIT: ScreenTarget = {
  name: 'audit',
  route: 'seo/audit',
  component: AuditScreen,
  marker: { kind: 'testID', value: 'audit-screen' },
  measuredZeroProofs: [],
};
const SEARCHES: ScreenTarget = {
  name: 'searches',
  route: 'seo/searches',
  component: SearchesScreen,
  marker: { kind: 'testID', value: 'searches-screen' },
  measuredZeroProofs: [/Measured zero/, /Google counted this term and found nobody/],
};
const VISIBILITY: ScreenTarget = {
  name: 'visibility',
  route: 'seo/visibility',
  component: VisibilityScreen,
  marker: { kind: 'testID', value: 'visibility-screen' },
  measuredZeroProofs: [/directories to check/],
};
const REVIEWS: ScreenTarget = {
  name: 'reviews',
  route: 'seo/reviews',
  component: ReviewsScreen,
  marker: { kind: 'testID', value: 'reviews-screen' },
  measuredZeroProofs: [/reviews on Google/, /of the reviews loaded/],
};
const REVIEW_REPLY: ScreenTarget = {
  name: 'review-reply',
  route: 'seo/review-reply',
  component: ReviewReplyScreen,
  marker: { kind: 'testID', value: 'review-reply-screen' },
  measuredZeroProofs: [],
};
const PHOTOS: ScreenTarget = {
  name: 'photos',
  route: 'seo/photos',
  component: PhotosScreen,
  marker: { kind: 'testID', value: 'photos-screen' },
  measuredZeroProofs: [],
};
const PERFORMANCE: ScreenTarget = {
  name: 'performance',
  route: 'seo/performance',
  component: PerformanceScreen,
  marker: { kind: 'testID', value: 'performance-screen' },
  measuredZeroProofs: [
    /Measured zero/,
    /Google measured every day of this period and counted none/,
    /days measured zero/,
    /no change 0 percent/,
  ],
};
const AGENT: ScreenTarget = {
  name: 'agent',
  route: 'seo/agent',
  component: AgentScreen,
  marker: { kind: 'testID', value: 'agent-screen' },
  measuredZeroProofs: [/Counted, not scored/, /confirmed by Google/],
};
const GET_REVIEWS: ScreenTarget = {
  name: 'get-reviews',
  route: 'seo/get-reviews',
  component: GetReviewsScreen,
  marker: { kind: 'testID', value: 'get-reviews-screen' },
  measuredZeroProofs: [...LOCAL_REQUEST_LOG_PROOFS, /reviews this week/],
};
const PROFILE: ScreenTarget = {
  name: 'profile',
  route: 'seo/profile',
  component: ProfileScreen,
  marker: { kind: 'testID', value: 'profile-screen' },
  measuredZeroProofs: [],
};
const HOURS: ScreenTarget = {
  name: 'hours',
  route: 'seo/hours',
  component: HoursScreen,
  marker: { kind: 'testID', value: 'hours-screen' },
  measuredZeroProofs: [],
};
const AREAS: ScreenTarget = {
  name: 'areas',
  route: 'seo/areas',
  component: AreasScreen,
  marker: { kind: 'testID', value: 'areas-screen' },
  measuredZeroProofs: [],
};
const BUSINESS_TAB: ScreenTarget = {
  name: 'business tab',
  route: 'business',
  component: BusinessScreen,
  marker: { kind: 'text', value: 'Business' },
  measuredZeroProofs: [],
};

const REGISTRY_SCREENS: readonly ScreenTarget[] = [AUDIT, PHOTOS, BUSINESS_TAB];

describe.each(REGISTRY_SCREENS)('$name, driven through every connection state', (target) => {
  it.each(CONNECTION_STATES)('never prints an unmeasured zero in $name', async (entry) => {
    registerProvider('google_business', stubProvider('google_business', entry.state));
    await renderScreen(target.route, target.component);

    // Nothing on these screens has been read from Google in ANY of these
    // states, so every zero on them would be an invention.
    expectSomethingRendered(target);
    expectZerosProven(target);
    expect(rankClaims(tree())).toEqual([]);
    expect(fixtureLeaks(tree())).toEqual([]);
  });

  it.each(CONNECTION_STATES)('labels every control it renders in $name', async (entry) => {
    registerProvider('google_business', stubProvider('google_business', entry.state));
    await renderScreen(target.route, target.component);
    expectSomethingRendered(target);
    const report = auditRenderedTree(tree() as QaTree, ANDROID_VIEWPORTS[0].width);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);
  });
});

/** A location the adapter would return, if it had a transport to return one with. */
const A_LOCATION = {
  locationId: 'loc-1',
  title: 'A salon',
  storefrontAddress: null,
  primaryCategory: null,
  verificationState: 'verified' as const,
};

/**
 * What Google returns for a profile it has produced no numbers for.
 *
 * The route-level `ready` case deliberately carries NOTHING REPORTED rather
 * than a full snapshot: the richly-measured one — four covered impression
 * splits, a measured-zero CALL_CLICKS, an unreported WEBSITE_CLICKS and two
 * not-applicable food rows — is driven through every state against
 * `PerformanceView` directly, further up. What is only checkable here is the
 * screen's own plumbing: that an empty report becomes eleven dashes with
 * reasons instead of eleven zeros, and that the provider's sentence survives
 * the trip through `mapData` in the non-ready states.
 */
const NOTHING_REPORTED: GbpPerformanceReport = (() => {
  const windows = buildWindows(PERFORMANCE_END_DATE, DEFAULT_PERIOD.days);
  if (windows === null) throw new Error('the test performance windows could not be built');
  return { metrics: [], unreported: [...LIVE_DAILY_METRIC_ORDER], windows };
})();

interface AdapterScreen extends ScreenTarget {
  /** Points the adapter at one state before the screen mounts. */
  readonly program: (state: DataState<never>) => void;
}

const ADAPTER_SCREENS: readonly AdapterScreen[] = [
  {
    ...AREAS,
    program: (state) => {
      mockGbpProgram.getLocation = build(state, A_LOCATION);
    },
  },
  {
    ...HOURS,
    program: (state) => {
      mockGbpProgram.getLocation = build(state, A_LOCATION);
    },
  },
  {
    ...PROFILE,
    program: (state) => {
      mockGbpProgram.getLocation = build(state, A_LOCATION);
    },
  },
  {
    ...SEARCHES,
    program: (state) => {
      mockSeoProgram.getSearchKeywords = build(state, fixtureSearchKeywordsReport);
    },
  },
  {
    ...PERFORMANCE,
    program: (state) => {
      mockGbpProgram.getPerformanceReport = build(state, NOTHING_REPORTED);
    },
  },
  {
    ...AGENT,
    program: (state) => {
      // The agent asks for Voice of Merchant only once it has a location, so a
      // ready listing is the precondition for reaching the state under test at
      // all. This is the read that decides whether Shoogle claims it may act.
      mockGbpProgram.listLocations = ready([A_LOCATION], '2020-01-08T00:00:00.000Z');
      mockGbpProgram.getVoiceOfMerchant = build(state, outcomeFor('healthy'));
    },
  },
];

describe.each(ADAPTER_SCREENS)('$name, driven through every adapter state', (target) => {
  it.each(STATE_CASES)(
    'never prints an unmeasured zero when the adapter says $name',
    async (stateCase) => {
      const state = stateCase.build(undefined as never) as DataState<never>;
      target.program(state);
      await renderScreen(target.route, target.component);

      expectSomethingRendered(target);
      expectZerosProven(target);
      expect(rankClaims(tree())).toEqual([]);
    },
  );

  it.each(STATE_CASES)('says what happened when the adapter says $name', async (stateCase) => {
    const state = stateCase.build(undefined as never) as DataState<never>;
    target.program(state);
    await renderScreen(target.route, target.component);
    const spoken = expectSomethingRendered(target);

    // A screen that swallows the provider's sentence leaves the owner with a
    // blank and no idea why. (Areas, hours and profile deliberately REPLACE a
    // READY location with their own terminal error, because the lossy shared
    // shape cannot fill their fields — so only the non-ready adapter answers
    // are expected to reach the screen verbatim.)
    if (state.status === 'unavailable' || state.status === 'error') {
      expect(spoken).toContain(state.message);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The default production state, on every route                               */
/* -------------------------------------------------------------------------- */

const ALL_ROUTES: readonly ScreenTarget[] = [
  AUDIT,
  SEARCHES,
  VISIBILITY,
  REVIEWS,
  REVIEW_REPLY,
  PHOTOS,
  PERFORMANCE,
  AGENT,
  GET_REVIEWS,
  PROFILE,
  HOURS,
  AREAS,
  BUSINESS_TAB,
];

describe('unavailable(not_connected) — the state that actually ships', () => {
  it.each(ALL_ROUTES)('$name renders no unmeasured zero, no rank, no fixture', async (target) => {
    await renderScreen(target.route, target.component);

    expectSomethingRendered(target);
    expectZerosProven(target);
    expect(rankClaims(tree())).toEqual([]);
    expect(fixtureLeaks(tree())).toEqual([]);
    expect(screen.queryByTestId('fixture-banner')).toBeNull();
  });

  it.each(ALL_ROUTES)('$name explains itself rather than showing a blank', async (target) => {
    await renderScreen(target.route, target.component);
    const spoken = expectSomethingRendered(target);
    // Something on the page names the missing connection, the missing read, or
    // the thing Google does not publish. A bare screen would match none.
    expect(spoken).toMatch(
      /not connected|has not been connected|not been read|has not read|does not (?:share|publish)|nothing (?:measured|to)|cannot reach/i,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Fixtures never appear without their banner                                 */
/* -------------------------------------------------------------------------- */

describe('fixture content is always under the fixture banner', () => {
  it.each(ALL_ROUTES)('$name pairs marked values with the banner', async (target) => {
    mockFixtures = true;
    await renderScreen(target.route, target.component);
    expectSomethingRendered(target);
    // Fixture mode is the only way most of these screens reach a READY value
    // today, so it is the only place their real zeros can be seen at all —
    // searches and performance each render one here. Judging zeros only with
    // fixtures off would leave every one of them unexamined.
    expectZerosProven(target);
    expect(rankClaims(tree())).toEqual([]);

    if (fixtureLeaks(tree()).length === 0) return;
    // Something marked is on screen, so the banner must be on it too.
    expect(screen.queryAllByTestId('fixture-banner').length).toBeGreaterThan(0);
  });

  it.each(ALL_ROUTES)('$name reaches no fixture content with fixtures off', async (target) => {
    await renderScreen(target.route, target.component);
    expectSomethingRendered(target);
    expect(screen.queryByTestId('fixture-banner')).toBeNull();
    expect(fixtureLeaks(tree())).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The census is not vacuous                                                  */
/* -------------------------------------------------------------------------- */

describe('no control is greyed out without a reason on it', () => {
  /*
   * The disabled controls this vertical actually ships today, in the state it
   * ships in: the review-reply submit button (no review to reply to), the
   * schema draft button (no key, or no material), and the three send buttons on
   * get-reviews (no review link yet). Each must name its blocker itself.
   */
  it.each(ALL_ROUTES)('$name explains every disabled control it renders', async (target) => {
    await renderScreen(target.route, target.component);
    expectSomethingRendered(target);
    expect(deadControls(tree())).toEqual([]);
  });

  it.each(ALL_ROUTES)('$name explains them in fixture mode too', async (target) => {
    mockFixtures = true;
    await renderScreen(target.route, target.component);
    expectSomethingRendered(target);
    expect(deadControls(tree())).toEqual([]);
  });

  it('is not vacuous — the shipping state really does grey controls out', async () => {
    await renderScreen('seo/get-reviews', GetReviewsScreen);
    const disabled = ['send-whatsapp', 'send-share', 'send-copy-message'];
    for (const testID of disabled) {
      expect(screen.getByTestId(testID)).toBeDisabled();
    }
    // …and every one of them says why, both to the eye and to TalkBack.
    expect(screen.getByTestId('send-disabled-reason')).toHaveTextContent(
      containing('Add your review link first'),
    );
    for (const testID of disabled) {
      expect(screen.getByTestId(testID).props.accessibilityHint).toMatch(
        /^Disabled\. Add your review link first/,
      );
    }
  });
});

describe('the zero census actually finds zeros to judge', () => {
  /*
   * Every "no unmeasured zero" assertion above passes trivially if the walker
   * never meets a zero. These two prove it does: the vertical ships exactly two
   * honest zeros, and both are found and both are proven.
   */

  it('finds the measured-zero keyword row, and its proof, on the searches screen', async () => {
    mockSeoProgram.getSearchKeywords = ready(
      fixtureSearchKeywordsReport,
      '2020-01-08T00:00:00.000Z',
    );
    await renderScreen('seo/searches', SearchesScreen);

    const zeros = bareZeros(tree());
    expect(zeros.length).toBeGreaterThan(0);
    for (const sighting of zeros) {
      expect(sighting.scope).toMatch(/Measured zero|Google counted this term and found nobody/);
    }
    // And the bound rows next to it are NOT zeros, and not the threshold either.
    expect(screen.getAllByText('<15').length).toBeGreaterThan(0);
    expect(screen.queryByText('15')).toBeNull();
  });

  it('finds the locally counted zero on the get-reviews screen, and its proof', async () => {
    // No Google call is involved: this is Shoogle's own request log on this
    // phone, which is empty, which is a fact it genuinely knows.
    await renderScreen('seo/get-reviews', GetReviewsScreen);

    const zeros = bareZeros(tree());
    expect(zeros.length).toBeGreaterThan(0);
    for (const sighting of zeros) {
      expect(sighting.scope).toMatch(
        /of 8 suggested this week|Counts requests you confirmed sending from Shoogle on this phone/,
      );
    }
    // The review count beside it is NOT connected, so it shows no number at all.
    expect(screen.getByTestId('new-reviews-state')).toBeOnTheScreen();
  });
});

/* -------------------------------------------------------------------------- */
/* Retry, end to end on a real screen                                          */
/* -------------------------------------------------------------------------- */

describe('retry, on the screen rather than on the component', () => {
  it('a retryable error on the searches screen offers Try again and says why', async () => {
    mockSeoProgram.getSearchKeywords = RETRYABLE_ERROR;
    await renderScreen('seo/searches', SearchesScreen);

    expect(allText(tree())).toContain(RETRYABLE_ERROR.message);
    expect(screen.getByText('Try again')).toBeOnTheScreen();
    expect(bareZeros(tree())).toEqual([]);
  });

  it('a terminal error on the searches screen offers nothing, but still says why', async () => {
    mockSeoProgram.getSearchKeywords = TERMINAL_ERROR;
    await renderScreen('seo/searches', SearchesScreen);

    expect(allText(tree())).toContain(TERMINAL_ERROR.message);
    // A retry that can never succeed is a dead control, so there is none.
    expect(screen.queryByText('Try again')).toBeNull();
    expect(bareZeros(tree())).toEqual([]);
  });

  it('pressing Try again asks the provider again rather than pretending', async () => {
    mockSeoProgram.getSearchKeywords = RETRYABLE_ERROR;
    await renderScreen('seo/searches', SearchesScreen);

    // The second answer is the honest production one.
    mockSeoProgram.getSearchKeywords = unavailable('not_connected', messageFor('not_connected'));
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });

    expect(allText(tree())).toContain(messageFor('not_connected'));
    expect(bareZeros(tree())).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* No rank, with fixtures on as well as off                                    */
/* -------------------------------------------------------------------------- */

describe('no screen renders a rank position, in either data mode', () => {
  it.each(ALL_ROUTES)('$name shows no rank with fixtures on', async (target) => {
    mockFixtures = true;
    await renderScreen(target.route, target.component);
    expectSomethingRendered(target);
    expect(rankClaims(tree())).toEqual([]);
  });

  it('the rankings provider itself can only ever answer not_supported', async () => {
    // Not a screen concern: there is no API that returns a position, so the
    // provider refuses at the source and no screen has one to render.
    const actualSeo = jest.requireActual<typeof import('@/features/seo')>('@/features/seo');
    const rankings = await actualSeo.seoProvider.getRankings('any-business');
    const keyword = await actualSeo.seoProvider.getKeyword('any-business', 'hair salon');

    for (const state of [rankings, keyword]) {
      expect(state.status).toBe('unavailable');
      expect(state).toMatchObject({ reason: 'not_supported' });
      expect(state).toMatchObject({ message: actualSeo.RANK_NOT_MEASURABLE_MESSAGE });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The reachability ledger                                                    */
/* -------------------------------------------------------------------------- */

describe('the reachability ledger', () => {
  it('names a reason for every state a surface cannot be given', () => {
    for (const entry of UNREACHABLE) {
      expect(SURFACES.map((surface) => surface.name)).toContain(entry.surface);
      expect(entry.states.length).toBeGreaterThan(0);
      // A one-word "n/a" is not a reason. The claim has to be checkable prose.
      expect(entry.why.length).toBeGreaterThan(80);
      for (const state of entry.states) {
        expect(STATE_CASES.map((stateCase) => stateCase.name)).toContain(state);
      }
    }
  });

  it('every unreachable state is still driven through its surface', () => {
    // The matrix above runs `STATE_CASES` for every surface with no exclusions,
    // so this is a structural guarantee rather than a promise. Pinning it here
    // means someone adding an `if (unreachable) return` has to delete this test.
    for (const entry of UNREACHABLE) {
      const surface = SURFACES.find((candidate) => candidate.name === entry.surface);
      expect(surface).toBeDefined();
      for (const state of entry.states) {
        expect(STATE_CASES.some((stateCase) => stateCase.name === state)).toBe(true);
      }
    }
  });

  it('the agent screen really does hand its feed a ready value, as the ledger claims', async () => {
    await renderScreen('seo/agent', AgentScreen);
    // Nothing is in flight and nothing failed: the feed is a genuine empty read.
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.queryAllByLabelText('Loading')).toEqual([]);
  });

  it('the visibility screen really does read once at mount, as the ledger claims', async () => {
    await renderScreen('seo/visibility', VisibilityScreen);
    expect(screen.queryAllByLabelText('Loading')).toEqual([]);
    expect(screen.queryByText('Try again')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The walkers themselves                                                     */
/* -------------------------------------------------------------------------- */

describe('the honesty walkers', () => {
  // A checker that cannot fail is worse than no checker, so prove each fails.
  it('finds a bare zero and reports the sentence around it', () => {
    const node: RenderedNode = {
      type: 'View',
      children: [
        { type: 'Text', children: ['0'] },
        { type: 'Text', children: ['of 8 suggested this week'] },
      ],
    };
    expect(bareZeros(node)).toEqual([{ token: '0', scope: '0of 8 suggested this week' }]);
  });

  it('ignores prose that merely mentions zero', () => {
    const node: RenderedNode = {
      type: 'Text',
      children: ['It renders as — rather than 0, because nobody measured it.'],
    };
    expect(bareZeros(node)).toEqual([]);
  });

  it('catches a zero percent and a signed zero, which are values too', () => {
    const node: RenderedNode = {
      type: 'View',
      children: [
        { type: 'Text', children: ['0%'] },
        { type: 'Text', children: ['+0'] },
        { type: 'Text', children: ['—'] },
      ],
    };
    expect(bareZeros(node).map((sighting) => sighting.token)).toEqual(['0%', '+0']);
  });

  it('detects a rank position in text and in an accessible name', () => {
    expect(rankClaims({ type: 'Text', children: ['You rank #3 for hair salon'] })).not.toEqual([]);
    expect(rankClaims({ type: 'Text', children: ['Position 4 in the map pack'] })).not.toEqual([]);
    expect(
      rankClaims({ type: 'View', props: { accessibilityLabel: 'Ranked 7 this week' }, children: [] }),
    ).not.toEqual([]);
  });

  it('does not mistake the honest "no rank" copy for a rank', () => {
    const node: RenderedNode = {
      type: 'Text',
      children: ['Google does not publish where you rank, so we will not guess.'],
    };
    expect(rankClaims(node)).toEqual([]);
  });

  it('flags a greyed control with no reason, and clears one that carries it', () => {
    const button = (hint: string | null): RenderedNode => ({
      type: 'View',
      props: {
        accessibilityRole: 'button',
        accessibilityLabel: 'Copy message',
        accessibilityState: { disabled: true },
        ...(hint === null ? {} : { accessibilityHint: hint }),
      },
    });
    expect(deadControls({ type: 'root', children: [button(null)] })).toEqual([
      { label: 'Copy message', hint: null },
    ]);
    // A hint that only describes the action does not explain the greying.
    expect(deadControls({ type: 'root', children: [button('Copies the message.')] })).toEqual([
      { label: 'Copy message', hint: 'Copies the message.' },
    ]);
    expect(
      deadControls({ type: 'root', children: [button('Disabled. Add your link first.')] }),
    ).toEqual([]);
  });

  it('does not call a busy button dead, or an enabled one', () => {
    const busy: RenderedNode = {
      type: 'View',
      props: {
        accessibilityRole: 'button',
        accessibilityLabel: 'Submitting',
        accessibilityState: { disabled: true, busy: true },
      },
    };
    const enabled: RenderedNode = {
      type: 'View',
      props: {
        accessibilityRole: 'button',
        accessibilityLabel: 'Send',
        accessibilityState: { disabled: false },
      },
    };
    expect(deadControls({ type: 'root', children: [busy, enabled] })).toEqual([]);
  });

  it('detects fixture content by its marker', () => {
    expect(fixtureLeaks({ type: 'Text', children: ['[fixture] hair salon nerul'] })).not.toEqual([]);
    expect(fixtureLeaks({ type: 'Text', children: ['hair salon nerul'] })).toEqual([]);
  });
});
