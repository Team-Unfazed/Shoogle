/**
 * A day-by-day series, drawn with Views. Owner: Pranay.
 *
 * WHY THERE IS NO CANVAS HERE
 * ---------------------------
 * Every number and label on this chart is a real `<Text>` node, so TalkBack can
 * read it and so a screenshot of the screen still contains its own evidence. A
 * canvas or an SVG path would turn the whole dashboard into one opaque image
 * with a hand-written label bolted on — which is how dashboards end up saying
 * something different to a sighted user and to a screen-reader user.
 *
 * THE THREE MARKS, AND WHY THEY LOOK DIFFERENT
 * --------------------------------------------
 *   a filled bar      Google reported a count for that day.
 *   a flat baseline   Google reported that day and the count was ZERO. There is
 *                     still a mark, because a measured zero is a reading.
 *   a hollow slot     Google reported nothing for that day. There is no mark,
 *                     because there is no reading — and an invisible bar would
 *                     be indistinguishable from a zero.
 *
 * A zero-height bar for a measured zero and a zero-height bar for a missing day
 * are the same pixels, which is exactly the conflation this product exists to
 * avoid. Hence two visibly different marks, a legend that names both in words,
 * and a text summary that counts both.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { LIVE_DAILY_METRICS, type LiveDailyMetric } from '@/features/seo';
import { useTheme } from '@/theme';

import type { GbpDailyPoint } from '../../types';
import { describeSeries, formatShortDay } from './model';

/**
 * Plot-area height in points. Chart geometry is not in the token scale (the
 * tokens cover spacing, radii, type and control heights), so it is a named
 * constant here rather than a magic number sprinkled through the styles.
 */
const PLOT_HEIGHT = 116;
/** Height of the mark that means "reported, and it was zero". */
const ZERO_MARK_HEIGHT = 3;
/** Shortest visible bar, so a count of 1 next to a peak of 400 still shows. */
const MIN_BAR_HEIGHT = 3;

export interface DailySeriesChartProps {
  metric: LiveDailyMetric;
  points: readonly GbpDailyPoint[];
  /** e.g. `31 Mar – 28 Jun`. Null when the range could not be formatted. */
  rangeLabel: string | null;
  testID?: string;
}

function LegendSwatch({
  children,
  style,
}: {
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={style} />
      {children}
    </View>
  );
}

export function DailySeriesChart({ metric, points, rangeLabel, testID }: DailySeriesChartProps) {
  const theme = useTheme();
  const definition = LIVE_DAILY_METRICS[metric];
  const shape = describeSeries(points);
  const peakCount = shape.peak?.count ?? 0;

  const peakDay = shape.peak === null ? null : formatShortDay(shape.peak.date);
  const troughDay = shape.trough === null ? null : formatShortDay(shape.trough.date);

  /**
   * One sentence carrying everything the bars carry. This is what a screen
   * reader hears, and it must not be a summary of a different chart.
   */
  const spokenSummary = [
    `${definition.label} by day${rangeLabel === null ? '' : `, ${rangeLabel}`}.`,
    `${shape.reportedDays} of ${shape.days} days reported by Google.`,
    shape.zeroDays > 0 ? `${shape.zeroDays} of those days measured zero.` : null,
    shape.unreportedDays > 0
      ? `${shape.unreportedDays} days have no reading and are drawn as empty slots, not as zero.`
      : null,
    shape.peak !== null && peakDay !== null ? `Busiest day ${shape.peak.count} on ${peakDay}.` : null,
    shape.trough !== null && troughDay !== null
      ? `Quietest reported day ${shape.trough.count} on ${troughDay}.`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');

  return (
    <View testID={testID}>
      <View style={styles.scaleRow}>
        <Text variant="label" tone="muted2">
          {`Peak ${peakCount.toLocaleString('en-IN')}`}
        </Text>
        <Text variant="label" tone="muted2">
          {rangeLabel ?? 'Dates unavailable'}
        </Text>
      </View>

      {/*
        The bars are decoration: everything they encode is also in the text
        below, so announcing 90 unlabelled views would be noise.
      */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.plot, { height: PLOT_HEIGHT, marginTop: theme.spacing.sm }]}
        testID={testID === undefined ? undefined : `${testID}-plot`}>
        {points.map((point) => {
          if (point.kind !== 'reported') {
            return (
              <View
                key={point.date}
                style={[
                  styles.slot,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.card2,
                    borderRadius: theme.radii.xs,
                  },
                ]}
              />
            );
          }

          if (point.count === 0) {
            return (
              <View
                key={point.date}
                style={[
                  styles.bar,
                  {
                    height: ZERO_MARK_HEIGHT,
                    backgroundColor: theme.colors.muted2,
                    borderRadius: theme.radii.xs,
                  },
                ]}
              />
            );
          }

          const height =
            peakCount > 0
              ? Math.max(MIN_BAR_HEIGHT, Math.round((point.count / peakCount) * PLOT_HEIGHT))
              : MIN_BAR_HEIGHT;

          return (
            <View
              key={point.date}
              style={[
                styles.bar,
                { height, backgroundColor: theme.colors.green, borderRadius: theme.radii.xs },
              ]}
            />
          );
        })}
      </View>

      <View style={[styles.legend, { marginTop: theme.spacing.md }]}>
        <LegendSwatch
          style={{
            width: 10,
            height: 10,
            borderRadius: theme.radii.xs,
            backgroundColor: theme.colors.green,
          }}>
          <Text variant="caption" tone="muted">
            Measured
          </Text>
        </LegendSwatch>

        <LegendSwatch
          style={{
            width: 10,
            height: ZERO_MARK_HEIGHT,
            borderRadius: theme.radii.xs,
            backgroundColor: theme.colors.muted2,
          }}>
          <Text variant="caption" tone="muted">
            Measured zero
          </Text>
        </LegendSwatch>

        <LegendSwatch
          style={{
            width: 10,
            height: 10,
            borderRadius: theme.radii.xs,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card2,
          }}>
          <Text variant="caption" tone="muted">
            No reading
          </Text>
        </LegendSwatch>
      </View>

      <Text
        accessible
        accessibilityLabel={spokenSummary}
        variant="caption"
        tone="muted"
        style={{ marginTop: theme.spacing.md }}
        testID={testID === undefined ? undefined : `${testID}-summary`}>
        {`Google reported ${shape.reportedDays} of ${shape.days} days.`}
        {shape.zeroDays > 0 ? ` ${shape.zeroDays} of them measured zero.` : ''}
        {shape.unreportedDays > 0
          ? ` ${shape.unreportedDays} days have no reading at all — those are the empty slots, and they are not zeros.`
          : ''}
      </Text>

      {shape.peak !== null && peakDay !== null ? (
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.xs }}>
          {`Busiest day: ${shape.peak.count.toLocaleString('en-IN')} on ${peakDay}.`}
          {shape.trough !== null && troughDay !== null
            ? ` Quietest reported day: ${shape.trough.count.toLocaleString('en-IN')} on ${troughDay}.`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scaleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // `gap: 1` plus `flex: 1` per column means 7 days and 90 days both fit the
  // same width with no horizontal overflow at 390 or 412.
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  bar: { flex: 1, minWidth: 0 },
  slot: { flex: 1, minWidth: 0, height: '100%', borderWidth: StyleSheet.hairlineWidth },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
