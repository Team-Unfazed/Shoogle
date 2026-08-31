import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { PHOTO_INSIGHTS_REMOVED_ON } from './model';

/**
 * "Why publish photos?" — the explainer, split into what is observable and what
 * is not. Owner: Pranay.
 *
 * Grexa's equivalent link sits under a banner promising photos "help you rank
 * higher on Google". This one refuses to make that claim and says why, then
 * gives the reasons that survive: a listing with a shopfront photo is easier to
 * recognise, and a listing whose newest photo is a year old reads as closed.
 * Both of those are statements about what the owner's listing SHOWS, which is
 * checkable, rather than about what Google's ranking does, which is not.
 *
 * Collapsed by default and expanded by a real press with a real implementation
 * — no dead control (CONTRIBUTING rule 7).
 */
const OBSERVABLE: readonly string[] = Object.freeze([
  'A shopfront photo is how someone recognises your place from the street. If none exists, they cannot.',
  'A listing whose newest photo is over a year old reads as a business that may have closed.',
  'Photos of your work are what someone is deciding between when they compare two shops.',
]);

const NOT_OBSERVABLE: readonly string[] = Object.freeze([
  `How many people saw a photo. Google removed photo views on ${PHOTO_INSIGHTS_REMOVED_ON}.`,
  'Where you rank in local search. Google publishes no rank position through any API.',
  'Whether a specific photo brought in a specific customer. Nothing connects the two.',
]);

export function WhyPublishCard() {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      testID="why-publish-card"
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.xl,
        },
      ]}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="Why publish photos and videos?"
        accessibilityHint={expanded ? 'Collapses the explanation' : 'Expands the explanation'}
        testID="why-publish-toggle"
        style={({ pressed }) => [
          styles.head,
          {
            minHeight: theme.control.minTouchTarget,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            gap: theme.spacing.md,
            opacity: pressed ? 0.6 : 1,
          },
        ]}>
        <Ionicons name="help-circle-outline" size={20} color={theme.colors.muted} />
        <Text variant="bodyStrong" style={styles.headText}>
          Why publish photos and videos?
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.muted2}
        />
      </Pressable>

      {expanded ? (
        <View
          testID="why-publish-body"
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
            gap: theme.spacing.lg,
          }}>
          <View>
            <Text variant="label" tone="muted2">
              What we can actually see
            </Text>
            {OBSERVABLE.map((line) => (
              <Bullet key={line} text={line} tone="green" />
            ))}
          </View>

          <View>
            <Text variant="label" tone="muted2">
              What nobody can tell you
            </Text>
            {NOT_OBSERVABLE.map((line) => (
              <Bullet key={line} text={line} tone="neutral" />
            ))}
            <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
              If an app shows you any of these three, it is estimating. Shoogle would rather leave
              the space empty than fill it with a number it cannot stand behind.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Bullet({ text, tone }: { text: string; tone: 'green' | 'neutral' }) {
  const theme = useTheme();
  return (
    <View style={[styles.bullet, { marginTop: theme.spacing.sm, gap: theme.spacing.sm }]}>
      <Ionicons
        name={tone === 'green' ? 'checkmark' : 'close'}
        size={15}
        color={tone === 'green' ? theme.colors.green : theme.colors.muted2}
      />
      <Text variant="caption" tone="muted" style={styles.bulletText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center' },
  headText: { flex: 1 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start' },
  bulletText: { flex: 1 },
});
