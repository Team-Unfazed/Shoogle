import { StyleSheet, View } from 'react-native';

import { Score, Text, scoreBand } from '@/components/ui';
import { useTheme } from '@/theme';

import { coverageSentence } from '../copy';

/**
 * The scored header. Owner: Pranay.
 *
 * Only rendered when the engine emitted a number, which means all four gates in
 * §3.3 passed. `<Score>` is the shared primitive and it already renders the
 * "n checks could not be run" caveat from `uncheckedCount`, so this component
 * never re-implements that — it supplies the number and the coverage sentence
 * that keeps the number honest.
 *
 * The headline is a band, not a verdict on the business: 74 is "getting there",
 * not "you are a 74". Nothing here predicts what Google will do with any of it
 * (§1.3) — Shoogle measures a profile, it does not forecast a ranking.
 */

const BAND_HEADLINE: Record<'green' | 'amber' | 'red', string> = {
  green: 'Your profile is in good shape',
  amber: 'Your profile is getting there',
  red: 'Your profile needs work',
};

export interface ScoreHeroProps {
  score: number;
  uncheckedCount: number;
  /** Scored checks that ran, and scored checks that apply. */
  ranCount: number;
  applicableCount: number;
  testID?: string;
}

export function ScoreHero({
  score,
  uncheckedCount,
  ranCount,
  applicableCount,
  testID,
}: ScoreHeroProps) {
  const theme = useTheme();
  const band = scoreBand(score);
  const { bg } = theme.accent(band);

  return (
    <View
      testID={testID ?? 'audit-score-hero'}
      style={[
        styles.card,
        {
          backgroundColor: bg,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.xl,
          padding: theme.spacing.xl,
        },
      ]}>
      <Score
        value={score}
        label="Profile score"
        uncheckedCount={uncheckedCount}
        testID="audit-score"
      />

      <Text
        variant="cardTitle"
        align="center"
        accessibilityRole="header"
        style={{ marginTop: theme.spacing.lg }}>
        {BAND_HEADLINE[band]}
      </Text>

      {/*
        The number never travels without the sentence that bounds it. "74" and
        "74, from 30 of 31 things" are different claims, and only the second one
        is true.
      */}
      <Text variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.xs }}>
        {coverageSentence(ranCount, applicableCount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
