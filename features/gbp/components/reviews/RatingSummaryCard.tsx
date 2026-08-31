/**
 * The rating summary. Owner: Pranay.
 *
 * Three numbers, and every one of them is `number | null`:
 *
 *   average  — Google's own `averageRating`. Null renders `—` with the reason.
 *              Shoogle never averages the reviews on screen and presents the
 *              result as Google's figure; that would be an average of what
 *              loaded, not of the listing.
 *   total    — Google's own `totalReviewCount`. `0` is a real, measured answer
 *              and renders `0`. Null is not, and renders `—`.
 *   per star — counted from the reviews actually held, with a sentence saying
 *              so. A count of 0 among reviews we hold is measured and renders
 *              `0`; a count with no reviews behind it renders `—`.
 *
 * The bar next to each star is drawn from the count. When the count is unknown
 * the bar is absent entirely — an empty bar and a zero bar look identical, and
 * this screen exists to keep those two facts apart.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Text, UNKNOWN_VALUE_PLACEHOLDER } from '@/components/ui';
import { useTheme } from '@/theme';

import { formatAverageRating, type ReviewsSummary } from './model';

export interface RatingSummaryCardProps {
  summary: ReviewsSummary;
  testID?: string;
}

export function RatingSummaryCard({ summary, testID }: RatingSummaryCardProps) {
  const theme = useTheme();

  const knownCounts = summary.buckets
    .map((bucket) => bucket.count)
    .filter((count): count is number => count !== null);
  const maxCount = knownCounts.length === 0 ? 0 : Math.max(...knownCounts);

  const averageText =
    summary.averageRating === null
      ? UNKNOWN_VALUE_PLACEHOLDER
      : formatAverageRating(summary.averageRating);
  const totalText =
    summary.totalReviewCount === null
      ? UNKNOWN_VALUE_PLACEHOLDER
      : String(summary.totalReviewCount);

  const accessibilityLabel = [
    summary.averageRating === null
      ? 'Average rating unknown'
      : `Average rating ${averageText} out of 5`,
    summary.totalReviewCount === null
      ? 'Total number of reviews unknown'
      : `${summary.totalReviewCount} reviews on Google`,
    summary.distributionNote,
  ].join('. ');

  return (
    <Card testID={testID}>
      <View accessible accessibilityLabel={accessibilityLabel} style={styles.headline}>
        <View style={styles.headlineLeft}>
          <Text
            testID={`${testID ?? 'rating'}-average`}
            style={[theme.typography.display, { color: theme.colors.text }]}>
            {averageText}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {summary.averageRating === null ? 'Average rating' : 'Average rating out of 5'}
          </Text>
        </View>

        <View style={styles.headlineRight}>
          <Text
            testID={`${testID ?? 'rating'}-total`}
            style={[theme.typography.display, { color: theme.colors.text }]}>
            {totalText}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            Reviews on Google
          </Text>
        </View>
      </View>

      {summary.averageReason === null ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.md }}
          testID={`${testID ?? 'rating'}-average-reason`}>
          {summary.averageReason}
        </Text>
      )}

      {summary.totalReason === null ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'rating'}-total-reason`}>
          {summary.totalReason}
        </Text>
      )}

      <View
        style={[
          styles.divider,
          { backgroundColor: theme.colors.border, marginVertical: theme.spacing.lg },
        ]}
      />

      <View testID={`${testID ?? 'rating'}-distribution`}>
        {summary.buckets.map((bucket) => {
          const known = bucket.count !== null;
          const fraction = known && maxCount > 0 ? (bucket.count ?? 0) / maxCount : 0;
          return (
            <View
              key={bucket.stars}
              accessible
              accessibilityLabel={
                known
                  ? `${bucket.stars} star: ${bucket.count} of the reviews loaded`
                  : `${bucket.stars} star: not known, because no reviews have been loaded`
              }
              style={styles.barRow}
              testID={`${testID ?? 'rating'}-bucket-${bucket.stars}`}>
              <View style={styles.barLabel}>
                <Text variant="caption" tone="muted">
                  {bucket.stars}
                </Text>
                <Ionicons name="star" size={12} color={theme.colors.amber} />
              </View>

              <View
                style={[
                  styles.barTrack,
                  { backgroundColor: theme.colors.card2, borderRadius: theme.radii.xs },
                ]}>
                {known && fraction > 0 ? (
                  <View
                    style={[
                      styles.barFill,
                      {
                        // Never below a hairline, so a count of 1 is visible.
                        width: `${Math.max(4, Math.round(fraction * 100))}%`,
                        backgroundColor: theme.colors.amber,
                        borderRadius: theme.radii.xs,
                      },
                    ]}
                  />
                ) : null}
              </View>

              <Text
                variant="caption"
                tone={known ? 'default' : 'muted2'}
                style={styles.barCount}
                testID={`${testID ?? 'rating'}-bucket-${bucket.stars}-count`}>
                {known ? String(bucket.count) : UNKNOWN_VALUE_PLACEHOLDER}
              </Text>
            </View>
          );
        })}
      </View>

      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: theme.spacing.md }}
        testID={`${testID ?? 'rating'}-note`}>
        {summary.distributionNote}
      </Text>

      {summary.unratedCount !== null && summary.unratedCount > 0 ? (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'rating'}-unrated`}>
          {`${summary.unratedCount} of them arrived from Google with no star rating at all. Those are counted here as unrated, not as zero stars.`}
        </Text>
      ) : null}

      {summary.skippedCount > 0 ? (
        <Text
          variant="caption"
          tone="red"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'rating'}-skipped`}>
          {`Google returned ${summary.skippedCount} more review${
            summary.skippedCount === 1 ? '' : 's'
          } that Shoogle could not read. ${
            summary.skippedCount === 1 ? 'It is' : 'They are'
          } not counted above, and the list below is short by that much.`}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headline: { flexDirection: 'row', alignItems: 'flex-start' },
  headlineLeft: { flex: 1, paddingRight: 12 },
  headlineRight: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  barRow: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
  barLabel: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 28 },
  barTrack: { flex: 1, height: 6, marginHorizontal: 10, overflow: 'hidden' },
  barFill: { height: 6 },
  barCount: { minWidth: 22, textAlign: 'right' },
});
