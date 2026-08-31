/**
 * One review, with the truth about its reply. Owner: Pranay.
 *
 * Four things on this card are `null`-shaped facts rather than missing values,
 * and each is stated rather than hidden:
 *
 *   - `starRating: null` — Google sent `STAR_RATING_UNSPECIFIED`. That is not
 *     zero stars and not a bug; the card says the rating was not reported and
 *     draws no stars at all.
 *   - `comment: null` — the customer rated without writing. A real and common
 *     thing on Google, so it is named, not left blank.
 *   - `isAnonymous` — Google withheld the name. Stated, not replaced with a
 *     plausible-looking placeholder.
 *   - `updateTime: null` — Google never said the review was edited.
 *
 * The reply control is a single button whose label changes with what exists,
 * and which is DISABLED WITH A VISIBLE REASON when replying is not possible —
 * never present-but-inert.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import type { GbpReviewDetail } from '../../types';
import { formatReviewDate, hasReply, type StarValue } from './model';
import { ReplyStatePanel } from './ReplyState';

/* -------------------------------------------------------------------------- */
/* Stars                                                                      */
/* -------------------------------------------------------------------------- */

const ALL_STARS: StarValue[] = [1, 2, 3, 4, 5];

export function StarRating({
  rating,
  testID,
}: {
  rating: 1 | 2 | 3 | 4 | 5 | null;
  testID?: string;
}) {
  const theme = useTheme();

  if (rating === null) {
    // No stars are drawn. An outline of five empty stars would read as a
    // one-star-out-of-five verdict, which Google never made.
    return (
      <Text variant="caption" tone="muted" testID={testID}>
        Google did not report a star rating for this review
      </Text>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${rating} out of 5 stars`}
      style={styles.stars}
      testID={testID}>
      {ALL_STARS.map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : 'star-outline'}
          size={14}
          color={star <= rating ? theme.colors.amber : theme.colors.muted2}
        />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export interface ReviewCardProps {
  review: GbpReviewDetail;
  /** Opens the composer. Omitted only when replying is blocked. */
  onReply?: (reviewId: string) => void;
  /**
   * Why replying is not possible right now, or null when it is.
   * A non-null value disables the button and prints the reason — a control that
   * silently does nothing is forbidden.
   *
   * When BOTH `onReply` and this are omitted, no reply control is rendered at
   * all. That is the read-only presentation used on the compose screen, where
   * the owner is already replying to this review and a second button offering
   * to do so would be nonsense.
   */
  replyBlockedReason?: string | null;
  testID?: string;
}

export function ReviewCard({
  review,
  onReply,
  replyBlockedReason = null,
  testID,
}: ReviewCardProps) {
  const theme = useTheme();
  const created = formatReviewDate(review.createTime);
  const edited =
    review.updateTime !== null && review.updateTime !== review.createTime
      ? formatReviewDate(review.updateTime)
      : null;
  const replied = hasReply(review.replyModeration);
  const showsReplyAction = onReply !== undefined || replyBlockedReason !== null;
  const blocked = replyBlockedReason !== null || onReply === undefined;

  return (
    <Card testID={testID} style={{ marginBottom: theme.spacing.md }}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="cardTitle" numberOfLines={2} testID={`${testID ?? 'review'}-author`}>
            {review.authorDisplayName}
          </Text>
          <View style={{ marginTop: 6 }}>
            <StarRating rating={review.starRating} testID={`${testID ?? 'review'}-stars`} />
          </View>
        </View>
      </View>

      <Text
        variant="caption"
        tone="muted2"
        style={{ marginTop: 6 }}
        testID={`${testID ?? 'review'}-date`}>
        {created === null ? 'Google did not send a readable date for this review' : created}
        {edited === null ? '' : ` · edited ${edited}`}
        {review.isAnonymous ? ' · Google did not share this reviewer’s name' : ''}
      </Text>

      {review.comment === null ? (
        <Text
          variant="body"
          tone="muted"
          style={{ marginTop: theme.spacing.md }}
          testID={`${testID ?? 'review'}-no-comment`}>
          This customer left a rating without writing anything.
        </Text>
      ) : (
        <Text
          variant="body"
          style={{ marginTop: theme.spacing.md }}
          testID={`${testID ?? 'review'}-comment`}>
          {review.comment}
        </Text>
      )}

      <ReplyStatePanel
        moderation={review.replyModeration}
        replyComment={review.replyComment}
        testID={`${testID ?? 'review'}-reply`}
      />

      {showsReplyAction ? (
        <Button
          label={replied ? 'Edit the reply' : 'Write a reply'}
          variant="secondary"
          size="small"
          fullWidth={false}
          disabled={blocked}
          onPress={blocked ? undefined : () => onReply?.(review.reviewId)}
          accessibilityLabel={
            replied
              ? `Edit the reply to ${review.authorDisplayName}`
              : `Write a reply to ${review.authorDisplayName}`
          }
          accessibilityHint={
            replyBlockedReason === null
              ? 'Opens the reply composer.'
              : `Disabled. ${replyBlockedReason}`
          }
          style={{ marginTop: theme.spacing.md }}
          testID={`${testID ?? 'review'}-reply-button`}
        />
      ) : null}

      {replyBlockedReason === null ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'review'}-reply-blocked`}>
          {replyBlockedReason}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  headerText: { flex: 1 },
});
