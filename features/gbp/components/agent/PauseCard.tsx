import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import type { DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

import { PAUSE_DOES_NOT_STOP, PAUSE_STOPS, type AgentPausePreference } from './model';

/**
 * The stop switch. Product rule 5: the owner must always be able to stop the
 * operator, in one tap, from where they are.
 *
 * WHAT THIS CARD REFUSES TO DO
 * ----------------------------
 * - It does not say "Paused" until the write to the device has come back. The
 *   button shows busy and the label only changes once the store confirms; see
 *   `pausePreference.ts`.
 * - It does not claim pausing stops something that is not running. Today
 *   nothing is running, because nothing is connected, and the card says that
 *   plainly instead of implying the owner just switched off a live agent.
 * - When the stored setting could not be read, it still offers Pause. Reading
 *   failed, writing may not have, and the safe direction is the one that stops
 *   the agent. It does not offer Resume, because resuming from an unknown state
 *   would be a decision Shoogle made rather than the owner.
 */
export interface PauseCardProps {
  state: DataState<AgentPausePreference>;
  busy: boolean;
  /** Called with the value being requested, not with a toggle. */
  onToggle: (nextPaused: boolean) => void;
  /**
   * Whether the agent could act at all if it were not paused. False today, and
   * it changes what pausing honestly means.
   */
  canActIfResumed: boolean;
  testID?: string;
}

export function PauseCard({ state, busy, onToggle, canActIfResumed, testID }: PauseCardProps) {
  const theme = useTheme();

  const paused = state.status === 'ready' ? state.value.paused : null;
  const unreadable = state.status === 'error' || state.status === 'unavailable';
  const stillReading = state.status === 'loading';

  const buttonLabel = paused === true ? 'Resume Shoogle' : 'Pause Shoogle';
  const nextValue = paused !== true;

  return (
    <Card testID={testID}>
      <Text variant="cardTitle">{paused === true ? 'Shoogle is paused' : 'Stop Shoogle'}</Text>

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
        {stillReading
          ? 'Reading your setting from this device.'
          : unreadable
            ? 'Your saved setting could not be read, so Shoogle is treating itself as stopped. Pausing again will save it.'
            : paused === true
              ? 'Nothing will be published or submitted on your behalf until you resume.'
              : canActIfResumed
                ? 'One tap stops everything below. You can resume whenever you like.'
                : 'Nothing is running to stop right now — Shoogle cannot act at all until a Google Business Profile is connected. Pausing now records your choice, so it stays stopped when that changes.'}
      </Text>

      <Button
        label={buttonLabel}
        variant={paused === true ? 'primary' : 'secondary'}
        size="large"
        loading={busy}
        disabled={stillReading}
        onPress={() => onToggle(nextValue)}
        accessibilityLabel={
          paused === true
            ? 'Resume Shoogle. Lets it publish on your behalf again'
            : 'Pause Shoogle. Stops it publishing anything on your behalf'
        }
        accessibilityHint={
          stillReading ? 'Not available until your saved setting has been read' : undefined
        }
        style={{ marginTop: theme.spacing.lg }}
        testID={testID === undefined ? undefined : `${testID}-toggle`}
      />

      {stillReading ? (
        <Text
          variant="caption"
          tone="muted2"
          style={{ marginTop: theme.spacing.sm }}
          testID={testID === undefined ? undefined : `${testID}-disabled-reason`}>
          Waiting until Shoogle has read whether you already paused it, so this button cannot
          silently flip your setting the wrong way.
        </Text>
      ) : null}

      <PauseEffectList
        title="Pausing stops"
        icon="close-circle-outline"
        tone="red"
        items={PAUSE_STOPS}
        testID={testID === undefined ? undefined : `${testID}-stops`}
      />
      <PauseEffectList
        title="Pausing does not stop"
        icon="ellipse-outline"
        tone="muted"
        items={PAUSE_DOES_NOT_STOP}
        testID={testID === undefined ? undefined : `${testID}-continues`}
      />
    </Card>
  );
}

function PauseEffectList({
  title,
  icon,
  tone,
  items,
  testID,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'red' | 'muted';
  items: readonly string[];
  testID?: string;
}) {
  const theme = useTheme();
  const color = tone === 'red' ? theme.colors.red : theme.colors.muted2;

  return (
    <View testID={testID} style={{ marginTop: theme.spacing.lg }}>
      <Text variant="label" tone="muted2">
        {title}
      </Text>
      {items.map((item) => (
        <View
          key={item}
          style={[styles.row, { marginTop: theme.spacing.sm, gap: theme.spacing.sm }]}>
          <Ionicons name={icon} size={theme.spacing.lg} color={color} />
          <Text variant="caption" tone="muted" style={styles.rowText}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowText: { flex: 1, minWidth: 0 },
});
