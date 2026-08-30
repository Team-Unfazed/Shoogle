import { StyleSheet, View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Card, Text } from '@/components/ui';
import type { DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

import type { WeeklyRequestSummary } from './requestLog';

/**
 * Requests sent this week.
 *
 * THE DIFFERENCE FROM GREXA, STATED ON SCREEN
 * -------------------------------------------
 * Grexa's bar reads "0/8 · 8 more to hit your weekly goal" under the heading
 * "Get Reviews from Your Customers", which asserts progress toward REVIEWS.
 * This bar counts REQUESTS, says so in the label, and the sentence underneath
 * names the exact scope of the claim — confirmed, from Shoogle, on this phone.
 * The reviews themselves are a separate card that says it cannot attribute
 * them.
 *
 * A zero here is a real measured zero and renders as `0`: Shoogle genuinely
 * knows it has sent none. That is why loading and failure states exist and are
 * routed through `DataStateView` — "we could not read the log" must not collapse
 * into the same `0`.
 */
export interface WeeklyRequestsCardProps {
  state: DataState<WeeklyRequestSummary>;
  /** Handoffs the owner has not yet confirmed. Never counted as sent. */
  awaitingConfirmation: number;
  onRetry?: () => void;
  testID?: string;
}

export function WeeklyRequestsCard({
  state,
  awaitingConfirmation,
  onRetry,
  testID,
}: WeeklyRequestsCardProps) {
  const theme = useTheme();

  return (
    <Card testID={testID}>
      <Text variant="label" tone="muted2">
        REVIEW REQUESTS YOU SENT
      </Text>

      <DataStateView
        state={state}
        onRetry={onRetry}
        skeletonLines={2}
        compact
        testID="weekly-requests-state">
        {(summary) => (
          <View>
            <View style={[styles.countRow, { marginTop: theme.spacing.sm }]}>
              <Text testID="weekly-requests-count" variant="display">
                {summary.confirmed}
              </Text>
              <Text
                variant="body"
                tone="muted"
                style={{ marginBottom: theme.spacing.xs, marginLeft: theme.spacing.sm }}>
                {`of ${summary.suggested} suggested this week`}
              </Text>
            </View>

            <ProgressBar
              value={summary.confirmed}
              max={summary.suggested}
              accessibilityLabel={`${summary.confirmed} of ${summary.suggested} suggested review requests sent this week`}
            />

            <Text
              testID="weekly-requests-scope"
              variant="caption"
              tone="muted"
              style={{ marginTop: theme.spacing.md }}>
              Counts requests you confirmed sending from Shoogle on this phone. Requests you sent
              any other way are not in this number.
            </Text>

            <Text variant="caption" tone="muted2" style={{ marginTop: 6 }}>
              Eight a week is a suggestion, not a measurement. Google asks businesses not to
              solicit reviews in bulk, so a steady trickle is also the safer pace.
            </Text>

            {awaitingConfirmation > 0 ? (
              <Text
                testID="weekly-requests-pending"
                variant="caption"
                tone="amber"
                style={{ marginTop: theme.spacing.sm }}>
                {awaitingConfirmation === 1
                  ? '1 request is waiting for you to confirm it was sent. It is not counted above.'
                  : `${awaitingConfirmation} requests are waiting for you to confirm they were sent. They are not counted above.`}
              </Text>
            ) : null}
          </View>
        )}
      </DataStateView>
    </Card>
  );
}

/**
 * A bar for a number Shoogle actually measured.
 *
 * Deliberately built here rather than in `components/ui`: the design system has
 * no progress primitive, and product rule 10 ("no progress theatre") is the
 * reason — a generic one invites fake percentages. This one only ever renders a
 * counted value against a stated suggestion.
 */
function ProgressBar({
  value,
  max,
  accessibilityLabel,
}: {
  value: number;
  max: number;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const fraction = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max, now: value }}
      style={[
        styles.track,
        {
          marginTop: theme.spacing.md,
          backgroundColor: theme.colors.card2,
          borderRadius: theme.radii.full,
        },
      ]}>
      <View
        testID="weekly-requests-bar-fill"
        style={{
          width: `${fraction * 100}%`,
          height: '100%',
          backgroundColor: theme.colors.green,
          borderRadius: theme.radii.full,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  countRow: { flexDirection: 'row', alignItems: 'flex-end' },
  track: { height: 8, width: '100%', overflow: 'hidden' },
});
