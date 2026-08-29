import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Compact top chrome: optional back button, centred title, optional actions.
 *
 * The back button uses Expo Router's own history, so it stays consistent with
 * the Android hardware/gesture back gesture. It is hidden automatically when
 * there is nothing to go back to, rather than dead-ending the owner.
 *
 * Height is `control.appBarHeight` (56). Safe-area top padding is applied by
 * `Screen`, not here, so the bar can also be used inside sheets.
 */
export interface TopBarAction {
  icon: React.ComponentProps<typeof IconButton>['name'];
  accessibilityLabel: string;
  onPress: () => void;
  badge?: boolean;
}

export interface TopBarProps {
  title?: string;
  /** Shows a back chevron. Defaults to true when the router can go back. */
  showBack?: boolean;
  onBack?: () => void;
  actions?: TopBarAction[];
  /** Rendered instead of the title, e.g. a business switcher. */
  leading?: React.ReactNode;
  /** Draws the bottom hairline. Off for screens with a large PageHeader below. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TopBar({
  title,
  showBack,
  onBack,
  actions = [],
  leading,
  bordered = false,
  style,
  testID,
}: TopBarProps) {
  const theme = useTheme();
  const router = useRouter();

  const canGoBack = router.canGoBack();
  const backVisible = showBack ?? canGoBack;

  const handleBack = () => {
    if (onBack) return onBack();
    if (canGoBack) router.back();
  };

  return (
    <View
      testID={testID}
      style={[
        styles.bar,
        {
          height: theme.control.appBarHeight,
          paddingHorizontal: theme.spacing.sm,
          backgroundColor: theme.colors.bg,
          borderBottomWidth: bordered ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: theme.colors.border,
        },
        style,
      ]}>
      <View style={styles.side}>
        {backVisible ? (
          <IconButton
            name="arrow-back"
            accessibilityLabel="Go back"
            accessibilityHint="Returns to the previous screen"
            onPress={handleBack}
            testID="topbar-back"
          />
        ) : null}
        {leading}
      </View>

      {title ? (
        <Text variant="cardTitle" numberOfLines={1} align="center" style={styles.title}>
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}

      <View style={[styles.side, styles.actions]}>
        {actions.map((action) => (
          <View key={action.accessibilityLabel}>
            <IconButton
              name={action.icon}
              accessibilityLabel={action.accessibilityLabel}
              onPress={action.onPress}
              tone="default"
            />
            {action.badge ? (
              <View
                pointerEvents="none"
                style={[
                  styles.dot,
                  { backgroundColor: theme.colors.red, borderColor: theme.colors.bg },
                ]}
              />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center' },
  side: { flexDirection: 'row', alignItems: 'center', minWidth: 48 },
  actions: { justifyContent: 'flex-end' },
  title: { flex: 1, marginHorizontal: 4 },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
});
