import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * A titled block of content within a screen.
 *
 * Sections carry the page's heading structure: the title is announced as a
 * heading, and the section groups its children so TalkBack users can jump
 * between blocks instead of swiping through every row.
 */
export interface SectionProps {
  title: string;
  /** One line of context under the title. */
  subtitle?: string;
  /** Right-aligned affordance, e.g. "See all". */
  action?: { label: string; onPress: () => void };
  children?: React.ReactNode;
  /** Removes the default gap above the section. */
  first?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Section({
  title,
  subtitle,
  action,
  children,
  first = false,
  style,
  testID,
}: SectionProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      style={[{ marginTop: first ? 0 : theme.spacing['2xl'] }, style]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="label" tone="muted2" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}, ${title}`}
            hitSlop={10}
            style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}>
            <Text variant="caption" tone="blue" style={{ fontFamily: theme.fontFamily.bold }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ marginTop: theme.spacing.md }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, paddingRight: 12 },
  action: { minHeight: 24, justifyContent: 'center' },
});
