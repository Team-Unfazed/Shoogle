/**
 * "Where did my post views go?" — the section no competitor ships. Owner: Pranay.
 *
 * WHY THIS EXISTS
 * ---------------
 * Google deleted a large slice of the Business Profile metric surface in
 * February and March 2023 and shipped no replacement. Post views, post button
 * clicks, photo views, photo counts, the direct/discovery/branded query split
 * and the map of where direction requests came from are all gone permanently.
 *
 * Every other tool an owner has used showed those numbers once. Most now show
 * either nothing, a `0`, or a "coming soon" — all three of which are lies of a
 * different flavour. Shoogle names them, says when Google removed them, and
 * says there is no replacement coming. An owner who has wondered for two years
 * where their post views went gets an answer here and nowhere else.
 *
 * HOW THE COPY IS GUARANTEED HONEST
 * ---------------------------------
 * Nothing on this card is written here. Each row is built from
 * `removedMetricState(id)`, which by construction can only return
 * `unavailable('not_supported', …)` — there is no code path in
 * `features/seo/metrics.ts` that turns a removed metric into a number, and so
 * no way for this component to grow one. The dash it renders is
 * `UNKNOWN_VALUE_PLACEHOLDER`, the same dash used everywhere else for "we do
 * not have this", because these are not zeros either.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Divider, Text, UNKNOWN_VALUE_PLACEHOLDER } from '@/components/ui';
import {
  LIVE_DAILY_METRICS,
  REMOVED_METRICS,
  RENAMED_METRICS,
  removedMetricState,
  type RemovedMetricId,
} from '@/features/seo';
import { useTheme } from '@/theme';

import { formatShortDay } from './model';

/**
 * The five an owner arriving from another tool actually looks for, in the order
 * they ask about them. The rest are one tap away rather than buried.
 */
const HEADLINE_REMOVED: readonly RemovedMetricId[] = [
  'LOCAL_POST_VIEWS_SEARCH',
  'LOCAL_POST_ACTIONS_CALL_TO_ACTION',
  'PHOTOS_VIEWS_MERCHANT',
  'QUERIES_DIRECT',
  'DRIVING_DIRECTION_GEOGRAPHY',
];

const REST_REMOVED: readonly RemovedMetricId[] = (
  Object.keys(REMOVED_METRICS) as RemovedMetricId[]
).filter((id) => !HEADLINE_REMOVED.includes(id));

/** `2023-02-20` -> `20 Feb 2023`. */
function discontinuedLabel(iso: string): string {
  const short = formatShortDay(iso);
  const year = iso.slice(0, 4);
  return short === null ? iso : `${short} ${year}`;
}

function RemovedRow({ id, testID }: { id: RemovedMetricId; testID?: string }) {
  const theme = useTheme();
  const definition = REMOVED_METRICS[id];

  // The ONLY state a removed metric may produce. Typed `UnavailableState`, so
  // there is no `.value` on it to accidentally render.
  const state = removedMetricState(id);

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${definition.label}. Not available. ${state.message} Google removed it on ${discontinuedLabel(definition.discontinuedOn)}.`}
      style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
      <View style={styles.row}>
        <Text variant="bodyStrong" style={styles.rowLabel}>
          {definition.label}
        </Text>
        <Text variant="cardTitle" tone="muted2">
          {UNKNOWN_VALUE_PLACEHOLDER}
        </Text>
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
        {state.message}
      </Text>

      <Text variant="label" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
        {`Removed by Google · ${discontinuedLabel(definition.discontinuedOn)}`}
      </Text>
    </View>
  );
}

export interface RemovedMetricsCardProps {
  testID?: string;
}

export function RemovedMetricsCard({ testID }: RemovedMetricsCardProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? [...HEADLINE_REMOVED, ...REST_REMOVED] : HEADLINE_REMOVED;

  return (
    <View testID={testID}>
      <Card>
        <Badge label="Removed by Google in 2023" accent="red" testID="removed-metrics-badge" />

        <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
          These numbers existed once. Google deleted them from its API in 2023 and published no
          replacement, so no tool can show them — including this one. Anything that still shows you
          a post-view count is either estimating it or reading a number Google no longer publishes.
        </Text>

        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
          They are shown as {UNKNOWN_VALUE_PLACEHOLDER} rather than 0 for the same reason everything
          else on this screen is: nobody measured them, so zero would be a claim.
        </Text>
      </Card>

      <Card padded={false} style={{ marginTop: theme.spacing.md }}>
        {shown.map((id, index) => (
          <View key={id}>
            {index > 0 ? <Divider spacing={0} inset={theme.spacing.lg} /> : null}
            <RemovedRow id={id} testID={`removed-metric-${id}`} />
          </View>
        ))}
      </Card>

      <Button
        variant="secondary"
        size="small"
        label={
          expanded
            ? 'Show fewer'
            : `Show all ${HEADLINE_REMOVED.length + REST_REMOVED.length} removed metrics`
        }
        onPress={() => setExpanded((value) => !value)}
        accessibilityHint={
          expanded
            ? 'Collapses the list back to the five most asked about'
            : 'Lists every Business Profile metric Google removed in 2023'
        }
        style={{ marginTop: theme.spacing.md }}
        testID="removed-metrics-toggle"
      />

      <Card style={{ marginTop: theme.spacing.lg }} testID="renamed-metrics-card">
        <Badge label="Renamed, not removed" accent="blue" />

        <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
          These were not deleted — Google split or renamed them, so there is still an honest answer.
          If you remember one of these from an older report, this is where it went.
        </Text>

        {RENAMED_METRICS.map((entry) => (
          <View key={entry.legacyId} style={{ marginTop: theme.spacing.md }}>
            <Text variant="bodyStrong">{entry.label}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {`Now: ${entry.replacedBy.map((metric) => LIVE_DAILY_METRICS[metric].label).join(' + ')}`}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, minWidth: 0 },
});
