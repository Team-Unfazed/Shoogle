/**
 * Evidence rendering. Owner: Pranay.
 *
 * Every claim these screens make is paired with two things: WHAT WAS OBSERVED,
 * quoted rather than paraphrased, and WHEN it was observed. `EvidenceLine`
 * takes both as required props, so a claim cannot be rendered without its
 * evidence — the rule is enforced by the type, not by review.
 *
 * `EvidenceBasis` copy follows `features/seo/types.ts`: a `study` finding is
 * labelled as a study and never as something Google said.
 *
 * Dates are formatted by hand rather than through `Intl`. Hermes ships a
 * variable ICU surface across Android versions, and an evidence date that
 * renders differently on two phones is a support ticket.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';
import type { EvidenceBasis } from '../types';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function monthName(oneBasedMonth: number): string | null {
  return MONTH_NAMES[oneBasedMonth - 1] ?? null;
}

/**
 * `2020-01-01T00:00:00.000Z` -> `1 January 2020`.
 *
 * Returns null when the string is not a date we can read, so a caller renders
 * "date unknown" rather than `Invalid Date` or, worse, today's date.
 */
export function formatIsoDay(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  const name = monthName(date.getUTCMonth() + 1);
  if (name === null) return null;
  return `${date.getUTCDate()} ${name} ${date.getUTCFullYear()}`;
}

/** `2020-01-01` -> `January 2020`. The API's month key is always `YYYY-MM-01`. */
export function formatMonthStart(monthStart: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(monthStart.trim());
  const year = match?.[1];
  const month = match?.[2];
  if (year === undefined || month === undefined) return null;
  const name = monthName(Number(month));
  return name === null ? null : `${name} ${year}`;
}

/* -------------------------------------------------------------------------- */
/* Basis                                                                      */
/* -------------------------------------------------------------------------- */

const BASIS: Readonly<Record<EvidenceBasis, { label: string; accent: AccentName }>> = {
  // First-party documentation from the party who owns the system.
  confirmed: { label: 'Documented', accent: 'green' },
  // A named third-party study. Correlational, and the copy must say so.
  study: { label: 'Study, not Google', accent: 'amber' },
  // Practitioner convention only.
  industry: { label: 'Common practice', accent: 'neutral' },
};

export function EvidenceBadge({ basis }: { basis: EvidenceBasis }) {
  const config = BASIS[basis];
  return <Badge label={config.label} accent={config.accent} />;
}

/* -------------------------------------------------------------------------- */
/* The evidence line                                                          */
/* -------------------------------------------------------------------------- */

export interface EvidenceLineProps {
  /** What was literally seen. Quoted, not interpreted. */
  observation: string;
  /** How strongly the claim is supported. */
  basis: EvidenceBasis;
  /** ISO timestamp of the observation. Evidence ages; the screen says when. */
  observedOn: string;
  testID?: string;
}

/**
 * The observation behind a claim, with the date it was made.
 *
 * All three props are required. There is deliberately no way to render a
 * finding's title without also rendering what was seen and when.
 */
export function EvidenceLine({ observation, basis, observedOn, testID }: EvidenceLineProps) {
  const theme = useTheme();
  const day = formatIsoDay(observedOn);

  return (
    <View
      testID={testID}
      style={[
        styles.evidence,
        {
          backgroundColor: theme.colors.card2,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
          marginTop: theme.spacing.md,
        },
      ]}>
      <View style={styles.evidenceHeader}>
        <Ionicons name="eye-outline" size={14} color={theme.colors.muted2} />
        <Text variant="label" tone="muted2" style={styles.evidenceHeaderText}>
          {day === null ? 'Observed' : `Observed ${day}`}
        </Text>
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
        {observation}
      </Text>

      <View style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}>
        <EvidenceBadge basis={basis} />
      </View>
    </View>
  );
}

/**
 * The compact form, for an observation that IS its own evidence — a readability
 * measurement, say, where the sentence on screen is the thing we measured.
 * Still carries the date, because evidence ages.
 */
export function ObservedStamp({
  basis,
  observedOn,
  testID,
}: {
  basis: EvidenceBasis;
  observedOn: string;
  testID?: string;
}) {
  const theme = useTheme();
  const day = formatIsoDay(observedOn);

  return (
    <View testID={testID} style={[styles.stamp, { marginTop: theme.spacing.md }]}>
      <EvidenceBadge basis={basis} />
      <Text variant="label" tone="muted2" style={styles.stampText}>
        {day === null ? 'Observed' : `Observed ${day}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  evidence: { width: '100%' },
  stamp: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  stampText: { flexShrink: 1 },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center' },
  evidenceHeaderText: { marginLeft: 6, flexShrink: 1 },
});
