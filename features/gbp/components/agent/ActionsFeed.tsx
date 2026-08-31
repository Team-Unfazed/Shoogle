import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Badge, Button, Card, Text } from '@/components/ui';
import type { DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

import {
  AGENT_PLANNED_WORK,
  agentWorkLabel,
  describeActionResult,
  formatAgentTimelineDay,
  sortActionsNewestFirst,
  summariseActions,
  type AgentAction,
  type AgentActionLink,
} from './model';

/**
 * A dated timeline of what the agent actually did.
 *
 * The competitor's feed is a list of badges — "New Post Published" (purple),
 * "Media Published" (amber) — with a date and a thumbnail. It reports activity.
 * It never reports whether the activity worked, and there is nothing to press
 * to go and look.
 *
 * Every entry here carries four things instead of two:
 *
 *   1. WHAT was attempted — named for the attempt, never for the outcome.
 *   2. WHEN.
 *   3. THE RESULT, from `describeActionResult`. Only "Confirmed by Google"
 *      reads as done. "Submitted, pending review" and "Result unknown" are
 *      their own states and are never rounded up.
 *   4. WHY — the observation the action rests on. It is a required field on
 *      `AgentAction`, so an action cannot enter this feed without one.
 *
 * And a link to the thing itself, when the provider gave one. When it did not,
 * the card says so rather than rendering a button that goes nowhere.
 */
export interface ActionsFeedProps {
  state: DataState<AgentAction[]>;
  /** The screen owns opening a URL, so this component stays testable. */
  onOpenLink: (link: AgentActionLink) => void;
  testID?: string;
}

export function ActionsFeed({ state, onOpenLink, testID }: ActionsFeedProps) {
  const theme = useTheme();

  // The reason the feed is empty, when the provider gave one. `null` means the
  // feed was genuinely read and genuinely contains nothing.
  const reason =
    state.status === 'unavailable' || state.status === 'error' ? state.message : null;

  return (
    <DataStateView
      state={state}
      testID={testID}
      emptyWhen={(actions) => actions.length === 0}
      emptyOverride={
        <AgentFeedEmpty
          reason={reason}
          testID={testID === undefined ? undefined : `${testID}-empty`}
        />
      }
      skeletonLines={4}>
      {(actions) => {
        const ordered = sortActionsNewestFirst(actions);
        const summary = summariseActions(ordered);
        return (
          <View>
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${summary.total} actions. ${summary.confirmed} confirmed by Google, ${summary.unconfirmed} not yet confirmed, ${summary.failed} failed.`}
              style={[
                styles.summary,
                {
                  backgroundColor: theme.colors.card2,
                  borderRadius: theme.radii.lg,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                },
              ]}
              testID={testID === undefined ? undefined : `${testID}-summary`}>
              <Text variant="label" tone="muted2">
                Of {summary.total} actions
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
                {summary.confirmed} confirmed by Google · {summary.unconfirmed} not yet confirmed ·{' '}
                {summary.failed} failed. Counted, not scored — a success rate over a handful of
                actions would be invented precision.
              </Text>
            </View>

            {ordered.map((action, index) => (
              <ActionEntry
                key={action.id}
                action={action}
                onOpenLink={onOpenLink}
                isFirst={index === 0}
                testID={testID === undefined ? undefined : `${testID}-action-${action.id}`}
              />
            ))}
          </View>
        );
      }}
    </DataStateView>
  );
}

/* -------------------------------------------------------------------------- */
/* One entry                                                                  */
/* -------------------------------------------------------------------------- */

function ActionEntry({
  action,
  onOpenLink,
  isFirst,
  testID,
}: {
  action: AgentAction;
  onOpenLink: (link: AgentActionLink) => void;
  isFirst: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const result = describeActionResult(action.result);
  const day = formatAgentTimelineDay(action.occurredAt);

  return (
    <Card testID={testID} style={{ marginTop: isFirst ? 0 : theme.spacing.md }}>
      <View style={[styles.metaRow, { gap: theme.spacing.sm }]}>
        <Badge label={agentWorkLabel(action.kind)} accent="neutral" variant="outline" />
        <Text variant="caption" tone="muted2" style={styles.flexText}>
          {day ?? 'Date not recorded'}
        </Text>
      </View>

      <Text variant="bodyStrong" style={{ marginTop: theme.spacing.md }}>
        {action.headline}
      </Text>

      <View
        style={[
          styles.because,
          {
            backgroundColor: theme.colors.card2,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.md,
            marginTop: theme.spacing.md,
            gap: theme.spacing.sm,
          },
        ]}>
        <Ionicons name="eye-outline" size={theme.spacing.lg} color={theme.colors.muted2} />
        <View style={styles.flexText}>
          <Text variant="label" tone="muted2">
            Why Shoogle did this
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            {action.because}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.lg }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <Badge
            label={result.label}
            accent={result.accent}
            testID={testID === undefined ? undefined : `${testID}-result`}
          />
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          {result.body}
        </Text>
      </View>

      {action.link === null ? (
        <Text
          variant="caption"
          tone="muted2"
          style={{ marginTop: theme.spacing.md }}
          testID={testID === undefined ? undefined : `${testID}-no-link`}>
          Google gave no link to this, so there is nothing to open. Shoogle will not send you to a
          page it has not been given.
        </Text>
      ) : (
        <Button
          label={action.link.label}
          variant="ghost"
          size="small"
          fullWidth={false}
          onPress={() => {
            if (action.link !== null) onOpenLink(action.link);
          }}
          accessibilityHint="Opens Google in your browser"
          style={{ marginTop: theme.spacing.md }}
          testID={testID === undefined ? undefined : `${testID}-link`}
        />
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The empty feed — today, always this                                        */
/* -------------------------------------------------------------------------- */

/**
 * Nothing has ever happened, and the empty state has to say precisely that
 * without implying anything did.
 *
 * `reason` is the provider's own sentence when the feed could not be read at
 * all. When it is null the feed WAS read and is genuinely empty. Those two are
 * different and both are stated.
 */
export function AgentFeedEmpty({ reason, testID }: { reason: string | null; testID?: string }) {
  const theme = useTheme();

  return (
    <Card testID={testID}>
      <Text variant="cardTitle">Nothing has happened yet</Text>
      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {reason === null
          ? 'This list was read and it is empty. Shoogle has not done anything on your profile.'
          : reason}
      </Text>
      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
        Empty because Shoogle has never been able to act — not because it acted and found nothing
        worth telling you about.
      </Text>

      <Text variant="label" tone="muted2" style={{ marginTop: theme.spacing.xl }}>
        What it will do once a profile is connected
      </Text>

      {AGENT_PLANNED_WORK.map((work) => (
        <View
          key={work.kind}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${work.label}. ${work.willDo} How you will know it worked: ${work.proofOfDone}`}
          style={{
            marginTop: theme.spacing.md,
            backgroundColor: theme.colors.card2,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.md,
          }}>
          <Text variant="bodyStrong">{work.label}</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            {work.willDo}
          </Text>
          <Text variant="label" tone="muted2" style={{ marginTop: theme.spacing.md }}>
            How you will know it worked
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            {work.proofOfDone}
          </Text>
        </View>
      ))}

      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.lg }}>
        Every entry will carry what was attempted, when, the result Google confirmed, and a link to
        the thing itself. An entry nobody confirmed will say so — it will never be shown as a
        success.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { width: '100%' },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  because: { flexDirection: 'row', alignItems: 'flex-start' },
  flexText: { flex: 1, minWidth: 0 },
});
