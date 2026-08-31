/**
 * features/gbp/components/reviews — the Reviews surface. Owner: Pranay.
 *
 * Screens import from here and nothing deeper. Everything in this folder is
 * presentational: it takes values and renders them. Nothing fetches, nothing
 * reads fixtures (the ESLint rule in `eslint.config.js` blocks that outside
 * `app/`), and nothing decides what is true — `model.ts` does the arithmetic and
 * `../../mappers` owns the words for a reply's moderation state.
 */

export {
  RatingSummaryCard,
  type RatingSummaryCardProps,
} from './RatingSummaryCard';

export {
  MODERATION_STATEMENT,
  REPLY_GUIDANCE_BAND,
  REPLY_TONES,
  ReplyComposer,
  ToneChips,
  replyLengthGuidance,
  type ReplyComposerProps,
  type ReplyTone,
  type ToneChipsProps,
} from './ReplyComposer';

export {
  ReplyDraftCard,
  replyDraftInstruction,
  type ReplyDraftCardProps,
} from './ReplyDraftCard';

export {
  ReplyStateBadge,
  ReplyStatePanel,
  replyStateCopy,
  type ReplyPresentation,
  type ReplyStateCopy,
  type ReplyStatePanelProps,
} from './ReplyState';

export { ReviewCard, StarRating, type ReviewCardProps } from './ReviewCard';

export { ReviewsList, type ReviewsListProps } from './ReviewsList';

export { SubmissionOutcome, type SubmissionOutcomeProps } from './SubmissionOutcome';

export { VerificationPanel, type VerificationPanelProps } from './VerificationPanel';

export {
  NO_UNANSWERED_FILTER_REASON,
  STAR_VALUES,
  filterReviews,
  formatAverageRating,
  formatReviewDate,
  hasReply,
  isPublishedOnGoogle,
  matchesFilter,
  reviewFilterOptions,
  starFilterFor,
  summariseReviews,
  type ReviewFilter,
  type ReviewFilterOption,
  type ReviewsSummary,
  type StarBucket,
  type StarValue,
} from './model';
