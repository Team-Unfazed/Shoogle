import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Skeleton } from './Skeleton';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * The large in-page title block that sits under the TopBar.
 *
 * Distinct from `TopBar`: the TopBar is the compact, always-visible chrome
 * (back button, actions), while PageHeader is the scrollable title that gives
 * the screen its identity. Screens use both.
 *
 * The title is a level-1 heading for screen readers; nothing else on the page
 * should claim that role.
 */
export interface PageHeaderProps {
  title: string;
  /** One line of context, e.g. "Nerul, Navi Mumbai". */
  subtitle?: string;
  /** Rendered to the right of the title, e.g. a Score or an action button. */
  trailing?: React.ReactNode;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PageHeader({
  title,
  subtitle,
  trailing,
  loading = false,
  style,
  testID,
}: PageHeaderProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <View testID={testID} style={[styles.root, style]}>
        <Skeleton width="65%" height={28} label="Loading page title" />
        <Skeleton width="40%" height={14} label="" style={{ marginTop: 8 }} />
      </View>
    );
  }

  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={styles.text}>
        <Text variant="screenTitle" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={{ marginLeft: theme.spacing.lg }}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  text: { flex: 1, minWidth: 0 },
});
