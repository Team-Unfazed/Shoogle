/**
 * `app/seo/agent.tsx` and `features/gbp/components/agent/**` — the Shoogle
 * Agent.
 *
 * THE RULES UNDER TEST
 * --------------------
 * 1. THE AGENT IS NEVER "ACTIVE" BY DEFAULT. The competitor's card carries a
 *    permanent green "Active" pill. The word must not appear anywhere on this
 *    screen, in any state, and with no Google credentials the status must read
 *    "cannot act — not connected".
 * 2. UNKNOWN IS NEVER ZERO — AND ZERO IS NEVER UNKNOWN. The runway renders "0"
 *    only when the schedule was genuinely read and was genuinely empty, and an
 *    em dash otherwise. Both directions are asserted, because collapsing either
 *    into the other is the failure this project exists to avoid.
 * 3. NO ACTION IS A SUCCESS UNTIL GOOGLE SAYS SO. A submitted review reply
 *    renders "Submitted, pending review" and never "published". An action with
 *    an unconfirmed outcome renders "Result unknown" and says it is not a
 *    success.
 * 4. ALL SIX VOICE OF MERCHANT OUTCOMES ARE FIRST-CLASS. Each produces its own
 *    headline, and none of them lets the agent act.
 * 5. STOP IS ONE TAP, AND IT IS NOT OPTIMISTIC. The button does not report a
 *    pause the device store refused to save, and it will not act while it
 *    cannot read whether it was already paused.
 * 6. NO DEAD CONTROLS AND NO RANK. Every control does something or says why it
 *    cannot, and no rank position is rendered anywhere.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useState } from 'react';

import AgentScreen from '@/app/seo/agent';
import { Text, ToastProvider } from '@/components/ui';
import {
  AGENT_PAUSE_STORAGE_KEY,
  ActionsFeed,
  AgentStatusCard,
  PauseCard,
  RunwayCard,
  computeRunway,
  describeActionResult,
  describeAgentStatus,
  parsePausePreference,
  resolveAgentStatus,
  sortActionsNewestFirst,
  summariseActions,
  useAgentPause,
  type AgentAction,
  type AgentPauseStorage,
  type AgentScheduledItem,
  type AgentTarget,
} from '@/features/gbp/components/agent';
import type { VoiceOfMerchantOutcome } from '@/features/gbp';
import {
  FIXTURE_AGENT_TODAY,
  fixtureAgentActions,
  fixtureAgentSchedule,
  fixtureAgentTarget,
} from '@/fixtures/gbp-agent';
import { failed, loading, ready, unavailable } from '@/lib/state/DataState';
import { ThemeProvider } from '@/theme';

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

/**
 * The screen's pause hook reads the device store. The official in-memory mock
 * is registered in `jest.setup.ts`; clearing it between tests keeps one test's
 * pause out of the next one's status card.
 */
beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(() => {
  mockFixtures = false;
});

function renderScreen() {
  return renderRouter(
    {
      'seo/agent': () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>
            <AgentScreen />
          </ToastProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: '/seo/agent' },
  );
}

/** RNTL 14 returns a promise from `render`; every render is awaited. */
async function renderView(element: React.JSX.Element) {
  return render(
    <ThemeProvider forceScheme="light">
      <ToastProvider>{element}</ToastProvider>
    </ThemeProvider>,
  );
}

const FIXED_NOW = '2020-01-15T00:00:00.000Z';
const HEALTHY: VoiceOfMerchantOutcome = {
  kind: 'has_voice_of_merchant',
  hasBusinessAuthority: true,
};
const TARGET: AgentTarget = fixtureAgentTarget;

/** A resolution built from real inputs rather than hand-assembled. */
function resolutionFor(overrides: {
  target?: ReturnType<typeof ready<AgentTarget>> | ReturnType<typeof unavailable>;
  voiceOfMerchant?: VoiceOfMerchantOutcome;
  paused?: boolean;
}) {
  return resolveAgentStatus({
    target: overrides.target ?? ready(TARGET, FIXED_NOW),
    voiceOfMerchant: ready(overrides.voiceOfMerchant ?? HEALTHY, FIXED_NOW),
    pause: ready({ paused: overrides.paused ?? false, changedAt: null }, FIXED_NOW),
    quota: { kind: 'unknown' },
  });
}

/* ========================================================================== */
/* 1. Today: cannot act, and the screen is built for it                       */
/* ========================================================================== */

describe('with no Google credentials — the default state', () => {
  it('reports "cannot act — not connected" rather than claiming to be running', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-status-headline')).toHaveTextContent(
        'Cannot act — not connected',
      );
    });
    expect(screen.getByTestId('agent-status-badge')).toHaveTextContent('Cannot act');
  });

  it('never renders the word "Active" anywhere, in any casing', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-status-badge')).toBeOnTheScreen();
    });
    // The competitor's pill reads "Active" whatever is true. There is no code
    // path here that can produce it.
    expect(screen.queryByText(/\bactive\b/i)).toBeNull();
  });

  it('carries the provider’s real reason, not a generic failure', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(
        screen.getAllByText(/Google has not approved our API access/).length,
      ).toBeGreaterThan(0);
    });
  });

  it('shows an unknown runway — an em dash, never a zero and never "1 more week"', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-runway-count')).toHaveTextContent('—');
    });
    expect(screen.getByTestId('agent-runway-headline')).toHaveTextContent('Runway unknown');
    expect(screen.getByTestId('agent-runway-basis')).toHaveTextContent('Not known');
    expect(screen.getByTestId('agent-runway-count')).not.toHaveTextContent('0');
    expect(screen.queryByText(/1 more week/i)).toBeNull();
    expect(screen.getByTestId('agent-runway-last-published')).toHaveTextContent(
      /Last published: not known/,
    );
  });

  it('renders no fixture banner, because nothing on screen is fixture data', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-status-badge')).toBeOnTheScreen();
    });
    expect(screen.queryByTestId('fixture-banner')).toBeNull();
  });

  it('renders no rank position and no invented score', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-status-badge')).toBeOnTheScreen();
    });
    expect(screen.queryByText(/#\d/)).toBeNull();
    expect(screen.queryByText(/\d+\s*\/\s*100/)).toBeNull();
    expect(screen.queryByText(/^\d+%$/)).toBeNull();
  });
});

/* ========================================================================== */
/* 2. The empty feed                                                          */
/* ========================================================================== */

describe('the empty actions feed', () => {
  it('says nothing has happened, and says why it is empty', async () => {
    await renderScreen();

    const empty = await screen.findByTestId('agent-feed-empty');
    expect(empty).toBeOnTheScreen();
    expect(screen.getByText('Nothing has happened yet')).toBeOnTheScreen();
    expect(
      screen.getByText(/Empty because Shoogle has never been able to act/),
    ).toBeOnTheScreen();
  });

  it('describes the four kinds of work in the FUTURE tense, claiming nothing happened', async () => {
    await renderScreen();

    await screen.findByTestId('agent-feed-empty');

    for (const label of ['Posts', 'Photos and videos', 'Review replies', 'Opening hours']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    // Four promises of what "done" will look like — one per kind of work.
    expect(screen.getAllByText('How you will know it worked')).toHaveLength(4);

    // Nothing in the empty state may read as an accomplished action.
    expect(screen.queryByText(/New Post Published/i)).toBeNull();
    expect(screen.queryByText(/Media Published/i)).toBeNull();
  });

  it('does not render an actions summary when there are no actions to summarise', async () => {
    await renderScreen();

    await screen.findByTestId('agent-feed-empty');
    expect(screen.queryByTestId('agent-feed-summary')).toBeNull();
  });
});

/* ========================================================================== */
/* 3. Runway: measured zero vs unknown                                        */
/* ========================================================================== */

describe('the runway is derived, and a counted zero is not an unknown', () => {
  it('renders a real 0 with a "Counted" basis when the schedule was read and is empty', async () => {
    const runway = computeRunway({
      scheduled: ready<AgentScheduledItem[]>([], FIXED_NOW),
      lastPublished: { kind: 'never' },
      today: FIXTURE_AGENT_TODAY,
    });
    expect(runway.kind).toBe('nothing_scheduled');

    await renderView(<RunwayCard runway={runway} testID="runway" />);

    expect(screen.getByTestId('runway-count')).toHaveTextContent('0');
    expect(screen.getByTestId('runway-basis')).toHaveTextContent('Counted');
    expect(screen.getByText(/This is a counted zero, not a gap in what Shoogle knows/)).
      toBeOnTheScreen();
    // A measured "never published" is a fact, and is not the same as unknown.
    expect(screen.getByTestId('runway-last-published')).toHaveTextContent(
      /Last published: never/,
    );
  });

  it('renders an em dash with a "Not known" basis when the schedule could not be read', async () => {
    const runway = computeRunway({
      scheduled: unavailable('not_connected', 'Nothing is connected.'),
      lastPublished: { kind: 'unknown', reason: 'Never asked.' },
      today: FIXTURE_AGENT_TODAY,
    });
    expect(runway.kind).toBe('unknown');

    await renderView(<RunwayCard runway={runway} testID="runway" />);

    expect(screen.getByTestId('runway-count')).toHaveTextContent('—');
    expect(screen.getByTestId('runway-count')).not.toHaveTextContent('0');
    expect(screen.getByTestId('runway-basis')).toHaveTextContent('Not known');
    expect(screen.getByTestId('runway-last-published')).toHaveTextContent(
      /Last published: not known/,
    );
  });

  it('computes days of cover by subtraction, not by assumption', () => {
    const runway = computeRunway({
      scheduled: ready<AgentScheduledItem[]>(fixtureAgentSchedule, FIXED_NOW),
      lastPublished: { kind: 'at', at: '2020-01-12T00:00:00.000Z' },
      today: FIXTURE_AGENT_TODAY,
    });

    expect(runway.kind).toBe('scheduled');
    if (runway.kind !== 'scheduled') throw new Error('expected a scheduled runway');
    // 2020-01-22 is seven days after 2020-01-15. The 7 is arithmetic.
    expect(runway.daysOfCover).toBe(7);
    expect(runway.itemCount).toBe(3);
    expect(runway.overdue).toBe(false);
  });

  it('refuses to shorten the runway when an item carries an unreadable date', () => {
    const runway = computeRunway({
      scheduled: ready<AgentScheduledItem[]>(
        [
          { id: 'a', kind: 'publish_post', headline: 'Good', dueAt: '2020-01-20' },
          { id: 'b', kind: 'publish_post', headline: 'Bad', dueAt: 'not-a-date' },
        ],
        FIXED_NOW,
      ),
      lastPublished: { kind: 'never' },
      today: FIXTURE_AGENT_TODAY,
    });

    // Silently ignoring the bad row would show a shorter, confident runway.
    expect(runway.kind).toBe('unknown');
  });

  it('reports an overdue schedule as overdue rather than as cover', () => {
    const runway = computeRunway({
      scheduled: ready<AgentScheduledItem[]>(
        [{ id: 'a', kind: 'publish_post', headline: 'Late', dueAt: '2020-01-10' }],
        FIXED_NOW,
      ),
      lastPublished: { kind: 'never' },
      today: FIXTURE_AGENT_TODAY,
    });

    if (runway.kind !== 'scheduled') throw new Error('expected a scheduled runway');
    expect(runway.overdue).toBe(true);
    expect(runway.daysOfCover).toBe(0);
  });
});

/* ========================================================================== */
/* 4. Voice of Merchant — all six outcomes                                    */
/* ========================================================================== */

describe('every Voice of Merchant outcome is a first-class state', () => {
  const OUTCOMES: { outcome: VoiceOfMerchantOutcome; expect: RegExp }[] = [
    { outcome: { kind: 'verify', hasPendingVerification: null }, expect: /not verified with google/i },
    { outcome: { kind: 'wait_for_voice_of_merchant' }, expect: /still processing this profile/i },
    { outcome: { kind: 'resolve_ownership_conflict' }, expect: /someone else manages this listing/i },
    {
      outcome: { kind: 'comply_with_guidelines', reason: 'BUSINESS_LOCATION_SUSPENDED' },
      expect: /restricted this profile/i,
    },
    { outcome: { kind: 'indeterminate' }, expect: /did not report this profile/i },
  ];

  it.each(OUTCOMES)('names $outcome.kind and refuses to act on it', async ({ outcome, expect: pattern }) => {
    const resolution = resolutionFor({ voiceOfMerchant: outcome });
    expect(resolution.canAct).toBe(false);

    await renderView(<AgentStatusCard resolution={resolution} onOwnerAction={() => {}} testID="s" />);

    expect(screen.getByTestId('s-headline')).toHaveTextContent(pattern);
    expect(screen.getByTestId('s-badge')).toHaveTextContent('Cannot act');
    expect(screen.queryByText(/\bactive\b/i)).toBeNull();
  });

  it('lets the agent act only when the profile holds Voice of Merchant', async () => {
    const resolution = resolutionFor({ voiceOfMerchant: HEALTHY });
    expect(resolution.canAct).toBe(true);

    await renderView(<AgentStatusCard resolution={resolution} onOwnerAction={() => {}} testID="s" />);

    expect(screen.getByTestId('s-badge')).toHaveTextContent('Can act');
    // "Can act" — never "Active".
    expect(screen.queryByText(/\bactive\b/i)).toBeNull();
  });

  it('offers the owner action Google names, and only where there is one', () => {
    expect(describeAgentStatus({ kind: 'profile_not_ready', outcome: { kind: 'verify', hasPendingVerification: null } }).ownerAction).toBe(
      'Verify this business with Google',
    );
    // "Wait" is not an action and must never become a button.
    expect(
      describeAgentStatus({ kind: 'profile_not_ready', outcome: { kind: 'wait_for_voice_of_merchant' } })
        .ownerAction,
    ).toBeNull();
  });
});

/* ========================================================================== */
/* 5. Status precedence and "also blocking"                                   */
/* ========================================================================== */

describe('the status names the most fundamental blocker, and does not hide the rest', () => {
  it('reports not-connected first but still says the owner has also paused it', async () => {
    const resolution = resolveAgentStatus({
      target: unavailable('not_connected', 'Nothing linked.'),
      voiceOfMerchant: loading(),
      pause: ready({ paused: true, changedAt: FIXED_NOW }, FIXED_NOW),
      quota: { kind: 'unknown' },
    });

    expect(resolution.status.kind).toBe('not_connected');
    expect(resolution.alsoBlocking).toContain('Paused by you');

    await renderView(<AgentStatusCard resolution={resolution} onOwnerAction={() => {}} testID="s" />);
    expect(screen.getByTestId('s-also-blocking')).toBeOnTheScreen();
    expect(
      screen.getByText('Clearing the one above would not be enough on its own.'),
    ).toBeOnTheScreen();
  });

  it('treats a loading pause setting as "checking", never as permission to act', () => {
    const resolution = resolveAgentStatus({
      target: ready(TARGET, FIXED_NOW),
      voiceOfMerchant: ready(HEALTHY, FIXED_NOW),
      pause: loading(),
      quota: { kind: 'unknown' },
    });

    expect(resolution.status.kind).toBe('checking');
    expect(resolution.canAct).toBe(false);
  });

  it('treats an unreadable pause setting as a blocker, not as "not paused"', () => {
    const resolution = resolveAgentStatus({
      target: ready(TARGET, FIXED_NOW),
      voiceOfMerchant: ready(HEALTHY, FIXED_NOW),
      pause: failed('agent_pause_corrupt', 'Could not be read.', false),
      quota: { kind: 'unknown' },
    });

    expect(resolution.status.kind).toBe('pause_state_unknown');
    expect(resolution.canAct).toBe(false);
  });

  it('reports Google’s edit ceiling as a wait, not as a failure', () => {
    const resolution = resolveAgentStatus({
      target: ready(TARGET, FIXED_NOW),
      voiceOfMerchant: ready(HEALTHY, FIXED_NOW),
      pause: ready({ paused: false, changedAt: null }, FIXED_NOW),
      quota: { kind: 'exhausted', retryAfter: null },
    });

    expect(resolution.status.kind).toBe('rate_limited');
    expect(describeAgentStatus(resolution.status).body).toMatch(/ten edits a minute per profile/i);
  });

  it('does not claim a profile state it was never told', () => {
    const resolution = resolveAgentStatus({
      target: ready(TARGET, FIXED_NOW),
      voiceOfMerchant: unavailable('offline', 'The device is offline.'),
      pause: ready({ paused: false, changedAt: null }, FIXED_NOW),
      quota: { kind: 'unknown' },
    });

    expect(resolution.status.kind).toBe('profile_state_unknown');
    expect(resolution.canAct).toBe(false);
  });
});

/* ========================================================================== */
/* 6. Results — nothing is a success until Google confirms it                 */
/* ========================================================================== */

describe('every action carries its result, and only one result is a success', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('renders each of the five results with its own label', async () => {
    await renderScreen();

    await screen.findByTestId('agent-feed-summary');

    expect(screen.getByText('Confirmed by Google')).toBeOnTheScreen();
    expect(screen.getByText('Submitted, pending review')).toBeOnTheScreen();
    expect(screen.getByText('Accepted, not live yet')).toBeOnTheScreen();
    expect(screen.getByText('Result unknown')).toBeOnTheScreen();
    expect(screen.getByText('Failed')).toBeOnTheScreen();
  });

  it('never reports a submitted review reply as published', async () => {
    await renderScreen();

    await screen.findByTestId('agent-feed-summary');

    expect(
      screen.getByTestId('agent-feed-action-fixture-agent-action-0002-result'),
    ).toHaveTextContent('Submitted, pending review');
    expect(
      screen.getByText(/Submitted and published are two different things/),
    ).toBeOnTheScreen();
    // The word "published" must not be attached to this reply anywhere.
    expect(screen.queryByText(/reply is live/i)).toBeNull();
  });

  it('states that an unconfirmed result is not a success', async () => {
    await renderScreen();

    await screen.findByTestId('agent-feed-summary');
    expect(screen.getByText(/This is not a success/)).toBeOnTheScreen();
  });

  it('counts confirmed and unconfirmed rather than scoring a success rate', async () => {
    await renderScreen();

    const summary = await screen.findByTestId('agent-feed-summary');
    expect(summary).toHaveTextContent(/1 confirmed by Google/);
    expect(summary).toHaveTextContent(/3 not yet confirmed/);
    expect(summary).toHaveTextContent(/1 failed/);
    // No percentage anywhere: five actions cannot support one.
    expect(screen.queryByText(/\d+%/)).toBeNull();
  });

  it('shows every action’s reason, so no claim arrives without its observation', async () => {
    await renderScreen();

    await screen.findByTestId('agent-feed-summary');
    expect(screen.getAllByText('Why Shoogle did this')).toHaveLength(fixtureAgentActions.length);
  });

  it('marks fixture data as fixture data', async () => {
    await renderScreen();

    expect(await screen.findByTestId('fixture-banner')).toBeOnTheScreen();
  });

  it('derives the runway from the fixture schedule rather than stating a week', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-runway-count')).toHaveTextContent('3');
    });
    expect(screen.getByTestId('agent-runway-headline')).toHaveTextContent(
      'Covered for 7 more days',
    );
  });

  it('says the agent can act when the fixture profile genuinely can', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-status-badge')).toHaveTextContent('Can act');
    });
    expect(screen.queryByText(/\bactive\b/i)).toBeNull();
  });
});

/* ========================================================================== */
/* 7. Links — no dead controls                                                */
/* ========================================================================== */

describe('links go to the thing itself, or say there is none', () => {
  it('opens the link Google gave, and says so when it gave none', async () => {
    const opened: string[] = [];
    const actions: AgentAction[] = [
      {
        id: 'with-link',
        kind: 'publish_post',
        headline: 'A post that went live',
        occurredAt: '2020-01-12T00:00:00.000Z',
        because: 'Because the last post expired.',
        result: {
          kind: 'confirmed_by_google',
          confirmedAt: '2020-01-12T00:00:00.000Z',
          evidence: 'Google returned state LIVE.',
        },
        link: { label: 'Open the post on Google', url: 'https://example.invalid/post' },
      },
      {
        id: 'no-link',
        kind: 'reply_to_review',
        headline: 'A reply that was submitted',
        occurredAt: '2020-01-10T00:00:00.000Z',
        because: 'Because a two-star review had no reply.',
        result: { kind: 'pending_moderation', submittedAt: '2020-01-10T00:00:00.000Z' },
        link: null,
      },
    ];

    await renderView(
      <ActionsFeed
        state={ready(actions, FIXED_NOW)}
        onOpenLink={(link) => opened.push(link.url)}
        testID="feed"
      />,
    );

    fireEvent.press(screen.getByTestId('feed-action-with-link-link'));
    expect(opened).toEqual(['https://example.invalid/post']);

    // The entry with no link renders a sentence, not a button that goes nowhere.
    expect(screen.queryByTestId('feed-action-no-link-link')).toBeNull();
    expect(screen.getByTestId('feed-action-no-link-no-link')).toHaveTextContent(
      /Google gave no link to this/,
    );
  });

  it('sorts newest first and keeps an undated action rather than dropping it', () => {
    const base = {
      kind: 'publish_post' as const,
      headline: 'x',
      because: 'y',
      result: { kind: 'result_unknown' as const, reason: 'z' },
      link: null,
    };
    const sorted = sortActionsNewestFirst([
      { ...base, id: 'old', occurredAt: '2020-01-01T00:00:00.000Z' },
      { ...base, id: 'undated', occurredAt: 'not-a-date' },
      { ...base, id: 'new', occurredAt: '2020-01-09T00:00:00.000Z' },
    ]);

    expect(sorted.map((a) => a.id)).toEqual(['new', 'old', 'undated']);
  });

  it('counts results without rounding any of them up', () => {
    const summary = summariseActions(fixtureAgentActions);
    expect(summary.total).toBe(5);
    expect(summary.confirmed).toBe(1);
    expect(summary.failed).toBe(1);
    // Pending, accepted-not-live and unknown are all "not yet confirmed".
    expect(summary.unconfirmed).toBe(3);
  });

  it('marks only a Google-confirmed result as a success', () => {
    expect(
      describeActionResult({
        kind: 'confirmed_by_google',
        confirmedAt: FIXED_NOW,
        evidence: 'e',
      }).isSuccess,
    ).toBe(true);
    for (const result of [
      { kind: 'pending_moderation' as const, submittedAt: null },
      { kind: 'accepted_not_live' as const, reason: 'r' },
      { kind: 'result_unknown' as const, reason: 'r' },
      { kind: 'failed' as const, reason: 'r' },
    ]) {
      expect(describeActionResult(result).isSuccess).toBe(false);
    }
  });
});

/* ========================================================================== */
/* 8. Pause and resume                                                        */
/* ========================================================================== */

/** Renders the real hook against an injected store, as the screen does. */
function PauseHarness({ storage }: { storage: AgentPauseStorage }) {
  const pause = useAgentPause({ storage, now: () => FIXED_NOW });
  const [lastError, setLastError] = useState<string | null>(null);

  return (
    <>
      <PauseCard
        state={pause.state}
        busy={pause.busy}
        canActIfResumed={false}
        onToggle={(next) => {
          void pause.setPaused(next).then((outcome) => {
            if (!outcome.ok) setLastError(outcome.message);
          });
        }}
        testID="pause"
      />
      {lastError === null ? null : <Text testID="pause-write-error">{lastError}</Text>}
    </>
  );
}

function memoryStorage(initial: string | null = null): AgentPauseStorage & { value: string | null } {
  const store = {
    value: initial,
    getItem: async (): Promise<string | null> => store.value,
    setItem: async (_key: string, value: string): Promise<void> => {
      store.value = value;
    },
  };
  return store;
}

describe('pause and resume', () => {
  it('is one tap, and states exactly what it stops and what it does not', async () => {
    await renderView(<PauseHarness storage={memoryStorage()} />);

    await waitFor(() => {
      expect(screen.getByTestId('pause-toggle')).toBeEnabled();
    });

    expect(screen.getByTestId('pause-stops')).toHaveTextContent(
      /Publishing Google Business posts, including anything already scheduled\./,
    );
    expect(screen.getByTestId('pause-continues')).toHaveTextContent(
      /Reading your profile and measuring what Google reports\./,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('pause-toggle'));
    });

    expect(screen.getByTestId('pause-toggle')).toHaveTextContent(/Resume Shoogle/);
    expect(screen.getByText('Shoogle is paused')).toBeOnTheScreen();
  });

  it('persists the pause, so it survives the app being reopened', async () => {
    const storage = memoryStorage();
    await renderView(<PauseHarness storage={storage} />);

    await waitFor(() => {
      expect(screen.getByTestId('pause-toggle')).toBeEnabled();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('pause-toggle'));
    });

    expect(parsePausePreference(storage.value)).toEqual({ paused: true, changedAt: FIXED_NOW });
  });

  it('does not report a pause the device refused to save', async () => {
    const failing: AgentPauseStorage = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error('disk full');
      },
    };

    await renderView(<PauseHarness storage={failing} />);

    await waitFor(() => {
      expect(screen.getByTestId('pause-toggle')).toBeEnabled();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('pause-toggle'));
    });

    // Still offering to pause: nothing was saved, so nothing is claimed.
    expect(screen.getByTestId('pause-toggle')).toHaveTextContent(/Pause Shoogle/);
    expect(await screen.findByTestId('pause-write-error')).toHaveTextContent(
      /nothing was changed/i,
    );
  });

  it('disables the control while the setting is still being read, and says why', async () => {
    await renderView(
      <PauseCard
        state={loading()}
        busy={false}
        canActIfResumed={false}
        onToggle={() => {}}
        testID="pause"
      />,
    );

    expect(screen.getByTestId('pause-toggle')).toBeDisabled();
    expect(screen.getByTestId('pause-disabled-reason')).toHaveTextContent(
      /so this button cannot silently flip your setting/,
    );
  });

  it('offers Pause — never Resume — when the saved setting cannot be read', async () => {
    await renderView(
      <PauseCard
        state={failed('agent_pause_corrupt', 'Could not be read.', false)}
        busy={false}
        canActIfResumed={false}
        onToggle={() => {}}
        testID="pause"
      />,
    );

    // Resuming from an unknown state would be Shoogle deciding for the owner.
    expect(screen.getByTestId('pause-toggle')).toHaveTextContent('Pause Shoogle');
  });

  it('says pausing stops nothing today, because nothing is running', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-pause-toggle')).toBeEnabled();
    });
    expect(
      screen.getByText(/Nothing is running to stop right now/),
    ).toBeOnTheScreen();
  });

  it('reads a pause the owner set in an earlier session', async () => {
    await AsyncStorage.setItem(
      AGENT_PAUSE_STORAGE_KEY,
      JSON.stringify({ paused: true, changedAt: FIXED_NOW }),
    );

    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-pause-toggle')).toHaveTextContent('Resume Shoogle');
    });
  });

  it('refuses to interpret a stored value it does not recognise', () => {
    expect(parsePausePreference(null)).toBeNull();
    expect(parsePausePreference('not json')).toBeNull();
    expect(parsePausePreference('{"paused":"yes"}')).toBeNull();
    expect(parsePausePreference('{"paused":true,"changedAt":7}')).toBeNull();
    expect(parsePausePreference('{"paused":true,"changedAt":null}')).toEqual({
      paused: true,
      changedAt: null,
    });
  });
});

/* ========================================================================== */
/* 9. Controls and accessibility                                              */
/* ========================================================================== */

describe('controls', () => {
  it('gives every control on the screen an accessible name', async () => {
    await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('agent-pause-toggle')).toBeOnTheScreen();
    });

    for (const control of screen.getAllByRole('button')) {
      const label = control.props.accessibilityLabel as string | undefined;
      expect(typeof label === 'string' && label.length > 0).toBe(true);
    }
  });

  it('answers when the owner presses the one thing they can do, rather than doing nothing', async () => {
    await renderScreen();

    const action = await screen.findByTestId('agent-status-owner-action');
    await act(async () => {
      fireEvent.press(action);
    });

    // The adapter's real refusal, surfaced as a toast — not a silent no-op.
    expect(
      await screen.findByText(/Shoogle’s access request is still with Google/),
    ).toBeOnTheScreen();
  });

  it('lists what the status badge can say, without calling any of it false', async () => {
    await renderScreen();

    const ledger = await screen.findByTestId('agent-status-ledger');
    expect(ledger).toBeOnTheScreen();
    expect(
      screen.getByText(/the rest are not being called false/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Not connected — right now')).toBeOnTheScreen();
  });
});

/* ========================================================================== */
/* 10. Android QA — 390x844 and 412x915                                       */
/* ========================================================================== */

/**
 * A static walk of the rendered tree at both target viewports.
 *
 * It catches a declared width wider than the screen, a control with no
 * accessible name, and a pressable whose declared height is under the 44pt
 * Android floor. Overflow caused by flex or by content, keyboard avoidance and
 * real scrolling are not knowable here and still need a device — those are
 * reported as undetermined rather than quietly passed.
 *
 * The walker is local rather than imported: `__tests__/android-qa.test.tsx`
 * and `features/seo/__tests__/android-viewports.test.tsx` both define their own
 * suites at module scope, and importing either would run someone else's whole
 * suite a second time inside this file.
 */
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

function walkTree(node: TreeNode | string | null, visit: (n: TreeNode) => void): void {
  if (!node || typeof node === 'string') return;
  visit(node);
  for (const child of node.children ?? []) walkTree(child, visit);
}

interface QaReport {
  overflow: { width: number; testID?: string }[];
  smallTargets: { height: number; label?: string }[];
  unlabelled: { role: string; testID?: string }[];
  pressables: number;
}

function auditTree(tree: TreeNode | string | null, viewportWidth: number): QaReport {
  const report: QaReport = { overflow: [], smallTargets: [], unlabelled: [], pressables: 0 };

  walkTree(tree, (node) => {
    const props = node.props ?? {};
    const style = flattenStyle(props['style']);

    const width = style['width'];
    if (typeof width === 'number' && width > viewportWidth) {
      report.overflow.push({
        width,
        ...(typeof props['testID'] === 'string' ? { testID: props['testID'] } : {}),
      });
    }

    const role = props['accessibilityRole'];
    if (role !== 'button' && role !== 'tab' && role !== 'switch') return;
    report.pressables += 1;

    const label = props['accessibilityLabel'];
    if (typeof label !== 'string' || label.trim().length === 0) {
      report.unlabelled.push({
        role: String(role),
        ...(typeof props['testID'] === 'string' ? { testID: props['testID'] } : {}),
      });
    }

    const declaredHeight = style['minHeight'];
    const height = style['height'];
    const declared =
      typeof declaredHeight === 'number'
        ? declaredHeight
        : typeof height === 'number'
          ? height
          : null;
    // A height that comes from flex or from content is not knowable statically.
    if (declared === null) return;

    const hitSlop = props['hitSlop'];
    const slop = typeof hitSlop === 'number' ? hitSlop * 2 : 0;
    if (declared + slop < MIN_TOUCH_TARGET) {
      report.smallTargets.push({
        height: declared,
        ...(typeof label === 'string' ? { label } : {}),
      });
    }
  });

  return report;
}

/** The Android accessibility floor, from the design tokens. */
const MIN_TOUCH_TARGET = 44;

function renderAtViewport(width: number, height: number) {
  return renderRouter(
    {
      'seo/agent': () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>
            <AgentScreen />
          </ToastProvider>
        </ThemeProvider>
      ),
    },
    {
      initialUrl: '/seo/agent',
      initialMetrics: {
        frame: { x: 0, y: 0, width, height },
        insets: { top: 24, left: 0, right: 0, bottom: 24 },
      },
    } as never,
  );
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 },
] as const;

describe('the walker itself', () => {
  it('can fail — an over-wide element and an unlabelled control are caught', () => {
    const report = auditTree(
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

describe.each(VIEWPORTS)('the agent screen at $name', ({ width, height }) => {
  it('fits, labels every control and meets the 44pt floor when nothing is connected', async () => {
    await renderAtViewport(width, height);

    expect(await screen.findByTestId('agent-screen')).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByTestId('agent-pause-toggle')).toBeEnabled();
    });

    const report = auditTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);
    // Pause plus the one owner action. Both do something; neither is dead.
    expect(report.pressables).toBeGreaterThanOrEqual(2);
  });

  it('fits and stays labelled with a full fixture feed too', async () => {
    mockFixtures = true;
    await renderAtViewport(width, height);

    await screen.findByTestId('agent-feed-summary');

    const report = auditTree(screen.toJSON() as TreeNode, width);
    expect(report.overflow).toEqual([]);
    expect(report.unlabelled).toEqual([]);
    expect(report.smallTargets).toEqual([]);
  });
});
