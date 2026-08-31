import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Divider, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import {
  AGENT_STATUS_LEDGER,
  describeAgentStatus,
  type AgentStatusKind,
  type AgentStatusResolution,
} from './model';

/**
 * "Can the agent act right now, and if not, what exactly is stopping it."
 *
 * This is the card the competitor renders as a permanent green "Active" pill.
 * Three things are different here:
 *
 *  - The pill has seven possible values and the word "Active" is not one of
 *    them. `describeAgentStatus` owns the copy; this file only lays it out.
 *  - Every blocker that is ALSO true is listed. Fixing the first one and
 *    finding nothing works is the failure mode of showing only the first.
 *  - The state ledger at the bottom shows what this pill CAN say. It makes no
 *    claim about which of those states is currently false — only the resolved
 *    status is claimed — but it means an owner can see at a glance that the
 *    badge is reporting rather than decorating.
 */
export interface AgentStatusCardProps {
  resolution: AgentStatusResolution;
  /** Invoked with the owner action's label. The screen decides what to do. */
  onOwnerAction: (label: string) => void;
  testID?: string;
}

export function AgentStatusCard({ resolution, onOwnerAction, testID }: AgentStatusCardProps) {
  const theme = useTheme();
  const description = describeAgentStatus(resolution.status);
  const palette = theme.accent(description.accent);

  return (
    <Card testID={testID}>
      <View style={[styles.header, { gap: theme.spacing.md }]}>
        <View
          style={[
            styles.tile,
            {
              backgroundColor: palette.bg,
              width: theme.control.minTouchTarget,
              height: theme.control.minTouchTarget,
              borderRadius: theme.radii.lg,
            },
          ]}>
          <Ionicons
            name={description.canAct ? 'flash' : 'flash-off'}
            size={theme.spacing.xl}
            color={palette.fg}
          />
        </View>

        <View style={styles.headerText}>
          <Text variant="label" tone="muted2">
            Shoogle Agent
          </Text>
          <Text
            variant="cardTitle"
            style={{ marginTop: theme.spacing.xs }}
            testID={testID === undefined ? undefined : `${testID}-headline`}>
            {description.headline}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.md, alignSelf: 'flex-start' }}>
        <Badge
          label={description.badge}
          accent={description.accent}
          testID={testID === undefined ? undefined : `${testID}-badge`}
        />
      </View>

      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.md }}>
        {description.body}
      </Text>

      {resolution.alsoBlocking.length > 0 ? (
        <View
          testID={testID === undefined ? undefined : `${testID}-also-blocking`}
          style={[
            styles.also,
            {
              backgroundColor: theme.colors.card2,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.md,
              marginTop: theme.spacing.lg,
            },
          ]}>
          <Text variant="label" tone="muted2">
            Also true right now
          </Text>
          {resolution.alsoBlocking.map((line) => (
            <View
              key={line}
              style={[styles.row, { marginTop: theme.spacing.sm, gap: theme.spacing.sm }]}>
              <Ionicons
                name="remove-circle-outline"
                size={theme.spacing.lg}
                color={theme.colors.muted2}
              />
              <Text variant="caption" tone="muted" style={styles.rowText}>
                {line}
              </Text>
            </View>
          ))}
          <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
            Clearing the one above would not be enough on its own.
          </Text>
        </View>
      ) : null}

      {description.ownerAction !== null ? (
        <Button
          label={description.ownerAction}
          variant="secondary"
          size="medium"
          onPress={() => onOwnerAction(description.ownerAction ?? '')}
          accessibilityHint="Shoogle will say what it can and cannot do about this"
          style={{ marginTop: theme.spacing.lg }}
          testID={testID === undefined ? undefined : `${testID}-owner-action`}
        />
      ) : null}

      <Divider spacing={theme.spacing.lg} />

      <AgentStateLedger
        current={resolution.status.kind}
        testID={testID === undefined ? undefined : `${testID}-ledger`}
      />
    </Card>
  );
}

/**
 * What this badge is capable of saying.
 *
 * Deliberately NOT a checklist: an unmarked row means "not the state we
 * resolved", not "we checked and it is false". With no connection we cannot
 * know whether the profile is verified, and a tick or a cross against that row
 * would be a claim we have no basis for.
 */
export function AgentStateLedger({
  current,
  testID,
}: {
  current: AgentStatusKind;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <View testID={testID}>
      <Text variant="label" tone="muted2">
        What this badge can say
      </Text>
      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
        Every one of these is a state Shoogle will name out loud. Only the marked row is being
        claimed right now; the rest are not being called false.
      </Text>

      {AGENT_STATUS_LEDGER.map((entry) => {
        const isCurrent = entry.kind === current;
        return (
          <View
            key={entry.kind}
            accessible
            accessibilityRole="text"
            accessibilityLabel={
              isCurrent
                ? `${entry.label}. This is the state right now. ${entry.meaning}`
                : `${entry.label}. ${entry.meaning}`
            }
            style={[
              styles.ledgerRow,
              {
                marginTop: theme.spacing.md,
                borderRadius: theme.radii.sm,
                padding: theme.spacing.sm,
                gap: theme.spacing.sm,
                backgroundColor: isCurrent ? theme.colors.card2 : 'transparent',
              },
            ]}>
            <View
              style={[
                {
                  width: theme.spacing.sm,
                  height: theme.spacing.sm,
                  marginTop: theme.spacing.xs + 2,
                  backgroundColor: isCurrent ? theme.colors.blue : theme.colors.border,
                  borderRadius: theme.radii.full,
                },
              ]}
            />
            <View style={styles.rowText}>
              <Text variant={isCurrent ? 'bodyStrong' : 'body'}>
                {entry.label}
                {isCurrent ? ' — right now' : ''}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {entry.meaning}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Layout only. Every colour, radius, gap and font size comes from the theme at
 * render time — nothing measurable is frozen into this sheet.
 */
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  also: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowText: { flex: 1, minWidth: 0 },
  ledgerRow: { flexDirection: 'row', alignItems: 'flex-start' },
});
