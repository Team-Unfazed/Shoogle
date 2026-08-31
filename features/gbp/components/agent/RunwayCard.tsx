import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { describeRunway, type AgentRunway } from './model';

/**
 * How long the profile is covered for.
 *
 * The competitor's version of this card reads "0 Photos left — Profile stays
 * fresh & active for 1 more week". The idea is good; the number is not derived
 * from anything. Ours is derived from two facts and nothing else: the items
 * genuinely on the schedule, and the date something was genuinely last
 * published. When either is missing the answer is "not known".
 *
 * THE ZERO PROBLEM, SOLVED IN PIXELS
 * ----------------------------------
 * "0 items scheduled" and "we do not know how many items are scheduled" are
 * different facts, and this card must not let them look alike. So:
 *
 *   measured zero  ->  a real "0", in full-strength text, badged "Counted"
 *   unknown        ->  an em dash, in tertiary text, badged "Not known"
 *
 * `describeRunway` decides which; `isMeasuredZero` carries it here so the two
 * cannot converge by accident.
 */
export interface RunwayCardProps {
  runway: AgentRunway;
  testID?: string;
}

/** The one place an unknown count is rendered. Never a zero. */
const UNKNOWN_COUNT = '—';

export function RunwayCard({ runway, testID }: RunwayCardProps) {
  const theme = useTheme();
  const description = describeRunway(runway);
  const known = description.countLabel !== null;

  return (
    <Card testID={testID}>
      <View style={[styles.head, { gap: theme.spacing.lg }]}>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={
            known
              ? `${description.countLabel} ${description.countCaption}`
              : `Number of scheduled items not known`
          }
          style={[
            styles.countBlock,
            {
              backgroundColor: theme.colors.card2,
              borderRadius: theme.radii.lg,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              // Two touch targets wide, so a three-digit count and a single em
              // dash occupy the same block and the card does not reflow.
              minWidth: theme.control.minTouchTarget * 2,
            },
          ]}>
          <Text
            testID={testID === undefined ? undefined : `${testID}-count`}
            style={{
              fontFamily: theme.fontFamily.display,
              fontSize: theme.typography.display.fontSize,
              lineHeight: theme.typography.display.lineHeight,
              color: known ? theme.colors.text : theme.colors.muted2,
            }}>
            {description.countLabel ?? UNKNOWN_COUNT}
          </Text>
          <Text variant="caption" tone={known ? 'muted' : 'muted2'} align="center">
            {description.countCaption}
          </Text>
        </View>

        <View style={styles.headText}>
          <Text
            variant="cardTitle"
            testID={testID === undefined ? undefined : `${testID}-headline`}>
            {description.headline}
          </Text>
          <View style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}>
            <Badge
              label={description.isMeasuredZero ? 'Counted' : known ? 'Measured' : 'Not known'}
              accent={known ? description.accent : 'neutral'}
              testID={testID === undefined ? undefined : `${testID}-basis`}
            />
          </View>
        </View>
      </View>

      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.lg }}>
        {description.body}
      </Text>

      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: theme.spacing.md }}
        testID={testID === undefined ? undefined : `${testID}-last-published`}>
        {description.lastPublishedLabel}
      </Text>

      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.md }}>
        A runway counts what is booked. It is not a claim that your profile ranks better for being
        busy — Google publishes no ranking through any API, so Shoogle does not imply one.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  countBlock: { alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, minWidth: 0 },
});
