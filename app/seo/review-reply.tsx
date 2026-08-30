/**
 * REPLY TO A REVIEW. Route `/seo/review-reply?reviewId=…`. Owner: Pranay.
 *
 * THE ONE THING THIS SCREEN EXISTS TO GET RIGHT
 * ---------------------------------------------
 * Pressing the button does not publish a reply. Google MODERATES replies
 * (docs/research/google-business-profile.md §5, `ReviewReplyState`,
 * 2026-04-01), so HTTP 200 from `reviews.updateReply` means "accepted", not
 * "live". The owner is told that BEFORE they commit, the button says "Submit"
 * rather than "Publish" or "Post", and afterwards the screen renders exactly
 * what Google said about the reply and nothing more.
 *
 * `GbpAdapter.submitReviewReply` is what makes that possible: it sends the
 * reply, reads the review back, and returns Google's own moderation state. It
 * cannot return "published" today at all, because
 * `REVIEW_REPLY_STATE_MEANINGS` is empty until someone reads the first-party
 * enum reference — which is the correct floor, not a gap.
 *
 * THE BUTTON IS REAL EVEN THOUGH NOTHING IS CONNECTED
 * ---------------------------------------------------
 * Submitting calls the real adapter. With no transport and no session it
 * answers `unavailable('not_connected', …)` and the screen shows that. So the
 * control is honest rather than dead: it does the thing, and the thing
 * truthfully reports that Google is not reachable yet. The day a transport is
 * injected, this screen needs no change.
 *
 * WHAT THE AI BUTTON IS AND IS NOT
 * --------------------------------
 * It drafts a starting point from DEVELOPMENT FIXTURE review text only. A real
 * customer's words are never sent to the free-tier model — the classification
 * guard and the `[FIXTURE]` marker check in `features/seo/ai/gemini.ts` both
 * refuse that. When the client refuses, the card says so and the control is
 * disabled with the reason; it never spins on a request that was not allowed to
 * start.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen, TopBar } from '@/components/shared';
import { Button, Card, EmptyState, Section, Text, useToast } from '@/components/ui';
import {
  describeGbpAvailability,
  googleBusinessProfileProvider,
  type GbpReplyOutcome,
} from '@/features/gbp';
import {
  hasReply,
  ReplyComposer,
  ReplyDraftCard,
  replyStateCopy,
  ReviewCard,
  SubmissionOutcome,
  type ReplyTone,
} from '@/features/gbp/components/reviews';
import type { GbpReviewDetail } from '@/features/gbp/types';
import { geminiAiProvider, noAiProvider, type AiProvider } from '@/features/seo';
import { getGbpReviewFixtures } from '@/fixtures/gbp-reviews';
import { loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * Production gets `noAiProvider`, which honestly reports that generation is not
 * built. Development gets the fixture-only client, which refuses anything else.
 * There is no configuration in between.
 */
function activeAiProvider(): AiProvider {
  return __DEV__ ? geminiAiProvider : noAiProvider;
}

const NO_REVIEW_MESSAGE =
  'Shoogle does not have this review. Reviews come from a connected Google Business Profile, and there is not one yet — so there is nothing here to reply to.';

export default function ReviewReplyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();

  const params = useLocalSearchParams<{ reviewId?: string }>();
  const reviewId = typeof params.reviewId === 'string' ? params.reviewId : null;

  // Gated accessor: null outside development, so a release build cannot reach
  // fixture content at all.
  const fixtures = useMemo(() => getGbpReviewFixtures(), []);

  const review: GbpReviewDetail | null = useMemo(() => {
    if (fixtures === null || reviewId === null) return null;
    return fixtures.page.reviews.find((entry) => entry.reviewId === reviewId) ?? null;
  }, [fixtures, reviewId]);

  const [tone, setTone] = useState<ReplyTone>('warm');
  const [text, setText] = useState('');
  const [submission, setSubmission] = useState<DataState<GbpReplyOutcome> | null>(null);

  const locationId = fixtures?.locationId ?? null;

  /**
   * Why submitting is impossible, or null when it is possible to try.
   *
   * "No profile is connected" is NOT one of these: submitting with a connected
   * profile absent is exactly what the adapter is built to answer honestly, and
   * disabling the button here would hide that answer behind a guess of ours.
   */
  const submitBlockedReason: string | null =
    review === null
      ? NO_REVIEW_MESSAGE
      : locationId === null
        ? 'Shoogle does not know which Google listing this review belongs to, so it cannot address a reply to it.'
        : text.trim().length === 0
          ? 'Write something first. Google will not take an empty reply.'
          : null;

  const submit = useCallback(() => {
    if (review === null || locationId === null || text.trim().length === 0) return;
    setSubmission(loading());
    void googleBusinessProfileProvider
      .submitReviewReply(locationId, review.reviewId, text)
      .then((next) => {
        setSubmission(next);
        toast.show({
          message:
            next.status === 'ready'
              ? replyStateCopy(next.value.moderation).sentence
              : // Not a success and not reported as one. Whatever the adapter
                // said is what the owner is told.
                next.status === 'unavailable' || next.status === 'error'
                ? next.message
                : 'Working…',
          tone: next.status === 'ready' ? 'neutral' : 'warning',
          durationMs: 6000,
        });
      });
  }, [locationId, review, text, toast]);

  const showsFixtureData = review !== null;

  return (
    <Screen
      testID="review-reply-screen"
      header={<TopBar title="Reply to a review" />}
      edgeBottom
      showsFixtureData={showsFixtureData}
      footer={
        <Button
          label="Submit to Google"
          onPress={submitBlockedReason === null ? submit : undefined}
          disabled={submitBlockedReason !== null}
          loading={submission?.status === 'loading'}
          accessibilityLabel="Submit this reply to Google"
          accessibilityHint={
            submitBlockedReason === null
              ? 'Sends the reply to Google for review. It does not appear on your profile until Google allows it.'
              : `Disabled. ${submitBlockedReason}`
          }
          testID="review-reply-submit"
        />
      }>
      {review === null ? (
        <>
          <EmptyState
            testID="review-reply-missing"
            title="No review to reply to"
            body={NO_REVIEW_MESSAGE}
            icon="chatbubble-ellipses-outline"
            action={{ label: 'Back to reviews', onPress: () => router.back() }}
          />
          <Card style={{ marginTop: theme.spacing.lg }} testID="review-reply-not-connected">
            <Text variant="bodyStrong">{describeGbpAvailability().title}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
              {describeGbpAvailability().body}
            </Text>
          </Card>
        </>
      ) : (
        <>
          <Section title="You are replying to" first>
            {/*
              Read-only: no reply button is rendered, because the owner is
              already on the reply screen. The reply state panel stays, so a
              rejected or already-submitted reply is visible while writing.
            */}
            <ReviewCard review={review} testID="review-reply-review" />
          </Section>

          <Section
            title="Your reply"
            subtitle="Written by you. Google decides whether it appears.">
            <ReplyComposer
              value={text}
              onChangeText={setText}
              isReplacingExistingReply={hasReply(review.replyModeration)}
              testID="review-reply-composer"
            />
          </Section>

          <Section
            title="Need a starting point?"
            subtitle="The only part of this screen a model touches.">
            <ReplyDraftCard
              provider={activeAiProvider()}
              payload={review.comment}
              tone={tone}
              onToneChange={setTone}
              onUseDraft={setText}
              testID="review-reply-draft"
            />
          </Section>

          {submitBlockedReason === null ? null : (
            <Text
              variant="caption"
              tone="muted"
              style={{ marginTop: theme.spacing.lg }}
              testID="review-reply-blocked-reason">
              {submitBlockedReason}
            </Text>
          )}

          <SubmissionOutcome
            state={submission}
            onRetry={submit}
            testID="review-reply-outcome"
          />

          <View style={{ marginTop: theme.spacing.lg }}>
            <Text variant="caption" tone="muted2" testID="review-reply-footnote">
              Shoogle will never tell you a reply is live on Google until Google says it is. Until
              then it stays “submitted”, which is what it actually is.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}
