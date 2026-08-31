import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Score, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

import type { AuditRun } from '../engine';
import { TOP_FINDINGS_COUNT } from '../ordering';
import type { Severity } from '../types';

/**
 * The compact audit block for the Business tab. Owner: Pranay.
 *
 * It is a summary, not a second implementation: everything on it comes off the
 * same `AuditRun` the full report screen renders, so the tab and the report can
 * never disagree about the score, the top finding or how much was unchecked.
 *
 * WHAT IT MUST NEVER DO
 *  - Show a number when `report` is unavailable. `<Score value={null}>` renders
 *    "—" and "Not measured yet"; a 0 there would be a lie the owner may act on.
 *  - Hide findings because there is no score. §3.3: a missing number never
 *    suppresses a real problem, and this card shows the top one either way.
 *  - Swallow the unchecked count. A partial audit says so, even at this size.
 *
 * `onPress` is required: the card is a doorway to `/seo/audit` and must always
 * lead somewhere. It takes a callback rather than an href so the route stays
 * with the screen that owns it and typed routes stay satisfiable.
 */

const SEVERITY_ACCENT: Record<Severity, AccentName> = {
  critical: 'red',
  important: 'amber',
  minor: 'neutral',
};

export interface AuditSummaryCardProps {
  /** The run to summarise. `null` means no audit has been performed at all. */
  run: AuditRun | null;
  /** True while the run is being produced. Renders the card's own skeleton. */
  loading?: boolean;
  /** Opens the full report. Required — a summary with no doorway is a dead end. */
  onPress: () => void;
  testID?: string;
}

export function AuditSummaryCard({
  run,
  loading = false,
  onPress,
  testID,
}: AuditSummaryCardProps) {
  const theme = useTheme();

  if (loading) {
    return <Card testID={testID ?? 'audit-summary'} loading loadingHeight={84} />;
  }

  const report = run?.report ?? null;
  const score = report !== null && report.status === 'ready' ? report.value.score : null;
  const topFinding = run?.findings[0] ?? null;
  const remaining = Math.max((run?.findings.length ?? 0) - TOP_FINDINGS_COUNT, 0);
  const uncheckedCount = run?.uncheckedCount ?? 0;

  // "Not measured yet" is not repeated here: `<Score value={null}>` already
  // says it under the dial, and saying it twice reads as two separate facts.
  const headline =
    run === null
      ? 'Profile health'
      : score !== null
        ? 'How you look on Google'
        : 'Not enough measured to score yet';

  const body =
    run === null
      ? 'Connect Google Business Profile and Shoogle will check 34 things about your listing.'
      : topFinding !== null
        ? topFinding.title
        : 'Every check that ran came back clean.';

  const accessibilityLabel = [
    'Profile audit',
    score !== null ? `score ${score} out of 100` : 'no score yet',
    topFinding !== null ? `first thing to fix: ${topFinding.title}` : null,
    uncheckedCount > 0
      ? `${uncheckedCount} check${uncheckedCount === 1 ? '' : 's'} could not be run`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join('. ');

  return (
    <Card
      testID={testID ?? 'audit-summary'}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens the full profile audit"
      padded={false}>
      <View style={[styles.row, { padding: theme.spacing.lg, gap: theme.spacing.lg }]}>
        {/*
          `uncheckedCount` is deliberately NOT passed here: at this size the
          caveat is rendered once, as its own line below, rather than twice.
          It is never dropped — see the amber line at the end of the block.
        */}
        <Score value={score} size="small" label="Score" testID="audit-summary-score" />

        <View style={styles.body}>
          <Text variant="cardTitle" numberOfLines={1}>
            {headline}
          </Text>

          <View style={[styles.findingRow, { marginTop: theme.spacing.xs }]}>
            {topFinding !== null ? (
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: theme.accent(SEVERITY_ACCENT[topFinding.severity]).fg,
                    marginRight: theme.spacing.sm,
                  },
                ]}
              />
            ) : null}
            <Text variant="body" tone="muted" numberOfLines={2} style={styles.bodyText}>
              {body}
            </Text>
          </View>

          {remaining > 0 ? (
            <Text variant="caption" tone="blue" style={{ marginTop: theme.spacing.xs }}>
              {`${remaining} more thing${remaining === 1 ? '' : 's'} to check`}
            </Text>
          ) : null}

          {/*
            The caveat survives the shrink to a tab card. A partial audit that
            looks complete here is the same lie it would be on the report.
          */}
          {uncheckedCount > 0 ? (
            <Text variant="caption" tone="amber" style={{ marginTop: theme.spacing.xs }}>
              {`${uncheckedCount} check${uncheckedCount === 1 ? '' : 's'} could not be run`}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={18} color={theme.colors.muted2} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, minWidth: 0 },
  bodyText: { flex: 1 },
  findingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
});
