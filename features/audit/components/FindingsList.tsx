import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { splitForDisplay } from '../ordering';
import type { ShoogleFinding } from '../types';
import { FindingCard } from './FindingCard';

/**
 * The ordered findings, top three then a fold. Owner: Pranay.
 *
 * ORDER COMES FROM THE ENGINE AND IS NOT TOUCHED HERE. `orderFindings` already
 * applied the §5.3 hard rules — the connect finding pinned first, an unverified
 * listing second, one category proposal per run, observed beating inferred at
 * equal severity. Re-sorting in the view would silently undo all of that, so
 * this component only slices.
 *
 * The fold is `splitForDisplay`, so "three" stays a product decision in
 * `ordering.ts` rather than a magic number in a screen.
 */

export interface FindingsListProps {
  /** Already ordered by the engine. Rendered in the order given. */
  findings: readonly ShoogleFinding[];
  onFix: (finding: ShoogleFinding) => void;
  /**
   * How many checks could not be run. Used only for the empty case: "nothing to
   * fix" means something very different when half the audit did not run, and
   * saying "you're all clear" there would be a lie by omission.
   */
  uncheckedCount: number;
  testID?: string;
}

export function FindingsList({ findings, onFix, uncheckedCount, testID }: FindingsListProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (findings.length === 0) {
    return (
      <EmptyState
        testID={testID ?? 'findings-empty'}
        icon="checkmark-circle-outline"
        title="Nothing to fix from what we could check"
        body={
          uncheckedCount > 0
            ? `Every check that ran came back clean. ${uncheckedCount} check${
                uncheckedCount === 1 ? '' : 's'
              } could not be run, so this is not the whole picture — see below.`
            : 'Every check that ran came back clean.'
        }
        compact
      />
    );
  }

  const { top, remaining } = splitForDisplay(findings);
  const visible = expanded ? [...top, ...remaining] : top;

  return (
    <View testID={testID ?? 'findings-list'} style={{ gap: theme.layout.cardGap }}>
      {visible.map((finding) => (
        <FindingCard key={finding.checkId} finding={finding} onFix={onFix} />
      ))}

      {remaining.length > 0 ? (
        <Pressable
          onPress={() => setExpanded((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded
              ? 'Show fewer things to check'
              : `Show ${remaining.length} more thing${remaining.length === 1 ? '' : 's'} to check`
          }
          android_ripple={{ color: theme.colors.border }}
          testID="findings-fold"
          style={({ pressed }) => [
            styles.fold,
            {
              minHeight: theme.control.minTouchTarget,
              borderRadius: theme.radii.lg,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              paddingHorizontal: theme.spacing.lg,
              opacity: pressed ? 0.9 : 1,
            },
          ]}>
          <Text variant="bodyStrong" tone="blue">
            {expanded
              ? 'Show fewer'
              : `${remaining.length} more thing${remaining.length === 1 ? '' : 's'} to check`}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.colors.blue}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fold: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
