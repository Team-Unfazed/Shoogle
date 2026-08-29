import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Skeleton } from './Skeleton';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * A single number with its label and period.
 *
 * THIS COMPONENT CANNOT RENDER A FAKE ZERO. `value` is `number | null`, and
 * `null` renders the em-dash placeholder plus an explicit "not available"
 * reason - never `0`. That is deliberate: it makes product rule 7 a type-level
 * guarantee rather than a convention someone has to remember.
 *
 * Likewise `changePct` of `null` renders nothing at all, rather than a flat
 * 0% or a neutral arrow, because "we do not know the change" and "the change
 * was zero" are different facts.
 */
export type MetricUnit = 'count' | 'percent' | 'currency_inr' | 'position';

export interface MetricProps {
  label: string;
  /** `null` means unknown/unavailable. It will NOT render as 0. */
  value: number | null;
  unit?: MetricUnit;
  /** e.g. "last 28 days". Shown small under the value. */
  period?: string;
  /** `null` means the change is unknown; nothing is rendered. */
  changePct?: number | null;
  /** Why the value is missing. Shown when `value` is null. */
  unavailableReason?: string;
  loading?: boolean;
  /** For metrics where a decrease is good (e.g. search position). */
  lowerIsBetter?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Formats a known value. Never called with null. */
export function formatMetricValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'percent':
      return `${Math.round(value * 10) / 10}%`;
    case 'currency_inr':
      // Values are stored in paise.
      return `Rs ${(value / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    case 'position':
      return `#${value}`;
    case 'count':
    default:
      return value.toLocaleString('en-IN');
  }
}

/** The single placeholder used everywhere a value is unknown. */
export const UNKNOWN_VALUE_PLACEHOLDER = '—';

export function Metric({
  label,
  value,
  unit = 'count',
  period,
  changePct = null,
  unavailableReason,
  loading = false,
  lowerIsBetter = false,
  style,
  testID,
}: MetricProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={[styles.root, style]} testID={testID}>
        <Text variant="label" tone="muted2">
          {label}
        </Text>
        <Skeleton width={72} height={26} label={`${label}, loading`} style={{ marginTop: 8 }} />
      </View>
    );
  }

  const known = value !== null;
  const display = known ? formatMetricValue(value, unit) : UNKNOWN_VALUE_PLACEHOLDER;

  // Only render a trend when we actually know it.
  const showChange = known && changePct !== null;
  const improved = showChange ? (lowerIsBetter ? changePct < 0 : changePct > 0) : false;
  const flat = showChange && changePct === 0;

  const accessibilityLabel = known
    ? [
        label,
        display,
        period,
        showChange ? `${flat ? 'no change' : improved ? 'up' : 'down'} ${Math.abs(changePct)} percent` : null,
      ]
        .filter(Boolean)
        .join(', ')
    : `${label}, not available${unavailableReason ? `. ${unavailableReason}` : ''}`;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, style]}>
      <Text variant="label" tone="muted2">
        {label}
      </Text>

      <View style={styles.valueRow}>
        <Text
          variant="screenTitle"
          tone={known ? 'default' : 'muted2'}
          style={{ fontSize: 24, lineHeight: 30 }}>
          {display}
        </Text>

        {showChange ? (
          <View style={[styles.change, { backgroundColor: theme.colors.card2 }]}>
            <Ionicons
              name={flat ? 'remove' : improved ? 'arrow-up' : 'arrow-down'}
              size={11}
              color={flat ? theme.colors.muted : improved ? theme.colors.green : theme.colors.red}
            />
            <Text
              variant="label"
              tone={flat ? 'muted' : improved ? 'green' : 'red'}
              style={{ marginLeft: 2 }}>
              {`${Math.abs(changePct)}%`}
            </Text>
          </View>
        ) : null}
      </View>

      {known ? (
        period ? (
          <Text variant="caption" tone="muted2" style={styles.footnote}>
            {period}
          </Text>
        ) : null
      ) : (
        <Text variant="caption" tone="muted2" style={styles.footnote}>
          {unavailableReason ?? 'Not available'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minWidth: 0, flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  footnote: { marginTop: 2 },
});
