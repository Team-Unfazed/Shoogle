/**
 * Where AI assistants can read about this business — the India directory
 * checklist. Owner: Pranay.
 *
 * WHY THIS IS A CHECKLIST AND NOT A SCANNER
 * -----------------------------------------
 * Shoogle cannot read Justdial, Sulekha, Practo or Zomato listings. Scraping
 * them is against their terms and Practo returns 403 to non-browser clients, so
 * there is no legitimate free source. Rather than pretend to detect anything,
 * this asks the owner one tap per row — the minimum possible input, and product
 * rule 3 is satisfied because no connected provider can return the answer.
 *
 * WHAT EACH ROW CLAIMS
 * --------------------
 * Only that the directory permits AI-search crawlers, so a complete listing
 * there is READABLE by an assistant. Never that listing anywhere gets a
 * business cited — nothing measures that. Every row carries the observation
 * behind it and the date it was made, and a row whose robots.txt could not be
 * read says `Unverified` rather than rounding up to a yes.
 *
 * THREE ANSWERS, NOT TWO. `unknown` is the starting state and is counted
 * separately from `not_listed`, because "we have not asked" and "you are not
 * there" are different facts. `directoryCoverage` returns three counts and
 * never a percentage.
 */

import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Badge, Button, Card, Divider, Text, useToast } from '@/components/ui';
import type { DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';
import type { BusinessCategory } from '@/types/domain';
import {
  describeDirectoryCoverage,
  directoryChecklist,
  directoryCoverage,
  type DirectoryEntry,
  type DirectoryId,
  type DirectoryPresence,
} from '../ai/directories';
import { formatIsoDay } from './evidence';

function DirectoryEvidence({ entry }: { entry: DirectoryEntry }) {
  const theme = useTheme();
  const day = formatIsoDay(`${entry.observedOn}T00:00:00.000Z`);

  return (
    <View style={{ marginTop: theme.spacing.sm }}>
      <View style={styles.evidenceHeader}>
        <Badge
          label={entry.crawlerEvidence === 'observed' ? 'Observed' : 'Unverified'}
          accent={entry.crawlerEvidence === 'observed' ? 'green' : 'amber'}
        />
        <Text variant="label" tone="muted2" style={styles.evidenceDate}>
          {day === null ? 'Checked once' : `Checked ${day}`}
        </Text>
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
        {entry.evidenceNote}
      </Text>
    </View>
  );
}

function DirectoryRow({
  entry,
  presence,
  onAnswer,
  onOpen,
}: {
  entry: DirectoryEntry;
  presence: DirectoryPresence;
  onAnswer: (presence: DirectoryPresence) => void;
  onOpen: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ paddingVertical: theme.spacing.md }}>
      <Text variant="bodyStrong">{entry.name}</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {entry.rationale}
      </Text>

      <DirectoryEvidence entry={entry} />

      <View style={[styles.controls, { marginTop: theme.spacing.md }]}>
        <Button
          label="Listed"
          size="small"
          fullWidth={false}
          variant={presence === 'listed' ? 'primary' : 'secondary'}
          onPress={() => onAnswer('listed')}
          accessibilityLabel={`${entry.name}: I am listed here`}
          accessibilityHint={
            presence === 'listed'
              ? 'Selected. Tap again to go back to not answered.'
              : 'Marks this directory as one you are listed on.'
          }
        />
        <Button
          label="Not listed"
          size="small"
          fullWidth={false}
          variant={presence === 'not_listed' ? 'primary' : 'secondary'}
          onPress={() => onAnswer('not_listed')}
          accessibilityLabel={`${entry.name}: I am not listed here`}
          accessibilityHint={
            presence === 'not_listed'
              ? 'Selected. Tap again to go back to not answered.'
              : 'Marks this directory as one you are not on.'
          }
        />
        <Button
          label="Open signup"
          size="small"
          fullWidth={false}
          variant="ghost"
          onPress={onOpen}
          accessibilityLabel={`Open the ${entry.name} signup page`}
          accessibilityHint="Opens in your browser, outside Shoogle."
        />
      </View>

      {presence === 'unknown' ? (
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
          Not answered.
        </Text>
      ) : null}
    </View>
  );
}

export interface DirectoryChecklistCardProps {
  /** The owner's vertical. Unavailable until Shoogle knows what they do. */
  state: DataState<BusinessCategory>;
  testID?: string;
}

export function DirectoryChecklistCard({ state, testID }: DirectoryChecklistCardProps) {
  const theme = useTheme();
  const toast = useToast();
  const [answers, setAnswers] = useState<Partial<Record<DirectoryId, DirectoryPresence>>>({});

  const answer = (id: DirectoryId, next: DirectoryPresence): void => {
    setAnswers((previous) => ({
      ...previous,
      // Tapping the selected answer again clears it, so a mis-tap is
      // recoverable and "not answered" stays reachable.
      [id]: previous[id] === next ? 'unknown' : next,
    }));
  };

  const open = (entry: DirectoryEntry): void => {
    void Linking.openURL(entry.signupUrl).catch(() => {
      toast.show({
        message: `Could not open ${entry.name}. Try ${entry.signupUrl} in your browser.`,
        tone: 'error',
      });
    });
  };

  return (
    <DataStateView testID="directories-state" state={state} skeletonLines={5}>
      {(category) => {
        const rows = directoryChecklist(category, answers);
        const coverage = directoryCoverage(rows);

        return (
          <Card testID={testID}>
            <Text variant="bodyStrong">{describeDirectoryCoverage(coverage)}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
              These sites let AI assistants read them, so a complete listing on one is readable by
              an assistant. That is the whole claim — nothing here says a listing gets you quoted,
              because nothing measures that.
            </Text>
            <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
              Your answers stay on this screen for now. Saving them needs the business profile
              store, which is not built yet — so they are gone when you leave.
            </Text>

            <View style={{ marginTop: theme.spacing.sm }}>
              {rows.map((row, index) => (
                <View key={row.entry.id}>
                  {index > 0 ? <Divider spacing={0} /> : null}
                  <DirectoryRow
                    entry={row.entry}
                    presence={row.presence}
                    onAnswer={(next) => answer(row.entry.id, next)}
                    onOpen={() => open(row.entry)}
                  />
                </View>
              ))}
            </View>
          </Card>
        );
      }}
    </DataStateView>
  );
}

const styles = StyleSheet.create({
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  evidenceDate: { flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
});
