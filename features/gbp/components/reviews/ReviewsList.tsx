/**
 * The review list and its filters. Owner: Pranay.
 *
 * WHAT IS DELIBERATELY MISSING FROM THE FILTER ROW
 * ------------------------------------------------
 * An "Unanswered" chip. Grexa has one; Shoogle does not, and the reason is
 * printed on screen rather than left as an absence a reviewer has to notice.
 * See `NO_UNANSWERED_FILTER_REASON` in `model.ts` for the full argument: the
 * coverage of Google's `reviewReply` field is not established, so an unanswered
 * count could be wrong, and a wrong count would have an owner replying twice to
 * the same customer.
 *
 * The rating chips carry counts, and those counts are measured over the reviews
 * on screen. A chip reading "3★ 0" is a measured zero and is worth showing. The
 * list header says what the counts cover, every time, so no count on this
 * screen is ever mistaken for a listing-wide figure.
 */

import { View } from 'react-native';

import { EmptyState, Tabs, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import type { GbpReviewDetail, GbpReviewPage } from '../../types';
import {
  filterReviews,
  NO_UNANSWERED_FILTER_REASON,
  reviewFilterOptions,
  type ReviewFilter,
} from './model';
import { ReviewCard } from './ReviewCard';

export interface ReviewsListProps {
  page: GbpReviewPage;
  filter: ReviewFilter;
  onFilterChange: (filter: ReviewFilter) => void;
  onReply?: (reviewId: string) => void;
  replyBlockedReason?: string | null;
  testID?: string;
}

export function ReviewsList({
  page,
  filter,
  onFilterChange,
  onReply,
  replyBlockedReason = null,
  testID,
}: ReviewsListProps) {
  const theme = useTheme();
  const options = reviewFilterOptions(page.reviews);
  const visible: GbpReviewDetail[] = filterReviews(page.reviews, filter);

  if (page.reviews.length === 0) {
    return (
      <EmptyState
        testID={`${testID ?? 'reviews'}-empty`}
        title={page.totalReviewCount === 0 ? 'No reviews yet' : 'No reviews loaded'}
        body={
          page.totalReviewCount === 0
            ? 'Google reports no reviews on this listing. That is a measured zero, not a gap in what Shoogle knows.'
            : 'Google returned no reviews Shoogle could read. Nothing here is a count of your customers.'
        }
        icon="chatbubble-ellipses-outline"
      />
    );
  }

  return (
    <View testID={testID}>
      {/*
        The shared segmented control. Its geometry (36px rows inside a 44px
        container) is the design system's, transcribed from the design file —
        it is not restyled here.
      */}
      <Tabs
        items={options.map((option) => ({
          value: option.value,
          label: option.label,
          count: option.count,
        }))}
        value={filter}
        onChange={onFilterChange}
        accessibilityLabel="Filter reviews by star rating"
        testID={`${testID ?? 'reviews'}-filters`}
      />

      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: theme.spacing.sm }}
        testID={`${testID ?? 'reviews'}-filter-scope`}>
        {`These counts cover the ${page.reviews.length} review${
          page.reviews.length === 1 ? '' : 's'
        } on this screen.`}
      </Text>

      <Text
        variant="caption"
        tone="muted2"
        style={{ marginTop: 4 }}
        testID={`${testID ?? 'reviews'}-no-unanswered`}>
        {NO_UNANSWERED_FILTER_REASON}
      </Text>

      <View style={{ marginTop: theme.spacing.lg }}>
        {visible.length === 0 ? (
          <EmptyState
            testID={`${testID ?? 'reviews'}-filter-empty`}
            title="None with this rating"
            body="No review on this screen carries that rating. Try another filter."
            icon="funnel-outline"
            compact
          />
        ) : (
          visible.map((review) => (
            <ReviewCard
              key={review.reviewId}
              review={review}
              {...(onReply === undefined ? {} : { onReply })}
              replyBlockedReason={replyBlockedReason}
              testID={`review-${review.reviewId}`}
            />
          ))
        )}
      </View>

      {page.skipped.length > 0 ? (
        <View
          style={{
            marginTop: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radii.lg,
            backgroundColor: theme.colors.redSoft,
          }}
          testID={`${testID ?? 'reviews'}-skipped`}>
          <Text variant="bodyStrong" tone="red">
            {`${page.skipped.length} review${
              page.skipped.length === 1 ? '' : 's'
            } could not be read`}
          </Text>
          {page.skipped.map((entry, index) => (
            <Text
              key={`${entry.reviewId ?? 'unknown'}-${index}`}
              variant="caption"
              tone="muted"
              style={{ marginTop: 4 }}>
              {entry.reason}
            </Text>
          ))}
          <Text variant="caption" tone="muted2" style={{ marginTop: 6 }}>
            The list above is short by that much. Shoogle would rather say so than hand you a
            shorter list that looks complete.
          </Text>
        </View>
      ) : null}

      {page.nextPageToken === null ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.md }}
          testID={`${testID ?? 'reviews'}-more`}>
          Google has more reviews after these. Loading further pages is not built yet, so what you
          see is the first page and nothing more.
        </Text>
      )}
    </View>
  );
}
