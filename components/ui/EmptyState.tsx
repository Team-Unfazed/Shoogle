import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Shown when there is genuinely nothing to display, or when data exists but we
 * cannot reach it.
 *
 * This component is how Shoogle keeps product rule 7 ("unknown is not zero").
 * Any surface that would otherwise render `0`, a flat line, or a blank card
 * because data is missing must render an EmptyState instead, saying which of
 * these is true:
 *
 *   - nothing has happened yet          -> "Nothing yet"
 *   - the account is not linked          -> "Not connected"
 *   - the provider does not share it     -> "Not available"
 *   - there is too little to be useful   -> "Not enough data"
 *
 * Prefer building it from `UNAVAILABLE_COPY` via `<DataStateView>` rather than
 * hand-writing the strings.
 */
export interface EmptyStateProps {
  title: string;
  /** One or two sentences. Plain English, no jargon. */
  body?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  action?: { label: string; onPress: () => void };
  /** Quieter presentation for empties nested inside a card. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function EmptyState({
  title,
  body,
  icon = 'ellipse-outline',
  action,
  compact = false,
  style,
  testID,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={body ? `${title}. ${body}` : title}
      style={[
        styles.root,
        { paddingVertical: compact ? theme.spacing.xl : theme.spacing['4xl'] },
        style,
      ]}>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: theme.colors.card2,
            borderRadius: theme.radii.full,
            width: compact ? 40 : 56,
            height: compact ? 40 : 56,
          },
        ]}>
        <Ionicons name={icon} size={compact ? 20 : 26} color={theme.colors.muted2} />
      </View>

      <Text
        variant={compact ? 'bodyStrong' : 'cardTitle'}
        align="center"
        style={{ marginTop: theme.spacing.md }}>
        {title}
      </Text>

      {body ? (
        <Text
          variant="caption"
          tone="muted"
          align="center"
          style={{ marginTop: 6, maxWidth: 300 }}>
          {body}
        </Text>
      ) : null}

      {action ? (
        <Button
          label={action.label}
          variant="secondary"
          size="small"
          fullWidth={false}
          onPress={action.onPress}
          style={{ marginTop: theme.spacing.lg }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
});
