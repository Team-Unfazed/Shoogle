import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Card, Text } from '@/components/ui';
import type { DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * What actually happened to the review count — kept strictly apart from what
 * Shoogle did.
 *
 * THE ATTRIBUTION GAP, SAID OUT LOUD
 * ----------------------------------
 * Google's Business Profile API returns a review's author, rating, text and
 * timestamps. It returns nothing about how the reviewer got there. There is no
 * campaign parameter, no referrer, no source field — the review link is a plain
 * URL and Google does not report who followed it. So "2 new reviews this week"
 * and "3 requests sent this week" are two true numbers that Shoogle cannot join,
 * and joining them visually — one progress bar, one headline — would be an
 * invented causal claim.
 *
 * This card therefore states the change and then states, in words, that it is
 * not attributed. That sentence is the product, not a disclaimer: an owner who
 * believes the tool is producing reviews stops doing the thing that produces
 * reviews.
 */
export interface ReviewCountChange {
  /** Total reviews on the profile right now. */
  readonly total: number;
  /**
   * The total at the start of this week, when we have a reading from then.
   * Null means Shoogle has not been watching long enough — NOT that it was zero.
   */
  readonly totalAtWeekStart: number | null;
  /** Average rating, when the provider reported one. */
  readonly rating: number | null;
}

export interface NewReviewsCardProps {
  state: DataState<ReviewCountChange>;
  onRetry?: () => void;
  testID?: string;
}

export function NewReviewsCard({ state, onRetry, testID }: NewReviewsCardProps) {
  const theme = useTheme();

  return (
    <Card testID={testID}>
      <Text variant="label" tone="muted2">
        WHAT HAPPENED TO YOUR REVIEWS
      </Text>

      <DataStateView
        state={state}
        onRetry={onRetry}
        skeletonLines={2}
        compact
        testID="new-reviews-state">
        {(change) => {
          const delta =
            change.totalAtWeekStart === null ? null : change.total - change.totalAtWeekStart;

          return (
            <View>
              <View style={[styles.row, { marginTop: theme.spacing.sm }]}>
                <Text
                  testID="new-reviews-delta"
                  accessibilityRole="header"
                  style={{
                    fontFamily: theme.fontFamily.display,
                    fontSize: 29,
                    lineHeight: 36,
                    letterSpacing: -0.58,
                    color: theme.colors.text,
                  }}>
                  {/* Unknown is an em dash, never 0 — see product rule 7. */}
                  {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
                </Text>
                <Text variant="body" tone="muted" style={{ marginBottom: 5, marginLeft: 6 }}>
                  {delta === null ? 'new reviews this week' : 'reviews this week'}
                </Text>
              </View>

              {delta === null ? (
                <Text
                  testID="new-reviews-no-baseline"
                  variant="caption"
                  tone="muted"
                  style={{ marginTop: 2 }}>
                  Shoogle has not been reading this profile long enough to know what the count was
                  on Monday, so the change is unknown. It is not zero.
                </Text>
              ) : null}

              <Text variant="body" style={{ marginTop: theme.spacing.md }}>
                {`${change.total} reviews in total`}
                {change.rating === null ? '' : ` · ${change.rating.toFixed(1)} average`}
              </Text>

              {change.rating === null ? (
                <Text variant="caption" tone="muted2" style={{ marginTop: 2 }}>
                  Google did not report an average rating for this profile.
                </Text>
              ) : null}

              <View
                style={[
                  styles.noteRow,
                  {
                    marginTop: theme.spacing.lg,
                    backgroundColor: theme.colors.card2,
                    borderRadius: theme.radii.lg,
                    padding: theme.spacing.md,
                  },
                ]}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={theme.colors.muted}
                  style={{ marginTop: 1 }}
                />
                <Text
                  testID="new-reviews-not-attributed"
                  variant="caption"
                  tone="muted"
                  style={{ flex: 1, marginLeft: theme.spacing.sm }}>
                  Not attributed. Google does not say where a review came from, so Shoogle cannot
                  tell you which of these came from a request you sent — and will not pretend to.
                </Text>
              </View>
            </View>
          );
        }}
      </DataStateView>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start' },
});
