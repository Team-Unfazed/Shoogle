/**
 * One live metric, rendered so that its status is unmistakable. Owner: Pranay.
 *
 * Presentational only. It fetches nothing, decides nothing and cannot reach
 * `fixtures/` — the screen owns where the numbers came from and the banner that
 * has to accompany them.
 *
 * FOUR FACTS, FOUR APPEARANCES
 * ----------------------------
 *   measured        `61`  · green "Measured" pill · the window it covers
 *   measured zero   `0`   · neutral "Measured zero" pill · "Google counted none"
 *   not reported    `—`   · amber "Not reported" pill · why, and that it is not 0
 *   not applicable  `—`   · neutral "Not applicable" pill · the observation
 *
 * The number itself goes through `<Metric>`, whose `value` is `number | null`.
 * That is the type-level reason this component cannot print a fake zero: an
 * unknown has no numeric representation to print.
 *
 * A partly-reported window is not a fifth appearance — it is a measured total
 * carrying an explicit "Google reported 26 of 28 days" so the figure reads as
 * the floor it is.
 */

import { View } from 'react-native';

import { Badge, Metric, Text } from '@/components/ui';
import { LIVE_DAILY_METRICS } from '@/features/seo';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

import type { PerformanceRow } from './model';

interface StatusChip {
  readonly label: string;
  readonly accent: AccentName;
}

/**
 * The pill copy for each reading.
 *
 * "Measured zero" exists because `0` on its own is ambiguous to an owner who
 * has seen other tools print `0` for data they never fetched. Saying it out
 * loud is the whole point.
 */
export function statusChipFor(row: PerformanceRow): StatusChip {
  switch (row.reading.kind) {
    case 'measured':
      return row.reading.total === 0
        ? { label: 'Measured zero', accent: 'neutral' }
        : { label: 'Measured', accent: 'green' };
    case 'not_reported':
      return { label: 'Not reported', accent: 'amber' };
    case 'not_applicable':
      return { label: 'Not applicable', accent: 'neutral' };
  }
}

/**
 * The sentence under the number: what this reading actually means.
 *
 * Every branch names the fact rather than the absence of one. "Not reported"
 * says explicitly that it is not a zero, because that is the confusion the
 * whole screen is built to remove.
 */
export function explanationFor(row: PerformanceRow): string {
  switch (row.reading.kind) {
    case 'measured': {
      const coverage = row.reading.coverage;
      if (coverage !== null && coverage.reportedDays !== coverage.totalDays) {
        return `Google reported ${coverage.reportedDays} of ${coverage.totalDays} days, so this is at least ${row.reading.total} — the missing days have no reading and have not been filled in with zeros.`;
      }
      if (row.reading.total === 0) {
        return 'Google measured every day of this period and counted none. This is a real zero, not a missing number.';
      }
      return 'Counted by Google across every day of this period.';
    }
    case 'not_reported':
      return 'Google returned no days for this metric, so there is no number to show. It is unknown — not zero.';
    case 'not_applicable':
      return `${row.reading.observation} A metric that cannot happen here is not shown as 0.`;
  }
}

/** The value handed to `<Metric>`. Null for everything we do not know. */
export function valueFor(row: PerformanceRow): number | null {
  return row.reading.kind === 'measured' ? row.reading.total : null;
}

export interface MetricReadingCardProps {
  row: PerformanceRow;
  testID?: string;
}

export function MetricReadingCard({ row, testID }: MetricReadingCardProps) {
  const theme = useTheme();
  const definition = LIVE_DAILY_METRICS[row.metric];
  const chip = statusChipFor(row);
  const value = valueFor(row);

  const unavailableReason =
    row.reading.kind === 'not_reported'
      ? `Not reported by Google for the ${row.periodLabel}`
      : row.reading.kind === 'not_applicable'
        ? 'Does not apply to this business'
        : undefined;

  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.lg,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <Metric
          style={{ flex: 1 }}
          testID={testID === undefined ? undefined : `${testID}-value`}
          label={definition.label}
          value={value}
          unit="count"
          period={row.periodLabel}
          changePct={row.reading.kind === 'measured' ? row.reading.changePct : null}
          unavailableReason={unavailableReason}
        />
        <Badge
          label={chip.label}
          accent={chip.accent}
          testID={testID === undefined ? undefined : `${testID}-status`}
        />
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {explanationFor(row)}
      </Text>

      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.xs }}>
        {definition.note}
      </Text>
    </View>
  );
}
