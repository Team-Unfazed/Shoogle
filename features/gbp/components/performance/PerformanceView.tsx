/**
 * The body of `app/seo/performance.tsx`. Owner: Pranay.
 *
 * Presentational. It takes a `DataState<PerformanceSnapshot>` and renders it;
 * it fetches nothing, invents nothing, and cannot reach `fixtures/`.
 *
 * WHAT THIS IS ANSWERING
 * ----------------------
 * The competitor's Performance tab opens with "Performance Analysis — review
 * results in 2 weeks". That is a promise with no visible basis: no metric, no
 * period, no statement of what was measured or whether it was measured at all.
 *
 * This screen inverts that. Every number carries three things that cannot be
 * omitted, because the type system carries them: the metric, the period it
 * covers, and whether the figure was MEASURED, is a genuine ZERO, was only
 * PARTLY reported, is UNKNOWN, or CANNOT APPLY to this business. There is no
 * verdict, no projection, and no rank — Google publishes no rank position
 * through any API, so none is rendered anywhere.
 *
 * WHAT RENDERS EVEN WITH NOTHING CONNECTED
 * ----------------------------------------
 * The "removed in 2023" section renders in every state, including the default
 * `not_connected` one. It is documentation about Google, not data about the
 * owner, and it is the single most useful thing on this screen for someone
 * arriving from another tool. Gating it behind a connection would hide the
 * answer from exactly the person asking the question.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DataStateView } from '@/components/shared';
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  Metric,
  Section,
  Tabs,
  Text,
  UNKNOWN_VALUE_PLACEHOLDER,
} from '@/components/ui';
import {
  LIVE_DAILY_METRICS,
  RANK_NOT_MEASURABLE_MESSAGE,
  type LiveDailyMetric,
} from '@/features/seo';
import { UNAVAILABLE_COPY, type DataState, type UnavailableReason } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

import { unsupportedCapabilityState } from '../../capabilities';
import { GBP_PERIODS, type GbpPerformancePeriod } from '../../performance';
import { DailySeriesChart } from './DailySeriesChart';
import { MetricReadingCard } from './MetricReadingCard';
import { RemovedMetricsCard } from './RemovedMetricsCard';
import {
  GROUP_COPY,
  GROUP_ORDER,
  chartableMetrics,
  combinedImpressions,
  formatRange,
  formatReadOn,
  rowsInGroup,
  seriesFor,
  shortPeriodLabel,
  type PerformanceSnapshot,
} from './model';

/* -------------------------------------------------------------------------- */
/* Unavailable states                                                         */
/* -------------------------------------------------------------------------- */

interface ReasonCopy {
  readonly title: string;
  /** Used only when the provider sent no message of its own. */
  readonly body: string;
  /** The extra sentence that says what this means for THIS screen. */
  readonly extra: string | null;
  readonly icon: React.ComponentProps<typeof EmptyState>['icon'];
}

/**
 * Performance-specific wording for each honest failure.
 *
 * `not_connected` is what a real build reports today, and it is the DEFAULT
 * state, not an error — so it reads as an explanation of what is missing rather
 * than as something having gone wrong.
 */
const REASON_COPY: Readonly<Record<UnavailableReason, ReasonCopy>> = {
  not_connected: {
    title: 'Nothing measured yet',
    body: 'No Google Business Profile is connected, so Google has not been asked for any of these numbers.',
    extra:
      'This is not an error — it is the honest state of a profile that has not been linked. Connect one and the eleven numbers Google still reports appear here, each labelled with whether Google actually answered for it.',
    icon: 'link-outline',
  },
  no_data_yet: {
    title: 'Google has no readings yet',
    body: 'Google has not reported a day of performance data for this profile.',
    extra:
      'This is normal for a listing that was verified recently. Google backfills nothing, so the first days appear only once they happen.',
    icon: 'time-outline',
  },
  insufficient_data: {
    title: 'Not enough to report',
    body: 'Google returned too few days to describe this period.',
    extra:
      'A part-period total presented as a full one reads as a measurement, so nothing is shown instead.',
    icon: 'ellipse-outline',
  },
  rate_limited: {
    title: 'Google is limiting requests',
    body: 'Google has temporarily capped how often Shoogle can read your performance data.',
    extra:
      'Nothing is wrong with your profile and no numbers are lost. This will load once the limit clears.',
    icon: 'hourglass-outline',
  },
  auth_expired: {
    title: 'Reconnect needed',
    body: 'Your Google access expired, so this period could not be read.',
    extra: null,
    icon: 'refresh-outline',
  },
  offline: {
    title: 'Offline',
    body: 'You are offline, so nothing could be fetched.',
    extra: 'This will load when you reconnect. No stale numbers are shown in the meantime.',
    icon: 'cloud-offline-outline',
  },
  not_supported: {
    title: 'Not available',
    body: 'Google does not share this.',
    extra: null,
    icon: 'close-circle-outline',
  },
  requires_upgrade: {
    title: 'Not on your plan',
    body: 'This is part of a higher plan.',
    extra: null,
    icon: 'lock-closed-outline',
  },
};

function PerformanceUnavailable({
  reason,
  message,
}: {
  reason: UnavailableReason;
  message: string;
}) {
  const theme = useTheme();
  const copy = REASON_COPY[reason];
  const trimmed = message.trim();

  return (
    <View>
      <EmptyState
        testID="performance-unavailable"
        title={copy.title}
        // The provider's own sentence is more specific when it sent one.
        body={trimmed.length > 0 ? trimmed : copy.body || UNAVAILABLE_COPY[reason].body}
        icon={copy.icon}
      />
      {copy.extra === null ? null : (
        <Text
          variant="caption"
          tone="muted2"
          align="center"
          style={{ marginTop: theme.spacing.sm, paddingHorizontal: theme.spacing.lg }}>
          {copy.extra}
        </Text>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Combined impressions                                                       */
/* -------------------------------------------------------------------------- */

function CombinedImpressionsCard({ snapshot }: { snapshot: PerformanceSnapshot }) {
  const theme = useTheme();
  const combined = combinedImpressions(snapshot.rows);

  return (
    <Card testID="combined-impressions">
      {combined.kind === 'total' ? (
        <>
          <Metric
            label="Times your profile appeared"
            value={combined.total}
            unit="count"
            period={snapshot.period.label}
            changePct={null}
            testID="combined-impressions-value"
          />
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            {`Google does not publish a single "profile views" number any more. This is the sum of all ${combined.splits} splits below, each of which Google reported for every day of the period.`}
          </Text>
          <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.xs }}>
            Impressions count unique people once per day, so this is not a count of views, and the
            four splits are not four separate audiences.
          </Text>
        </>
      ) : (
        <>
          <Metric
            label="Times your profile appeared"
            value={null}
            unit="count"
            unavailableReason="Cannot be added up honestly"
            testID="combined-impressions-value"
          />
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            {combined.message}
          </Text>
          <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.xs }}>
            The individual splits Google did report are still shown below, each labelled with what
            it covers.
          </Text>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The chart block                                                            */
/* -------------------------------------------------------------------------- */

function ChartBlock({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: PerformanceSnapshot;
  selected: LiveDailyMetric | null;
  onSelect: (metric: LiveDailyMetric) => void;
}) {
  const theme = useTheme();
  const chartable = chartableMetrics(snapshot);

  if (selected === null || chartable.length === 0) {
    return (
      <Card testID="chart-unavailable">
        <EmptyState
          compact
          icon="stats-chart-outline"
          title="No day-by-day readings"
          body="Google did not report a single day for any metric in this period, so there is nothing to plot. An empty chart would look like a flat line at zero, which would be a different claim entirely."
        />
      </Card>
    );
  }

  return (
    <View>
      <Tabs
        testID="chart-metric-tabs"
        accessibilityLabel="Choose which metric to plot by day"
        items={chartable.map((metric) => ({
          value: metric,
          label: LIVE_DAILY_METRICS[metric].label,
        }))}
        value={selected}
        onChange={onSelect}
      />

      <Card style={{ marginTop: theme.spacing.md }} testID="chart-card">
        <DailySeriesChart
          testID="daily-series-chart"
          metric={selected}
          points={seriesFor(snapshot, selected)}
          rangeLabel={formatRange(snapshot.windows.current)}
        />
      </Card>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* The view                                                                   */
/* -------------------------------------------------------------------------- */

export interface PerformanceViewProps {
  state: DataState<PerformanceSnapshot>;
  /** The period key currently requested, e.g. `28d`. */
  periodKey: string;
  onPeriodChange: (key: string) => void;
  /** Omit when a retry cannot help. */
  onRetry?: () => void;
}

export function PerformanceView({
  state,
  periodKey,
  onPeriodChange,
  onRetry,
}: PerformanceViewProps) {
  const theme = useTheme();

  // Which metric the chart is showing. Held here rather than inside the render
  // prop because hooks cannot live in a conditional branch, and reconciled
  // against the snapshot below so a period change can never leave the chart
  // pointing at a metric that period has no readings for.
  const [chartMetric, setChartMetric] = useState<LiveDailyMetric | null>(null);

  const periodItems = GBP_PERIODS.map((period: GbpPerformancePeriod) => ({
    value: period.key,
    label: shortPeriodLabel(period),
  }));

  return (
    <View>
      <DataStateView
        testID="performance-state"
        state={state}
        onRetry={onRetry}
        skeletonLines={8}
        emptyOverride={
          state.status === 'unavailable' ? (
            <PerformanceUnavailable reason={state.reason} message={state.message} />
          ) : (
            <PerformanceUnavailable
              reason="no_data_yet"
              message="Google returned this period and there was nothing in it."
            />
          )
        }>
        {(snapshot, meta) => {
          const chartable = chartableMetrics(snapshot);
          const selected =
            chartMetric !== null && chartable.includes(chartMetric)
              ? chartMetric
              : (chartable[0] ?? null);
          const rangeLabel = formatRange(snapshot.windows.current);
          const readOn = formatReadOn(meta.fetchedAt);

          return (
            <View>
              {/*
                The period control only exists once there is something to
                re-window. Rendering it over an unavailable state would be a
                control that visibly does nothing — a dead control.
              */}
              <Tabs
                testID="period-tabs"
                accessibilityLabel="Choose the period these numbers cover"
                items={periodItems}
                value={periodKey}
                onChange={onPeriodChange}
              />

              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
                {`Showing the ${snapshot.period.label}${rangeLabel === null ? '' : ` (${rangeLabel})`}. Google publishes no reporting lag, so the last day shown is the last day Google answered for — not today.`}
              </Text>

              {readOn === null ? null : (
                <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.xs }}>
                  {`Read from Google on ${readOn}.`}
                </Text>
              )}

              <Section title="Day by day">
                <ChartBlock snapshot={snapshot} selected={selected} onSelect={setChartMetric} />
              </Section>

              {GROUP_ORDER.map((group) => {
                const rows = rowsInGroup(snapshot.rows, group);
                if (rows.length === 0) return null;

                return (
                  <Section
                    key={group}
                    title={GROUP_COPY[group].title}
                    subtitle={GROUP_COPY[group].subtitle}
                    testID={`group-${group}`}>
                    {group === 'impressions' ? (
                      <View style={{ marginBottom: theme.spacing.md }}>
                        <CombinedImpressionsCard snapshot={snapshot} />
                      </View>
                    ) : null}

                    <Card padded={false}>
                      {rows.map((row, index) => (
                        <View key={row.metric}>
                          {index > 0 ? <Divider spacing={0} inset={theme.spacing.lg} /> : null}
                          <MetricReadingCard row={row} testID={`metric-${row.metric}`} />
                        </View>
                      ))}
                    </Card>
                  </Section>
                );
              })}

              <Section title="How to read this">
                <Card testID="reading-key">
                  <View style={styles.keyRow}>
                    <Badge label="Measured" accent="green" />
                    <Text variant="caption" tone="muted" style={styles.keyText}>
                      Google reported every day of the period and this is the total.
                    </Text>
                  </View>

                  <View style={[styles.keyRow, { marginTop: theme.spacing.md }]}>
                    <Badge label="Measured zero" accent="neutral" />
                    <Text variant="caption" tone="muted" style={styles.keyText}>
                      {`Google counted and found none. It renders as 0, because 0 is what happened.`}
                    </Text>
                  </View>

                  <View style={[styles.keyRow, { marginTop: theme.spacing.md }]}>
                    <Badge label="Not reported" accent="amber" />
                    <Text variant="caption" tone="muted" style={styles.keyText}>
                      {`Google returned nothing. It renders as ${UNKNOWN_VALUE_PLACEHOLDER}. It is unknown, and unknown is never shown as 0.`}
                    </Text>
                  </View>

                  <View style={[styles.keyRow, { marginTop: theme.spacing.md }]}>
                    <Badge label="Not applicable" accent="neutral" />
                    <Text variant="caption" tone="muted" style={styles.keyText}>
                      Google’s own listing data says this cannot happen for your business — a
                      restaurant metric is not shown to a salon as 0.
                    </Text>
                  </View>
                </Card>
              </Section>
            </View>
          );
        }}
      </DataStateView>

      {/*
        Renders in EVERY state, including not-connected. This is documentation
        about what Google deleted, not data about this business.
      */}
      <Section title="What Google removed in 2023" testID="removed-section">
        <RemovedMetricsCard testID="removed-metrics" />
      </Section>

      <Section title="What Shoogle will never show">
        <Card testID="no-rank-note">
          <Badge label="No rank, ever" accent="neutral" />
          <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
            {RANK_NOT_MEASURABLE_MESSAGE}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
            {unsupportedCapabilityState('search_rank_position').message}
          </Text>
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  keyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  keyText: { flex: 1, minWidth: 0 },
});
