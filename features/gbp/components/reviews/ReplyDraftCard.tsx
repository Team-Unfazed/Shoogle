/**
 * The one model-backed control on the reply screen. Owner: Pranay.
 *
 * IT REFUSES OUT LOUD RATHER THAN SPINNING
 * ----------------------------------------
 * `AiProvider.readiness()` is synchronous and side-effect free precisely so a
 * screen can render the honest state BEFORE starting anything. When the client
 * refuses — not a development build, fixture mode off, no key, or the material
 * is a real customer's words — the button is disabled and the refusal is
 * printed. There is never a spinner waiting on a request that was never allowed
 * to start, and the tone chips are disabled with the same reason so nothing on
 * the card is present-but-inert.
 *
 * WHY A REAL REVIEW IS NEVER SENT
 * -------------------------------
 * The only implementation is the free-tier Gemini client, whose terms let the
 * provider train on submitted content. A customer's review is that customer's
 * words about a real business, so it is exactly the class of data
 * `AiRequestEnvelope` exists to keep away from it. `payload` is therefore
 * fixture material or null, and the `[FIXTURE]` marker check inside
 * `features/seo/ai/gemini.ts` fails a mislabelled payload anyway.
 *
 * The draft is a starting point, not an answer. It lands in the composer only
 * when the owner presses "Use this draft", and Google still moderates whatever
 * they finally submit.
 */

import { useState } from 'react';
import { View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Badge, Button, Card, Text } from '@/components/ui';
import { fixtureInput, type AiProvider, type AiTextResult } from '@/features/seo';
import { loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

import { ToneChips, type ReplyTone } from './ReplyComposer';

/**
 * The instructions ship in the repository so every prompt is reviewable. They
 * are never assembled from owner input, and every one of them forbids the model
 * inventing a fact about the business.
 */
const TONE_INSTRUCTIONS: Readonly<Record<ReplyTone, string>> = Object.freeze({
  warm: 'Write a warm, personal reply from the business owner to this customer review. Two or three short sentences.',
  plain: 'Write a short, factual reply from the business owner to this customer review. Two sentences at most.',
  apologetic:
    'Write a reply from the business owner to this customer review that acknowledges the problem first and offers to put it right. Two or three short sentences.',
});

const SHARED_RULES =
  ' Thank the customer by the sentiment they expressed, not by name. Do not invent services, prices, ' +
  'offers, awards or facts of any kind. Do not promise anything specific. Do not ask them to remove ' +
  'or change the review. Reply in English.';

export function replyDraftInstruction(tone: ReplyTone): string {
  return `${TONE_INSTRUCTIONS[tone]}${SHARED_RULES}`;
}

export interface ReplyDraftCardProps {
  provider: AiProvider;
  /** Fixture review material to draft from, or null when there is none. */
  payload: string | null;
  tone: ReplyTone;
  onToneChange: (tone: ReplyTone) => void;
  /** Puts the draft into the composer. The owner still edits and submits it. */
  onUseDraft: (text: string) => void;
  testID?: string;
}

export function ReplyDraftCard({
  provider,
  payload,
  tone,
  onToneChange,
  onUseDraft,
  testID,
}: ReplyDraftCardProps) {
  const theme = useTheme();
  const [state, setState] = useState<DataState<AiTextResult> | null>(null);

  const readiness = provider.readiness();
  const blockedReason = readiness.status === 'blocked' ? readiness.message : null;
  const noMaterial =
    payload === null
      ? 'There is no development fixture review text to draft from, and Shoogle will not send a real customer’s words to a free-tier model.'
      : null;
  const disabledReason = blockedReason ?? noMaterial;

  const draft = (): void => {
    if (payload === null) return;
    setState(loading());
    void provider
      .generateText({
        task: 'review_reply',
        instruction: replyDraftInstruction(tone),
        input: fixtureInput(payload),
        maxOutputChars: 500,
      })
      .then(setState);
  };

  return (
    <Card testID={testID}>
      <Badge
        label={disabledReason === null ? provider.displayName : 'Not available'}
        accent={disabledReason === null ? 'blue' : 'neutral'}
      />

      <Text variant="cardTitle" style={{ marginTop: theme.spacing.sm }}>
        Draft a reply with AI
      </Text>

      <Text variant="body" tone="muted" style={{ marginTop: 6 }}>
        A starting point you edit before submitting. Nothing is sent to Google from this card, and a
        draft is not a reply until you submit it yourself.
      </Text>

      <View style={{ marginTop: theme.spacing.lg }}>
        <ToneChips
          value={tone}
          onChange={onToneChange}
          disabledReason={disabledReason}
          testID={`${testID ?? 'draft'}-tone`}
        />
      </View>

      <Button
        label="Draft a reply"
        variant="secondary"
        size="small"
        fullWidth={false}
        disabled={disabledReason !== null}
        loading={state?.status === 'loading'}
        onPress={disabledReason === null ? draft : undefined}
        accessibilityLabel="Draft a reply with AI"
        accessibilityHint={
          disabledReason === null
            ? 'Sends development fixture review text to the model and shows what it wrote.'
            : `Disabled. ${disabledReason}`
        }
        style={{ marginTop: theme.spacing.lg }}
        testID={`${testID ?? 'draft'}-button`}
      />

      {disabledReason === null ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'draft'}-refusal`}>
          {disabledReason}
        </Text>
      )}

      {state === null ? null : (
        <DataStateView
          state={state}
          onRetry={draft}
          skeletonLines={3}
          testID={`${testID ?? 'draft'}-state`}>
          {(result) => (
            <>
              <Text
                variant="body"
                style={{ marginTop: theme.spacing.lg }}
                testID={`${testID ?? 'draft'}-text`}>
                {result.text}
              </Text>
              <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
                {`Written by ${result.model} via ${provider.displayName}. One model’s output, not a measurement, and nothing has checked it.`}
                {result.derivedFromFixtureData
                  ? ' It was drafted from development fixture text, not from a real customer.'
                  : ''}
              </Text>
              <Button
                label="Use this draft"
                variant="ghost"
                size="small"
                fullWidth={false}
                onPress={() => onUseDraft(result.text)}
                accessibilityLabel="Put this draft into the reply box"
                accessibilityHint="You can edit it before submitting."
                style={{ marginTop: theme.spacing.sm }}
                testID={`${testID ?? 'draft'}-use`}
              />
            </>
          )}
        </DataStateView>
      )}
    </Card>
  );
}
