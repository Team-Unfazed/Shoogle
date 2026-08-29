import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Skeleton } from './Skeleton';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * A 0-100 health score (used by the Audit and SEO modules).
 *
 * Like `Metric`, a `null` score renders as unknown, never as 0 - a business
 * with an unmeasured profile is not a business with a score of zero, and
 * showing one would be a lie the owner might act on.
 *
 * `uncheckedCount` surfaces how much of the audit could NOT be measured, so a
 * score computed from partial signals never masquerades as complete.
 *
 * Drawn with plain Views, not canvas - the label must stay real, selectable
 * text for accessibility.
 */
export interface ScoreProps {
  /** 0-100, or null when not yet measured. */
  value: number | null;
  label?: string;
  /** Number of checks that could not be run. Rendered as an honesty caveat. */
  uncheckedCount?: number;
  loading?: boolean;
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Maps a score to its accent band. Kept here so every module agrees. */
export function scoreBand(value: number): 'green' | 'amber' | 'red' {
  if (value >= 70) return 'green';
  if (value >= 40) return 'amber';
  return 'red';
}

export function Score({
  value,
  label = 'Score',
  uncheckedCount = 0,
  loading = false,
  size = 'large',
  style,
  testID,
}: ScoreProps) {
  const theme = useTheme();
  const diameter = size === 'large' ? 96 : 60;

  if (loading) {
    return (
      <View style={[styles.root, style]} testID={testID}>
        <Skeleton
          width={diameter}
          height={diameter}
          radius={theme.radii.full}
          label={`${label}, loading`}
        />
      </View>
    );
  }

  const known = value !== null;
  const band = known ? scoreBand(value) : 'neutral';
  const { fg, bg } = theme.accent(band);

  const accessibilityLabel = known
    ? `${label}, ${value} out of 100${uncheckedCount > 0 ? `, ${uncheckedCount} checks could not be run` : ''}`
    : `${label}, not measured yet`;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[styles.root, style]}>
      <View
        style={[
          styles.dial,
          {
            width: diameter,
            height: diameter,
            borderRadius: theme.radii.full,
            backgroundColor: bg,
            borderColor: known ? fg : theme.colors.border,
            borderWidth: 3,
          },
        ]}>
        <Text
          variant="display"
          tone={known ? 'default' : 'muted2'}
          style={{
            color: known ? fg : theme.colors.muted2,
            fontSize: size === 'large' ? 29 : 19,
            lineHeight: size === 'large' ? 34 : 24,
          }}>
          {known ? String(value) : '—'}
        </Text>
        {known && size === 'large' ? (
          <Text variant="label" style={{ color: fg, opacity: 0.75 }}>
            / 100
          </Text>
        ) : null}
      </View>

      <Text variant="label" tone="muted2" align="center" style={{ marginTop: theme.spacing.sm }}>
        {label}
      </Text>

      {!known ? (
        <Text variant="caption" tone="muted" align="center" style={{ marginTop: 2 }}>
          Not measured yet
        </Text>
      ) : uncheckedCount > 0 ? (
        <Text variant="caption" tone="amber" align="center" style={{ marginTop: 2 }}>
          {`${uncheckedCount} check${uncheckedCount === 1 ? '' : 's'} could not be run`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  dial: { alignItems: 'center', justifyContent: 'center' },
});
