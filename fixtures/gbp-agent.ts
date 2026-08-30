/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA. The Shoogle Agent.
 *
 * Read fixtures/README.md before using anything here.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The agent screen's real state today is "cannot act — not connected", and an
 * empty feed. That state is the DEFAULT and it is fully rendered without any
 * of this. These fixtures exist for the other half of the work: the layout of a
 * feed that has entries in it, and — more importantly — proof that every
 * RESULT state is reachable and renders differently.
 *
 * WHAT IS DELIBERATELY MODELLED
 * -----------------------------
 * - All five action results, side by side: confirmed by Google, submitted and
 *   pending moderation, accepted-but-not-live, result unknown, and failed. A
 *   competitor feed only has the first of those, and shows it whatever
 *   happened.
 * - An action with NO link, because Google does not always return one. It must
 *   render a sentence rather than a dead button.
 * - A schedule with real due dates, so the runway is genuinely derived: three
 *   items, the last due seven days after the fixture's "today". The number 7 on
 *   screen is computed from these dates, not typed in.
 * - A separate UNKNOWN last-publish date, so the "we do not know" runway can be
 *   exercised next to the known one.
 *
 * Every visible string carries `[FIXTURE]`, and access is gated by
 * `isFixtureModeEnabled()` — `__DEV__` plus `EXPO_PUBLIC_ENABLE_FIXTURES=1` —
 * so a release build cannot reach any of it.
 */

import { isFixtureModeEnabled } from '@/lib/env';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';

import type {
  AgentAction,
  AgentLastPublished,
  AgentScheduledItem,
  AgentTarget,
} from '@/features/gbp/components/agent/model';
import type { VoiceOfMerchantOutcome } from '@/features/gbp/voiceOfMerchant';

/** Fixed so snapshots are stable and nothing on screen looks live. */
const FIXTURE_FETCHED_AT = '2020-01-15T00:00:00.000Z';

/**
 * The fixture's "today". Injected into `computeRunway`, so the days-of-cover
 * figure is arithmetic on the dates below rather than a number someone chose.
 */
export const FIXTURE_AGENT_TODAY = '2020-01-15';

export const fixtureAgentTarget: AgentTarget = {
  locationId: 'locations/fixture-0001',
  label: '[FIXTURE] Example Salon',
};

/**
 * The fixture profile holds Voice of Merchant, so the populated layout can be
 * reviewed with the agent able to act.
 *
 * This is the ONLY outcome that permits work, and it is deliberately the
 * least likely one for a real small Indian business — which is why the other
 * five are not fixtures at all but first-class states in
 * `features/gbp/voiceOfMerchant.ts`, exercised against the status card in
 * `features/gbp/__tests__/agent-ui.test.tsx`. Shipping the happy one as the
 * fixture and the unhappy ones as tests is the right way round: the unhappy
 * ones are what the code must get right, not what the layout needs.
 */
export const fixtureAgentVoiceOfMerchant: VoiceOfMerchantOutcome = {
  kind: 'has_voice_of_merchant',
  hasBusinessAuthority: true,
};

/* -------------------------------------------------------------------------- */
/* Schedule — the runway is derived from these dates                          */
/* -------------------------------------------------------------------------- */

/**
 * Three real items. The furthest is 2020-01-22, seven days after
 * `FIXTURE_AGENT_TODAY`, so the card reads "Covered for 7 more days" — and it
 * reads that because of subtraction, not because a fixture says "1 week".
 */
export const fixtureAgentSchedule: AgentScheduledItem[] = [
  {
    id: 'fixture-agent-scheduled-0001',
    kind: 'publish_post',
    headline: '[FIXTURE] Weekend offer post',
    dueAt: '2020-01-16',
  },
  {
    id: 'fixture-agent-scheduled-0002',
    kind: 'publish_media',
    headline: '[FIXTURE] Three photos of the new chairs',
    dueAt: '2020-01-18',
  },
  {
    id: 'fixture-agent-scheduled-0003',
    kind: 'publish_post',
    headline: '[FIXTURE] Republic Day hours notice',
    dueAt: '2020-01-22',
  },
];

/** Google told us when something last went up. */
export const fixtureAgentLastPublished: AgentLastPublished = {
  kind: 'at',
  at: '2020-01-12T00:00:00.000Z',
};

/**
 * The other honest answer. Used to exercise the runway that refuses to guess —
 * this is what the card must show rather than "stays fresh for 1 more week".
 */
export const fixtureAgentLastPublishedUnknown: AgentLastPublished = {
  kind: 'unknown',
  reason:
    '[FIXTURE] Google has not been asked yet, so Shoogle does not know when anything last went up.',
};

/** And the measured "nothing ever has", which is not the same as unknown. */
export const fixtureAgentNeverPublished: AgentLastPublished = { kind: 'never' };

/* -------------------------------------------------------------------------- */
/* Actions — one of every result                                              */
/* -------------------------------------------------------------------------- */

export const fixtureAgentActions: AgentAction[] = [
  {
    id: 'fixture-agent-action-0001',
    kind: 'publish_post',
    headline: '[FIXTURE] Published a post about weekend appointment slots',
    occurredAt: '2020-01-12T00:00:00.000Z',
    because:
      '[FIXTURE] Google reported 14 calls in the seven days before this and none in the two days after your last post expired.',
    result: {
      kind: 'confirmed_by_google',
      confirmedAt: '2020-01-12T00:00:00.000Z',
      evidence: '[FIXTURE] Google returned the post with a state of LIVE and the link below.',
    },
    link: { label: 'Open the post on Google', url: 'https://example.invalid/fixture-post-0001' },
  },
  {
    // Google MODERATES replies. This one is submitted and is not published.
    id: 'fixture-agent-action-0002',
    kind: 'reply_to_review',
    headline: '[FIXTURE] Submitted a reply to a two-star review',
    occurredAt: '2020-01-10T00:00:00.000Z',
    because:
      '[FIXTURE] A two-star review arrived with no reply, and reviews without a reply are the only ones Shoogle drafts for.',
    result: { kind: 'pending_moderation', submittedAt: '2020-01-10T00:00:00.000Z' },
    // Google returns no direct URL for a review reply.
    link: null,
  },
  {
    id: 'fixture-agent-action-0003',
    kind: 'update_hours',
    headline: '[FIXTURE] Set closed hours for a festival day',
    occurredAt: '2020-01-08T00:00:00.000Z',
    because:
      '[FIXTURE] Google’s copy of your hours differed from yours on that date, reported by getGoogleUpdated.',
    result: {
      kind: 'accepted_not_live',
      reason:
        '[FIXTURE] Google accepted the edit but this profile does not hold Voice of Merchant, so the change has not appeared on Search or Maps.',
    },
    link: null,
  },
  {
    id: 'fixture-agent-action-0004',
    kind: 'publish_media',
    headline: '[FIXTURE] Uploaded two photos of the shopfront',
    occurredAt: '2020-01-06T00:00:00.000Z',
    because:
      '[FIXTURE] Nothing had been added to the profile for 21 days, counted from the last confirmed publish.',
    result: {
      kind: 'result_unknown',
      reason:
        '[FIXTURE] The upload was sent but Google never answered, so Shoogle does not know whether the photos went up.',
    },
    link: null,
  },
  {
    id: 'fixture-agent-action-0005',
    kind: 'publish_post',
    headline: '[FIXTURE] Tried to publish a post about a new service',
    occurredAt: '2020-01-04T00:00:00.000Z',
    because: '[FIXTURE] A new service was added to your profile and had never been posted about.',
    result: {
      kind: 'failed',
      reason:
        '[FIXTURE] Google rejected the post and gave no reason Shoogle could pass on. Nothing was published.',
    },
    link: null,
  },
];

/* -------------------------------------------------------------------------- */
/* Gated access                                                               */
/* -------------------------------------------------------------------------- */

export interface GbpAgentFixtures {
  target: AgentTarget;
  schedule: AgentScheduledItem[];
  lastPublished: AgentLastPublished;
  actions: AgentAction[];
  today: string;
}

/**
 * The ONLY sanctioned way to read agent fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()`, so the honest
 * "nothing here, and here is why" path is always the one exercised by default.
 */
export function getGbpAgentFixtures(): GbpAgentFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    target: fixtureAgentTarget,
    schedule: fixtureAgentSchedule,
    lastPublished: fixtureAgentLastPublished,
    actions: fixtureAgentActions,
    today: FIXTURE_AGENT_TODAY,
  };
}

/**
 * The sentence the screen shows when there are no fixtures and no credentials —
 * which is the real state of this feature today.
 */
export const AGENT_NOT_CONNECTED_MESSAGE =
  'No Google Business Profile is connected, so Shoogle cannot act on your listing and has never acted on it.';

/**
 * Wrap an agent fixture in a `DataState` carrying `isFixture: true`, so the
 * flag travels with the value instead of depending on someone remembering.
 *
 * With fixture mode off this returns `not_connected` — the same state the real
 * adapter reports today, with the same meaning.
 */
export function gbpAgentFixtureState<T>(value: T): DataState<T> {
  if (!isFixtureModeEnabled()) {
    return unavailable('not_connected', AGENT_NOT_CONNECTED_MESSAGE);
  }
  return ready(value, FIXTURE_FETCHED_AT, true);
}
