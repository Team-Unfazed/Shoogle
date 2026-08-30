/**
 * "What people searched" — the body of `app/seo/searches.tsx`. Owner: Pranay.
 *
 * This is Shoogle's answer to a rank number, and it is a better answer because
 * it is true. Google publishes no search-rank position through any API, but
 * `locations.searchkeywords.impressions.monthly` DOES return the actual queries
 * that surfaced the listing. "1,240 people found you searching 'hair spa near
 * me'" is truer, more useful and more motivating than "you are rank 4", and it
 * is a fact rather than an estimate.
 *
 * The component is presentational: it takes a `DataState` and renders it. It
 * fetches nothing, invents nothing, and cannot reach `fixtures/` — the screen
 * decides where the data came from and pins the fixture banner.
 *
 * FOUR FACTS, FOUR APPEARANCES
 * ----------------------------
 *   we could not ask        -> an empty state naming the reason
 *   Google counted N        -> `1,240`
 *   Google counted none     -> `0`, labelled "measured zero"
 *   Google reported a bound -> `<15`, labelled a range, explained once below
 */

import React from 'react';
import { View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Badge, Card, Divider, EmptyState, Section, Text } from '@/components/ui';
import { UNAVAILABLE_COPY, type DataState, type UnavailableReason } from '@/lib/state/DataState';
import { useTheme } from '@/theme';
import {
  compareKeywordRows,
  countBelowThreshold,
  groupThousands,
  type KeywordImpressionRow,
} from '../keywords';
import { RANK_NOT_MEASURABLE_MESSAGE, type SearchKeywordsReport } from '../types';
import { formatIsoDay, formatMonthStart } from './evidence';
import { KeywordRow } from './KeywordRow';

/* -------------------------------------------------------------------------- */
/* Unavailable states                                                         */
/* -------------------------------------------------------------------------- */

interface ReasonCopy {
  readonly title: string;
  readonly body: string;
  readonly extra: string | null;
  readonly icon: React.ComponentProps<typeof EmptyState>['icon'];
}

/**
 * Keyword-specific wording for each honest failure. `UNAVAILABLE_COPY` covers
 * the generic case; these say what it means for THIS screen, because "Not
 * connected" on its own does not tell a salon owner what they are missing.
 */
const REASON_COPY: Readonly<Record<UnavailableReason, ReasonCopy>> = {
  not_connected: {
    title: 'Not connected',
    body: 'Connect your Google Business Profile and Shoogle will show the search terms people actually used to find you.',
    extra: null,
    icon: 'link-outline',
  },
  no_data_yet: {
    title: 'No search terms yet',
    body: 'Google has not reported any search terms for this month.',
    extra:
      'This is normal for a new or quiet profile. Google publishes this report monthly, and a term only appears once someone has used it.',
    icon: 'time-outline',
  },
  rate_limited: {
    title: 'Google is limiting requests',
    body: 'Google has temporarily capped how often Shoogle can ask for your search terms.',
    extra:
      'Nothing is lost and nothing is wrong with your profile. The terms are still there — this will load once the limit clears.',
    icon: 'hourglass-outline',
  },
  insufficient_data: {
    title: 'Not enough to report',
    body: 'There were too few searches this month for Google to report a term at all.',
    extra: 'We would rather show you nothing than show you a number we invented.',
    icon: 'ellipse-outline',
  },
  auth_expired: {
    title: 'Reconnect needed',
    body: 'Your Google access expired, so this month’s search terms could not be read.',
    extra: null,
    icon: 'refresh-outline',
  },
  offline: {
    title: 'Offline',
    body: 'You are offline, so this could not be fetched.',
    extra: null,
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

function KeywordsUnavailable({ reason, message }: { reason: UnavailableReason; message: string }) {
  const theme = useTheme();
  const copy = REASON_COPY[reason];
  const trimmed = message.trim();

  return (
    <View>
      <EmptyState
        testID="searches-unavailable"
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
/* Lead sentence                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The one line that replaces a rank number.
 *
 * It is only ever built from an EXACT reading. A bound cannot headline a
 * screen: "fewer than 15 people found you" is true, but it is not a number, and
 * writing it as one is the mistake this whole feature exists to prevent.
 */
export function leadSentence(rows: readonly KeywordImpressionRow[]): string {
  for (const row of rows) {
    if (row.impressions.kind === 'exact' && row.impressions.value > 0) {
      return `${groupThousands(row.impressions.value)} people found you searching “${row.keyword}”.`;
    }
  }
  if (rows.some((row) => row.impressions.kind === 'below_threshold')) {
    return 'Every term you were found for this month came back as a range. Google only reports an exact count once a term passes its reporting floor.';
  }
  return 'Google reported these terms this month and counted nobody on any of them.';
}

/* -------------------------------------------------------------------------- */
/* The view                                                                   */
/* -------------------------------------------------------------------------- */

export interface SearchKeywordsViewProps {
  state: DataState<SearchKeywordsReport>;
  /** Omit when a retry cannot help. */
  onRetry?: () => void;
}

export function SearchKeywordsView({ state, onRetry }: SearchKeywordsViewProps) {
  const theme = useTheme();

  const emptyOverride =
    state.status === 'unavailable' ? (
      <KeywordsUnavailable reason={state.reason} message={state.message} />
    ) : (
      <KeywordsUnavailable
        reason="no_data_yet"
        message="Google returned this month’s report and there were no search terms in it."
      />
    );

  return (
    <DataStateView
      testID="searches-state"
      state={state}
      onRetry={onRetry}
      skeletonLines={6}
      emptyWhen={(report) => report.rows.length === 0}
      emptyOverride={emptyOverride}>
      {(report, meta) => {
        const rows = [...report.rows].sort(compareKeywordRows);
        const bounded = countBelowThreshold(rows);
        const month = formatMonthStart(report.monthStart);
        const readOn = formatIsoDay(meta.fetchedAt);

        return (
          <View>
            <Text variant="label" tone="muted2">
              {month === null ? 'Search terms' : `Search terms · ${month}`}
            </Text>

            <Text
              accessibilityRole="header"
              style={{
                fontFamily: theme.fontFamily.display,
                fontSize: 22,
                lineHeight: 30,
                letterSpacing: -0.44,
                color: theme.colors.text,
                marginTop: theme.spacing.sm,
              }}>
              {leadSentence(rows)}
            </Text>

            <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
              {rows.length === 1 ? '1 term' : `${rows.length} terms`}
              {bounded > 0 ? ` · ${bounded} reported as a range` : ''}
              {readOn === null ? '' : ` · read ${readOn}`}
            </Text>

            {report.partial ? (
              <Card style={{ marginTop: theme.spacing.lg }} testID="partial-notice">
                <Badge label="Incomplete list" accent="amber" />
                <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                  Google returned fewer terms than it holds for this month, so this is part of the
                  list and not all of it. Nothing has been estimated to fill the gap.
                </Text>
              </Card>
            ) : null}

            <Section title="What people typed">
              <Card padded={false}>
                {rows.map((row, index) => (
                  <View key={`${row.keyword}-${row.monthStart}`}>
                    {index > 0 ? <Divider spacing={0} inset={theme.spacing.lg} /> : null}
                    <KeywordRow row={row} testID={`keyword-row-${index}`} />
                  </View>
                ))}
              </Card>
            </Section>

            {bounded > 0 ? (
              <Section title="Why some rows read “under 15”">
                <Card testID="threshold-explainer">
                  <Text variant="body">
                    When very few people use a term, Google reports a limit instead of a number.
                    “&lt;15” means fewer than fifteen people searched it that month. Google will not
                    say how many, so neither will we.
                  </Text>
                  <Text variant="body" style={{ marginTop: theme.spacing.md }}>
                    It is not zero — a term nobody searched shows as 0 and says so. And it is not
                    fifteen either: fifteen is the line, not the count.
                  </Text>
                  <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
                    Most terms for a neighbourhood business come back this way. Shoogle never adds
                    these rows into a total, because adding a range to a count produces a number
                    Google never reported.
                  </Text>
                </Card>
              </Section>
            ) : null}

            <Section title="What this is not">
              <Card testID="no-rank-note">
                <Badge label="No rank here" accent="neutral" />
                <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
                  {RANK_NOT_MEASURABLE_MESSAGE}
                </Text>
                <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
                  These counts are unique users per month, deduplicated by Google. Two terms are not
                  two audiences, and one person searching twice is counted once.
                </Text>
              </Card>
            </Section>
          </View>
        );
      }}
    </DataStateView>
  );
}
