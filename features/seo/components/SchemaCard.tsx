/**
 * Machine-readable business details — the `LocalBusiness` JSON-LD card.
 * Owner: Pranay.
 *
 * This is a §7A item: it needs no credential, no billing account and no model.
 * It builds markup from facts Shoogle already holds and reports, property by
 * property, what it could not fill in.
 *
 * THE THREE THINGS THIS CARD MUST NOT SAY
 * ---------------------------------------
 * 1. "Your schema is valid." Google's Rich Results Test has no public API, so
 *    validity is not ours to declare. The card reports which of OUR checks
 *    passed and names the rest as unchecked.
 * 2. "This will get you into AI answers." Google says structured data is not
 *    required for AI features. `SCHEMA_HONEST_FRAMING` is the sanctioned copy.
 * 3. Anything about a property we do not have. A missing property is listed as
 *    missing; it is never filled with an empty string, "N/A" or a guess.
 *
 * The markup preview is gated on `publishable`, because
 * `serializeLocalBusinessSchema` refuses to render incomplete markup — half a
 * description tells a search engine we described the business when we did not.
 */

import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Badge, Button, Card, Text } from '@/components/ui';
import type { DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';
import {
  SCHEMA_HONEST_FRAMING,
  serializeLocalBusinessSchema,
  type LocalBusinessSchemaResult,
} from '../ai/schema';
import { formatIsoDay } from './evidence';

function PropertyList({ title, items }: { title: string; items: readonly string[] }) {
  const theme = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: theme.spacing.md }}>
      <Text variant="label" tone="muted2">
        {title}
      </Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
        {items.join(' · ')}
      </Text>
    </View>
  );
}

export interface SchemaCardProps {
  state: DataState<LocalBusinessSchemaResult>;
  testID?: string;
}

export function SchemaCard({ state, testID }: SchemaCardProps) {
  const theme = useTheme();
  const [showMarkup, setShowMarkup] = useState(false);

  return (
    <DataStateView testID="schema-state" state={state} skeletonLines={4}>
      {(result, meta) => {
        const rawType = result.jsonLd['@type'];
        const type = typeof rawType === 'string' ? rawType : null;
        const markup = serializeLocalBusinessSchema(result);
        const builtOn = formatIsoDay(meta.fetchedAt);

        return (
          <Card testID={testID}>
            <Badge
              label={result.publishable ? 'Ready to put on your site' : 'Not complete enough'}
              accent={result.publishable ? 'green' : 'amber'}
            />

            <Text variant="cardTitle" style={{ marginTop: theme.spacing.sm }}>
              {type === null ? 'Business markup' : `Described as ${type}`}
            </Text>

            <Text variant="body" tone="muted" style={{ marginTop: 6 }}>
              {SCHEMA_HONEST_FRAMING}
            </Text>

            <PropertyList
              title="Missing, and required by Google"
              items={result.missingRequired}
            />
            <PropertyList title="Missing, and recommended" items={result.missingRecommended} />
            <PropertyList title="Worth knowing" items={result.notes} />

            <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.md }}>
              {builtOn === null
                ? 'Built from what Shoogle knows about your business.'
                : `Built from what Shoogle knew about your business on ${builtOn}.`}{' '}
              Whether Google accepts this markup is not something we can check — its Rich Results
              Test has no public interface for an app to call.
            </Text>

            {markup === null ? (
              <Button
                label="Show the markup"
                variant="secondary"
                size="small"
                disabled
                accessibilityHint="Disabled. The markup is only shown once every required property is filled in."
                style={{ marginTop: theme.spacing.lg }}
              />
            ) : (
              <Button
                label={showMarkup ? 'Hide the markup' : 'Show the markup'}
                variant="secondary"
                size="small"
                onPress={() => setShowMarkup((previous) => !previous)}
                accessibilityHint="Shows the exact JSON-LD block Shoogle would put on your site."
                style={{ marginTop: theme.spacing.lg }}
              />
            )}

            {markup === null ? (
              <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
                A required property is missing, so there is nothing safe to show. Incomplete markup
                is worse than none: it tells a search engine your business has been described when
                it has not.
              </Text>
            ) : null}

            {markup !== null && showMarkup ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                accessibilityLabel="The generated JSON-LD markup"
                style={{
                  marginTop: theme.spacing.md,
                  backgroundColor: theme.colors.card2,
                  borderRadius: theme.radii.lg,
                }}
                contentContainerStyle={{ padding: theme.spacing.md }}>
                <Text variant="caption" tone="muted" testID="schema-markup">
                  {markup}
                </Text>
              </ScrollView>
            ) : null}
          </Card>
        );
      }}
    </DataStateView>
  );
}
