/**
 * The moderation truth about a reply. Owner: Pranay.
 *
 * THIS IS THE FILE THE WHOLE REVIEWS SURFACE EXISTS FOR.
 *
 * Google MODERATES review replies. HTTP 200 from `reviews.updateReply` means
 * "accepted", not "published" — `docs/research/google-business-profile.md` §5
 * records `ReviewReplyState` (2026-04-01) and `PolicyViolation` (2026-07-01) as
 * the only honest way to report what became of one. A competitor that shows a
 * reply and calls it done is telling an owner their words are on Google when
 * Google may still be deciding, or may already have refused.
 *
 * So there are FOUR presentations here and they must not be confusable:
 *
 *   none        — nothing has been said. Neutral.
 *   submitted   — with Google, outcome unknown. Amber. NEVER reads as live.
 *   published   — Google confirmed it is live. Green. Only reachable from a
 *                 confirmed state, never from "our request succeeded".
 *   rejected    — Google refused it, with the policy reason when it gave one.
 *                 Red, and the reply text stays visible so the owner can see
 *                 what was refused.
 *
 * `GbpReplyModeration` has seven members because Google can be vague in three
 * different ways. All seven are handled; the three vague ones all land in
 * SUBMITTED, which is the honest floor. There is no default branch, so adding a
 * member to the union breaks this file until someone decides what it means.
 */

import { StyleSheet, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

import { describeReplyModeration, replyTimestamp } from '../../mappers';
import type { GbpReplyModeration } from '../../types';
import { formatReviewDate } from './model';

/** The four presentations. Nothing outside this union may describe a reply. */
export type ReplyPresentation = 'none' | 'submitted' | 'published' | 'rejected';

export interface ReplyStateCopy {
  presentation: ReplyPresentation;
  /** Badge text. Reads as a complete statement on its own. */
  badge: string;
  /** The sentence under the reply. Comes from the feature's single describer. */
  sentence: string;
  /** What the owner can do about it, or null when there is nothing. */
  nextStep: string | null;
  accent: AccentName;
}

const SUBMITTED_NEXT_STEP =
  'Nothing to do. Google decides whether it appears, and Shoogle will show the outcome when Google reports it.';

export function replyStateCopy(moderation: GbpReplyModeration): ReplyStateCopy {
  switch (moderation.kind) {
    case 'no_reply':
      return {
        presentation: 'none',
        badge: 'No reply yet',
        sentence: describeReplyModeration(moderation),
        nextStep: null,
        accent: 'neutral',
      };

    case 'published':
      return {
        presentation: 'published',
        badge: 'Live on Google',
        sentence: describeReplyModeration(moderation),
        nextStep: null,
        accent: 'green',
      };

    case 'published_time_unknown':
      return {
        presentation: 'published',
        badge: 'Live on Google',
        sentence: describeReplyModeration(moderation),
        // Google said live but never said when. We will not invent the moment.
        nextStep: 'Google did not report when it went live, so no date is shown.',
        accent: 'green',
      };

    case 'pending_moderation':
      return {
        presentation: 'submitted',
        badge: 'Submitted to Google',
        sentence: describeReplyModeration(moderation),
        nextStep: SUBMITTED_NEXT_STEP,
        accent: 'amber',
      };

    /*
     * Google reported a state token whose meaning nobody has verified, or
     * reported no state at all. Both are "we know a reply exists and we do not
     * know what happened to it" — which is SUBMITTED, not published. Guessing
     * upward here is the exact failure this screen was built to prevent.
     */
    case 'state_not_understood':
    case 'state_not_reported':
      return {
        presentation: 'submitted',
        badge: 'Submitted — not confirmed',
        sentence: describeReplyModeration(moderation),
        nextStep: SUBMITTED_NEXT_STEP,
        accent: 'amber',
      };

    case 'rejected':
      return {
        presentation: 'rejected',
        badge: 'Rejected by Google',
        sentence: describeReplyModeration(moderation),
        nextStep: 'Edit the reply and submit it again. It is not on your profile.',
        accent: 'red',
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

export function ReplyStateBadge({
  moderation,
  testID,
}: {
  moderation: GbpReplyModeration;
  testID?: string;
}) {
  const copy = replyStateCopy(moderation);
  return <Badge label={copy.badge} accent={copy.accent} testID={testID} />;
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export interface ReplyStatePanelProps {
  moderation: GbpReplyModeration;
  /** The reply text Google holds, when there is one. */
  replyComment: string | null;
  testID?: string;
}

/**
 * The reply block under a review.
 *
 * A rejected reply keeps its text on screen on purpose: the owner needs to see
 * what Google refused in order to write something else. Hiding it would leave
 * them guessing.
 */
export function ReplyStatePanel({ moderation, replyComment, testID }: ReplyStatePanelProps) {
  const theme = useTheme();
  const copy = replyStateCopy(moderation);
  const timestamp = formatReviewDate(replyTimestamp(moderation));

  if (copy.presentation === 'none') {
    return (
      <View testID={testID} style={{ marginTop: theme.spacing.md }}>
        <ReplyStateBadge moderation={moderation} testID={`${testID ?? 'reply'}-badge`} />
      </View>
    );
  }

  const { bg } = theme.accent(copy.accent);

  return (
    <View
      testID={testID}
      style={[
        styles.panel,
        {
          marginTop: theme.spacing.md,
          padding: theme.spacing.md,
          borderRadius: theme.radii.lg,
          backgroundColor: bg,
        },
      ]}>
      <View style={styles.row}>
        <ReplyStateBadge moderation={moderation} testID={`${testID ?? 'reply'}-badge`} />
        {timestamp === null ? null : (
          <Text variant="caption" tone="muted" testID={`${testID ?? 'reply'}-timestamp`}>
            {timestamp}
          </Text>
        )}
      </View>

      {replyComment === null ? (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'reply'}-missing-text`}>
          Google reported a reply on this review but did not send its text.
        </Text>
      ) : (
        <Text
          variant="body"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'reply'}-text`}>
          {replyComment}
        </Text>
      )}

      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: theme.spacing.sm }}
        testID={`${testID ?? 'reply'}-sentence`}>
        {copy.sentence}
      </Text>

      {copy.nextStep === null ? null : (
        <Text
          variant="caption"
          tone="muted2"
          style={{ marginTop: 4 }}
          testID={`${testID ?? 'reply'}-next-step`}>
          {copy.nextStep}
        </Text>
      )}

      {moderation.kind === 'rejected' && moderation.helpUri !== null ? (
        <Text
          variant="caption"
          tone="muted2"
          style={{ marginTop: 4 }}
          testID={`${testID ?? 'reply'}-help`}>
          {`Google’s explanation: ${moderation.helpUri}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
});
