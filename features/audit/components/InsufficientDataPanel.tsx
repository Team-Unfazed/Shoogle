import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Score, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import type { GateId, GateResult } from '../types';

/**
 * The insufficient-data header. Owner: Pranay.
 *
 * THIS IS NOT AN ERROR SCREEN AND NOT AN EMPTY SCREEN. It is the most common
 * state the app is in today, and it is a genuine, useful answer: we looked, and
 * here is exactly how much we could see and which test the result failed.
 *
 * `<Score value={null}>` renders "—" and "Not measured yet". That is deliberate
 * and load-bearing: `AuditReport.score` is `number`, so there is no half-honest
 * middle option where a partial audit gets a partial number. A missing score is
 * a missing score.
 *
 * The four gates are all listed, passed ones included. An owner who can see
 * that three of four gates passed and exactly one did not can act on it —
 * "connect Google" is a very different next step from "we need a fresher read".
 */

/** Owner-facing questions, one per gate. No gate ids on screen. */
const GATE_QUESTION: Record<GateId, string> = {
  'G-identity': 'Is there a listing to look at?',
  'G-coverage': 'Did we see enough of it?',
  'G-breadth': 'Did we see every big part of it?',
  'G-freshness': 'Is what we saw recent?',
};

export interface InsufficientDataPanelProps {
  /** The message the engine attached to `unavailable('insufficient_data', …)`. */
  message: string;
  gates: readonly GateResult[];
  /** Scored checks that could not be run, for the `<Score>` caveat. */
  uncheckedCount: number;
  testID?: string;
}

export function InsufficientDataPanel({
  message,
  gates,
  uncheckedCount,
  testID,
}: InsufficientDataPanelProps) {
  const theme = useTheme();
  const { fg, bg } = theme.accent('amber');

  return (
    <View
      testID={testID ?? 'audit-insufficient'}
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor: fg,
          borderRadius: theme.radii.xl,
          padding: theme.spacing.xl,
        },
      ]}>
      <Score
        value={null}
        label="Profile score"
        uncheckedCount={uncheckedCount}
        testID="audit-score"
      />

      <Text
        variant="cardTitle"
        align="center"
        accessibilityRole="header"
        style={{ marginTop: theme.spacing.lg }}>
        Not enough measured to score you yet
      </Text>

      <Text variant="body" tone="muted" align="center" style={{ marginTop: theme.spacing.sm }}>
        {message}
      </Text>

      <View
        style={{
          alignSelf: 'stretch',
          backgroundColor: theme.colors.card,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
          marginTop: theme.spacing.lg,
        }}>
        <Text variant="label" tone="muted2">
          Why there is no number
        </Text>

        {gates.map((gate) => (
          <View key={gate.id} style={[styles.gate, { marginTop: theme.spacing.md }]}>
            <Ionicons
              name={gate.passed ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={gate.passed ? theme.colors.green : theme.colors.amber}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1, marginLeft: theme.spacing.sm, minWidth: 0 }}>
              <Text variant="bodyStrong" tone={gate.passed ? 'muted' : 'default'}>
                {GATE_QUESTION[gate.id]}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {gate.detail}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/*
        The rule that makes this state safe to ship: no score never means no
        problems. Everything the checks that DID run found is below.
      */}
      <Text variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.lg }}>
        A missing score does not hide a real problem. Everything the checks that did run found is
        listed below.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  gate: { flexDirection: 'row', alignItems: 'flex-start' },
});
