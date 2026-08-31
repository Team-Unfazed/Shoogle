/**
 * The one model-backed surface on the AI visibility screen. Owner: Pranay.
 *
 * Everything else on that screen is a deterministic measurement. This card asks
 * a model to DRAFT one thing — the `description` property for the business's
 * JSON-LD — and it is the only place a model is involved, because drafting
 * prose is the only job here that genuinely needs one.
 *
 * IT RESPECTS THE GUARD, AND SAYS SO WHEN THE GUARD REFUSES
 * --------------------------------------------------------
 * `AiProvider.readiness()` is synchronous and side-effect free precisely so a
 * screen can render the honest state BEFORE starting anything. When the client
 * refuses — not a development build, fixture mode off, no key, or the request
 * carries real customer data — the button is disabled and the refusal is
 * printed. There is never a spinner that cannot resolve, because the only
 * request this card makes is awaited and always resolves to a `DataState`.
 *
 * The free-tier Gemini client accepts fixture data only, so `payload` is
 * fixture material or null. Passing a real business's text is not possible from
 * here: the classification and the `[FIXTURE]` marker are both checked inside
 * `features/seo/ai/gemini.ts`, and a mislabelled payload still fails.
 *
 * NOTE ON SCOPE. This is NOT "Ask an AI" (§7.5), which probes a grounded model
 * with customer queries and reports what it said. That is blocked — it needs a
 * server-side proxy that does not exist — and it is named as blocked on the
 * screen rather than half-built here.
 */

import { useState } from 'react';

import { DataStateView } from '@/components/shared';
import { Badge, Button, Card, Text } from '@/components/ui';
import { loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';
import { fixtureInput, type AiProvider, type AiTextResult } from '../ai/contract';

/**
 * The instruction is written by us and lives in the repository, so every prompt
 * that ships is reviewable. It is never assembled from owner input.
 */
const DESCRIPTION_INSTRUCTION =
  'Write one plain-English sentence of at most 200 characters describing this business, for the ' +
  '"description" property of its LocalBusiness structured data. Use only the facts given below. ' +
  'Do not invent services, prices, awards, ratings or claims of any kind.';

export interface AiDraftCardProps {
  provider: AiProvider;
  /** Fixture material to draft from, or null when there is none. */
  payload: string | null;
  testID?: string;
}

export function AiDraftCard({ provider, payload, testID }: AiDraftCardProps) {
  const theme = useTheme();
  const [state, setState] = useState<DataState<AiTextResult> | null>(null);

  const readiness = provider.readiness();
  const blockedReason = readiness.status === 'blocked' ? readiness.message : null;
  const noMaterial =
    payload === null
      ? 'There is no development fixture text to draft from, and Shoogle will not send a real business’s details to a free-tier model.'
      : null;
  const disabledReason = blockedReason ?? noMaterial;

  const draft = (): void => {
    if (payload === null) return;
    setState(loading());
    void provider
      .generateText({
        task: 'schema_description',
        instruction: DESCRIPTION_INSTRUCTION,
        input: fixtureInput(payload),
        maxOutputChars: 240,
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
        Draft the description line
      </Text>

      <Text variant="body" tone="muted" style={{ marginTop: 6 }}>
        The one property of your structured data that has to be written rather than looked up. A
        model drafts it; nothing is published anywhere, and you would read it first.
      </Text>

      {disabledReason === null ? (
        <Button
          label="Draft it"
          variant="secondary"
          size="small"
          fullWidth={false}
          onPress={draft}
          loading={state?.status === 'loading'}
          accessibilityLabel="Draft the description line"
          accessibilityHint="Sends development fixture text to the model and shows what it wrote."
          style={{ marginTop: theme.spacing.lg }}
          testID="ai-draft-button"
        />
      ) : (
        <>
          <Button
            label="Draft it"
            variant="secondary"
            size="small"
            fullWidth={false}
            disabled
            accessibilityLabel="Draft the description line"
            accessibilityHint={`Disabled. ${disabledReason}`}
            style={{ marginTop: theme.spacing.lg }}
            testID="ai-draft-button"
          />
          <Text
            variant="caption"
            tone="muted"
            style={{ marginTop: theme.spacing.sm }}
            testID="ai-draft-refusal">
            {disabledReason}
          </Text>
        </>
      )}

      {state === null ? null : (
        <DataStateView state={state} onRetry={draft} skeletonLines={3} testID="ai-draft-state">
          {(result) => (
            <>
              <Text variant="body" style={{ marginTop: theme.spacing.lg }} testID="ai-draft-text">
                {result.text}
              </Text>
              <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
                {`Written by ${result.model} via ${provider.displayName}. This is one model's output, not a measurement, and it has not been checked against anything.`}
                {result.derivedFromFixtureData
                  ? ' It was drafted from development fixture text, not from this business.'
                  : ''}
              </Text>
            </>
          )}
        </DataStateView>
      )}
    </Card>
  );
}
