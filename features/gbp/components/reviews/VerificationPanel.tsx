/**
 * Voice of Merchant, rendered as a first-class state. Owner: Pranay.
 *
 * `docs/research/google-business-profile.md` §4 quotes Google: `reviews.list`
 * is "only valid if the specified location is verified". For a salon, a gym or
 * a driving school in Navi Mumbai, NOT being in Voice of Merchant is the
 * likeliest state we will meet — not an edge case. So this is a designed screen
 * state with its own copy, not a grey "couldn't load" box.
 *
 * All four documented remedial actions get their own sentence, plus the healthy
 * state and the `indeterminate` one Google leaves us in when it answers without
 * saying anything. The words come from `describeVoiceOfMerchant`, which is the
 * feature's single describer — this file lays them out and adds nothing.
 *
 * WHY `ownerAction` IS TEXT AND NOT A BUTTON
 * ------------------------------------------
 * "Verify this business with Google" and "Request ownership from Google" are
 * things the owner does on Google, in flows Shoogle has not built and cannot
 * complete. A button here would be a dead control (CONTRIBUTING.md rule 7), so
 * the action is stated as the next step, in words, and the card is honest that
 * it happens outside Shoogle. When `ownerAction` is null — Google is still
 * processing — nothing at all is offered, because waiting is not an action.
 */

import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

import { describeVoiceOfMerchant, type VoiceOfMerchantOutcome } from '../../voiceOfMerchant';

const ACCENT_BY_KIND: Readonly<Record<VoiceOfMerchantOutcome['kind'], AccentName>> = Object.freeze({
  has_voice_of_merchant: 'green',
  verify: 'amber',
  wait_for_voice_of_merchant: 'blue',
  resolve_ownership_conflict: 'amber',
  comply_with_guidelines: 'red',
  indeterminate: 'neutral',
});

const ICON_BY_KIND: Readonly<
  Record<VoiceOfMerchantOutcome['kind'], ComponentProps<typeof Ionicons>['name']>
> = Object.freeze({
  has_voice_of_merchant: 'checkmark-circle-outline',
  verify: 'shield-outline',
  wait_for_voice_of_merchant: 'time-outline',
  resolve_ownership_conflict: 'people-outline',
  comply_with_guidelines: 'warning-outline',
  indeterminate: 'help-circle-outline',
});

export interface VerificationPanelProps {
  outcome: VoiceOfMerchantOutcome;
  testID?: string;
}

export function VerificationPanel({ outcome, testID }: VerificationPanelProps) {
  const theme = useTheme();
  const explanation = describeVoiceOfMerchant(outcome);
  const accent = ACCENT_BY_KIND[outcome.kind];
  const { fg } = theme.accent(accent);

  return (
    <Card testID={testID} accent={accent}>
      <View style={styles.header}>
        <Ionicons name={ICON_BY_KIND[outcome.kind]} size={20} color={fg} />
        <Text variant="cardTitle" style={styles.title} testID={`${testID ?? 'vom'}-title`}>
          {explanation.title}
        </Text>
      </View>

      <Text
        variant="body"
        tone="muted"
        style={{ marginTop: theme.spacing.sm }}
        testID={`${testID ?? 'vom'}-body`}>
        {explanation.body}
      </Text>

      {explanation.reviewsReadable ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.md }}
          testID={`${testID ?? 'vom'}-reviews-blocked`}>
          Google does not let Shoogle read reviews for a listing in this state. That is why there is
          no list below — not because you have no reviews.
        </Text>
      )}

      {explanation.ownerAction === null ? (
        <Text
          variant="caption"
          tone="muted2"
          style={{ marginTop: theme.spacing.md }}
          testID={`${testID ?? 'vom'}-no-action`}>
          There is nothing to submit and nothing to fix from here.
        </Text>
      ) : (
        <View style={{ marginTop: theme.spacing.md }}>
          <Badge label="Next step" accent={accent} />
          <Text
            variant="bodyStrong"
            style={{ marginTop: 6 }}
            testID={`${testID ?? 'vom'}-owner-action`}>
            {explanation.ownerAction}
          </Text>
          <Text variant="caption" tone="muted2" style={{ marginTop: 4 }}>
            This happens on Google, not in Shoogle. Shoogle has not built this flow, so it will not
            pretend to start it for you.
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
});
