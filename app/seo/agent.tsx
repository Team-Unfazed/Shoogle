/**
 * THE SHOOGLE AGENT. Route: `/seo/agent`. Feature owner: Pranay.
 *
 * This is Shoogle's answer to the single strongest surface in the competitor's
 * product: a "GBP AI Agent" card carrying a green "Active" pill and the line
 * "0 Photos left — Profile stays fresh & active for 1 more week", above a
 * "Grexa AI Actions" feed of dated cards badged "New Post Published" and
 * "Media Published".
 *
 * It is a genuinely good shape for a screen. It is also, as shipped, three
 * claims with nothing behind them:
 *
 *   "Active"            — shown whatever is true, including when the agent
 *                         cannot touch the profile at all.
 *   "1 more week"       — not derived from a schedule or a publish date.
 *   "Post Published"    — reports that the agent DID something, never whether
 *                         it worked.
 *
 * WHAT THIS SCREEN DOES INSTEAD
 * -----------------------------
 * 1. STATUS IS A FACT, NOT A DECORATION. `resolveAgentStatus` returns one of
 *    eight real conditions and the word "Active" appears nowhere. Today, with
 *    no Google credentials in existence, the honest answer is "Cannot act — not
 *    connected", and that is what this screen shows by default. It is the
 *    DEFAULT state, not an error, and the whole page is laid out for it.
 * 2. THE RUNWAY IS ARITHMETIC OR IT IS NOTHING. It comes from real scheduled
 *    items and a real last-publish date. With neither, it renders "not known" —
 *    an em dash, not a zero, and certainly not "1 more week".
 * 3. EVERY ACTION CARRIES ITS RESULT. Confirmed by Google, submitted and
 *    pending Google's moderation, accepted but not live, result unknown, or
 *    failed. Only the first reads as done.
 * 4. STOP IS ONE TAP. Product rule 5. The pause is written to the device
 *    BEFORE the button changes, and the card states exactly what pausing stops
 *    and what it does not.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * The connection and the profile's Voice of Merchant state are read from the
 * real adapter, which has no transport and therefore answers `not_connected` —
 * the truth. In development, with fixtures enabled, a labelled fixture agent is
 * shown under the fixture banner so the populated layout can be reviewed. There
 * is no third path, and nothing on this screen is invented in either of them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';

import { Screen, TopBar } from '@/components/shared';
import { Section, Text, useToast } from '@/components/ui';
import { googleBusinessProfileProvider, type VoiceOfMerchantOutcome } from '@/features/gbp';
import {
  ActionsFeed,
  AgentStatusCard,
  PauseCard,
  RunwayCard,
  computeRunway,
  resolveAgentStatus,
  useAgentPause,
  type AgentAction,
  type AgentActionLink,
  type AgentLastPublished,
  type AgentTarget,
} from '@/features/gbp/components/agent';
import {
  AGENT_NOT_CONNECTED_MESSAGE,
  fixtureAgentVoiceOfMerchant,
  gbpAgentFixtureState,
  getGbpAgentFixtures,
} from '@/fixtures/gbp-agent';
import type { GbpLocation } from '@/lib/providers';
import { loading, unavailable, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/** No linked account has any profile on it — a real answer, not an error. */
const NO_LOCATIONS =
  'The linked Google account does not manage any Business Profile, so there is nothing for Shoogle to act on.';

/** Today, as an ISO date. Only ever used for a runway we can actually compute. */
function todayIsoDate(): string {
  const now = new Date();
  const iso = now.toISOString();
  return iso.slice(0, 10);
}

/**
 * The first location the account manages, or the reason there is not one.
 *
 * Multi-location businesses are out of scope for this screen: the agent acts on
 * one profile, and picking one silently out of several would be Shoogle
 * choosing which of an owner's shops to publish to.
 */
function toTargetState(state: DataState<GbpLocation[]>): DataState<AgentTarget> {
  if (state.status !== 'ready') return state;
  const first = state.value[0];
  if (first === undefined) return unavailable('not_connected', NO_LOCATIONS);
  return {
    ...state,
    value: { locationId: first.locationId, label: first.title },
  };
}

export default function AgentScreen() {
  const theme = useTheme();
  const toast = useToast();
  const pause = useAgentPause();

  // Gated accessor: null outside development, so a release build cannot reach
  // fixture content at all and always renders the not-connected layout.
  const fixtures = useMemo(() => getGbpAgentFixtures(), []);

  // Only the LIVE answers need state: they arrive from the adapter. The
  // fixture answers are known synchronously and are derived below, so no
  // effect writes them and the screen never renders a state it then replaces.
  const [liveTarget, setLiveTarget] = useState<DataState<AgentTarget>>(loading());
  const [liveVoiceOfMerchant, setLiveVoiceOfMerchant] =
    useState<DataState<VoiceOfMerchantOutcome>>(loading());

  const target = useMemo<DataState<AgentTarget>>(
    () => (fixtures === null ? liveTarget : gbpAgentFixtureState(fixtures.target)),
    [fixtures, liveTarget],
  );

  const voiceOfMerchant = useMemo<DataState<VoiceOfMerchantOutcome>>(
    () =>
      fixtures === null
        ? liveVoiceOfMerchant
        : gbpAgentFixtureState(fixtureAgentVoiceOfMerchant),
    [fixtures, liveVoiceOfMerchant],
  );

  useEffect(() => {
    if (fixtures !== null) return;

    let cancelled = false;
    void googleBusinessProfileProvider.listLocations().then((next) => {
      if (!cancelled) setLiveTarget(toTargetState(next));
    });
    return () => {
      cancelled = true;
    };
  }, [fixtures]);

  useEffect(() => {
    // Voice of Merchant is only meaningful once there is a profile to ask
    // about. Asking earlier would produce a state we would then have to explain
    // away, and `resolveAgentStatus` deliberately ignores it until then.
    if (fixtures !== null || target.status !== 'ready') return;

    let cancelled = false;
    const locationId = target.value.locationId;
    void googleBusinessProfileProvider.getVoiceOfMerchant(locationId).then((next) => {
      if (!cancelled) setLiveVoiceOfMerchant(next);
    });
    return () => {
      cancelled = true;
    };
  }, [fixtures, target]);

  const resolution = useMemo(
    () =>
      resolveAgentStatus({
        target,
        voiceOfMerchant,
        pause: pause.state,
        // We have never spoken to Google, so we do not know the edit headroom.
        // `unknown` does not block; claiming headroom we have not measured would.
        quota: { kind: 'unknown' },
      }),
    [target, voiceOfMerchant, pause.state],
  );

  const actions = useMemo<DataState<AgentAction[]>>(
    () => gbpAgentFixtureState(fixtures?.actions ?? []),
    [fixtures],
  );

  const runway = useMemo(() => {
    const lastPublished: AgentLastPublished = fixtures?.lastPublished ?? {
      kind: 'unknown',
      reason: AGENT_NOT_CONNECTED_MESSAGE,
    };
    return computeRunway({
      // With no fixtures this is `not_connected`, so the runway is unknown and
      // carries that reason. There is no default schedule and no default cover.
      scheduled: gbpAgentFixtureState(fixtures?.schedule ?? []),
      lastPublished,
      today: fixtures?.today ?? todayIsoDate(),
    });
  }, [fixtures]);

  /**
   * True when the pause is the ONLY thing in the way. It changes what the
   * resume button can honestly promise.
   */
  const pauseIsTheOnlyBlocker =
    resolution.canAct ||
    (resolution.status.kind === 'paused_by_owner' && resolution.alsoBlocking.length === 0);

  const handleOwnerAction = useCallback(
    async (label: string) => {
      if (resolution.status.kind === 'not_connected') {
        // The adapter answers this honestly rather than half-connecting, so the
        // owner gets Google's real blocker instead of a spinner.
        const outcome = await googleBusinessProfileProvider.connect();
        toast.show({
          message:
            outcome.status === 'unavailable' || outcome.status === 'error'
              ? outcome.message
              : 'A Google Business Profile is connected.',
          tone: 'neutral',
          durationMs: 6000,
        });
        return;
      }
      toast.show({
        message: `“${label}” is something only you can do, on Google. Shoogle cannot do it for you, and it is not built into this screen.`,
        tone: 'neutral',
        durationMs: 6000,
      });
    },
    [resolution.status.kind, toast],
  );

  const handleTogglePause = useCallback(
    async (nextPaused: boolean) => {
      const outcome = await pause.setPaused(nextPaused);
      if (!outcome.ok) {
        toast.show({ message: outcome.message, tone: 'error' });
        return;
      }
      toast.show({
        message: nextPaused
          ? 'Paused. Shoogle will not publish or submit anything until you resume it.'
          : pauseIsTheOnlyBlocker
            ? 'Resumed. Shoogle can act again.'
            : 'Resumed. Shoogle still cannot act — the reasons above have not changed.',
        tone: nextPaused ? 'warning' : 'neutral',
        durationMs: 5000,
      });
    },
    [pause, pauseIsTheOnlyBlocker, toast],
  );

  const handleOpenLink = useCallback(
    (link: AgentActionLink) => {
      void Linking.openURL(link.url).catch(() => {
        toast.show({
          message: 'That link could not be opened on this device. Nothing else changed.',
          tone: 'error',
        });
      });
    },
    [toast],
  );

  const showsFixtureData = actions.status === 'ready' && actions.isFixture === true;

  return (
    <Screen
      testID="agent-screen"
      header={<TopBar />}
      edgeBottom
      showsFixtureData={showsFixtureData}>
      <Text variant="screenTitle">Shoogle Agent</Text>
      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: 6, marginBottom: theme.spacing.lg }}>
        What Shoogle is doing for you, what it cannot do right now, and how to stop it. Every
        status on this screen is a fact Shoogle can point at, and no action is reported as done
        until Google has confirmed it.
      </Text>

      <AgentStatusCard
        resolution={resolution}
        onOwnerAction={(label) => {
          void handleOwnerAction(label);
        }}
        testID="agent-status"
      />

      <Section
        title="Stop and start"
        subtitle="One tap, from here, whatever else is going on.">
        <PauseCard
          state={pause.state}
          busy={pause.busy}
          canActIfResumed={pauseIsTheOnlyBlocker}
          onToggle={(next) => {
            void handleTogglePause(next);
          }}
          testID="agent-pause"
        />
      </Section>

      <Section
        title="Runway"
        subtitle="How far ahead your profile is covered, counted from what is actually scheduled.">
        <RunwayCard runway={runway} testID="agent-runway" />
      </Section>

      <Section
        title="What Shoogle has done"
        subtitle="Dated, with the result of each one — not just that it happened.">
        <ActionsFeed state={actions} onOpenLink={handleOpenLink} testID="agent-feed" />
      </Section>
    </Screen>
  );
}
