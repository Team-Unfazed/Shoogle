import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * "What we couldn't check." Owner: Pranay.
 *
 * This is the honesty surface that makes the score credible, so it is a card in
 * the main column — not a footnote, not a tooltip, not collapsed by default.
 *
 * The sentence that matters most here is the last one: an unchecked area is NOT
 * a problem with the business and NOT a zero. It left the score arithmetic
 * entirely, in both directions. An owner who reads this list as "eight things
 * are wrong" has been misled just as badly as one shown a fabricated number.
 */

export interface UncheckedAreasCardProps {
  /** `AuditRun.uncheckedAreas` — "Reviews — not connected" lines, already worded. */
  areas: readonly string[];
  /** `AuditRun.uncheckedCount`: scored checks that could not be run. */
  count: number;
  testID?: string;
}

export function UncheckedAreasCard({ areas, count, testID }: UncheckedAreasCardProps) {
  const theme = useTheme();
  const { fg, bg } = theme.accent('amber');

  // Nothing to declare only when the audit genuinely measured everything that
  // applies. Rendering an empty card would invent a caveat.
  if (areas.length === 0 && count === 0) return null;

  return (
    <View
      testID={testID ?? 'unchecked-areas'}
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor: fg,
          borderRadius: theme.radii.xl,
          padding: theme.spacing.lg,
        },
      ]}>
      <View style={styles.header}>
        <Ionicons name="eye-off-outline" size={18} color={fg} />
        <Text variant="cardTitle" style={{ marginLeft: theme.spacing.sm }}>
          What we couldn&apos;t check
        </Text>
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
        {count === 1
          ? '1 check could not be run.'
          : `${count} checks could not be run.`}
      </Text>

      <View style={{ marginTop: theme.spacing.md }}>
        {areas.map((line) => (
          <View key={line} style={[styles.row, { marginTop: theme.spacing.xs }]}>
            <Ionicons name="remove-outline" size={14} color={fg} style={{ marginTop: 2 }} />
            <Text variant="body" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
              {line}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
        These are not problems with your business. They are things Shoogle could not see, so they
        are left out of the score completely — they never count against you and never count for you.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
});
