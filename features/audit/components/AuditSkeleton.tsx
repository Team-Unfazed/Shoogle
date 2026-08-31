import { StyleSheet, View } from 'react-native';

import { Score, Skeleton, SkeletonLines } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The loading state. Owner: Pranay.
 *
 * A skeleton means "we are fetching", and nothing else. It is not a percentage,
 * it does not tick, and it never resolves into a zero: when the read finishes,
 * this is replaced by a score, by the insufficient-data panel, or by the
 * not-connected state — whichever is true.
 *
 * `<Score loading>` draws the dial as a circle of the same diameter, so the
 * page does not jump when the real number arrives.
 */
export function AuditSkeleton({ testID }: { testID?: string }) {
  const theme = useTheme();

  return (
    <View testID={testID ?? 'audit-loading'} style={{ gap: theme.layout.cardGap }}>
      <View
        style={[
          styles.card,
          styles.hero,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.xl,
            padding: theme.spacing.xl,
          },
        ]}>
        <Score value={null} label="Profile score" loading />
        <View style={{ alignSelf: 'stretch', marginTop: theme.spacing.lg }}>
          <SkeletonLines count={2} label="Checking your profile" />
        </View>
      </View>

      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.xl,
              padding: theme.spacing.lg,
            },
          ]}>
          <Skeleton width="35%" height={18} radius={theme.radii.xs} label="Checking" />
          <View style={{ marginTop: theme.spacing.md }}>
            <SkeletonLines count={3} label="Checking" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  hero: { alignItems: 'center' },
});
