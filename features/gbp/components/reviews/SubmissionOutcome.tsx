/**
 * What happened after the owner pressed submit. Owner: Pranay.
 *
 * THE WHOLE POINT OF THIS COMPONENT IS THAT IT NEVER SAYS "PUBLISHED" ON ITS
 * OWN AUTHORITY.
 *
 * `GbpAdapter.submitReviewReply` does not return "success". It sends the reply,
 * reads the review back, and returns whatever Google then said about it as a
 * `GbpReplyModeration`. This component renders that value and nothing else. If
 * Google reported a state we have not verified the meaning of, the owner is
 * told the reply was submitted and its outcome is not confirmed — which is
 * exactly the truth, and is what `REVIEW_REPLY_STATE_MEANINGS` being empty
 * guarantees today.
 *
 * The heading is chosen from `replyStateCopy(...).presentation`, so there is no
 * second, looser vocabulary for the same fact.
 */

import { View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Card, Text } from '@/components/ui';
import type { GbpReplyOutcome } from '@/features/gbp';
import type { DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

import { replyStateCopy, ReplyStateBadge } from './ReplyState';

const HEADING = {
  none: 'Google has no reply on this review',
  submitted: 'Submitted to Google',
  published: 'Live on Google',
  rejected: 'Google rejected this reply',
} as const;

export interface SubmissionOutcomeProps {
  /** Null before anything has been submitted. */
  state: DataState<GbpReplyOutcome> | null;
  onRetry?: () => void;
  testID?: string;
}

export function SubmissionOutcome({ state, onRetry, testID }: SubmissionOutcomeProps) {
  const theme = useTheme();

  if (state === null) return null;

  return (
    <View style={{ marginTop: theme.spacing.lg }} testID={testID}>
      <DataStateView
        state={state}
        {...(onRetry === undefined ? {} : { onRetry })}
        skeletonLines={2}
        testID={`${testID ?? 'submission'}-state`}>
        {(outcome) => {
          const copy = replyStateCopy(outcome.moderation);
          return (
            <Card testID={`${testID ?? 'submission'}-card`}>
              <ReplyStateBadge
                moderation={outcome.moderation}
                testID={`${testID ?? 'submission'}-badge`}
              />
              <Text
                variant="cardTitle"
                style={{ marginTop: theme.spacing.sm }}
                testID={`${testID ?? 'submission'}-heading`}>
                {HEADING[copy.presentation]}
              </Text>
              <Text
                variant="body"
                tone="muted"
                style={{ marginTop: 6 }}
                testID={`${testID ?? 'submission'}-sentence`}>
                {copy.sentence}
              </Text>
              {copy.nextStep === null ? null : (
                <Text
                  variant="caption"
                  tone="muted2"
                  style={{ marginTop: theme.spacing.sm }}
                  testID={`${testID ?? 'submission'}-next-step`}>
                  {copy.nextStep}
                </Text>
              )}
            </Card>
          );
        }}
      </DataStateView>
    </View>
  );
}
