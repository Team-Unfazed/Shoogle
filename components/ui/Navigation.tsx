import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * The app's primary navigation: a four-item bottom bar.
 *
 * FOUR ITEMS. NOT MORE. The product specification defines exactly:
 *   Home - Posts - Business - Settings
 * SEO, GBP, Website, Audit, Carousel and Billing are all reached from inside
 * those four. Adding a fifth tab is a product decision, not an implementation
 * detail - do not add one to make a feature easier to find.
 *
 * Presentational only: it receives its items and an onSelect callback, so it
 * can be unit-tested without a navigator. `app/(tabs)/_layout.tsx` wires it to
 * Expo Router.
 *
 * Android specifics: the bar pads itself by the bottom safe-area inset so it
 * clears the gesture pill, and every target is at least 44pt tall.
 */
export interface NavigationItem {
  /** Route key, e.g. "index" | "posts" | "business" | "settings". */
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Filled variant shown when active. */
  iconActive: React.ComponentProps<typeof Ionicons>['name'];
  /**
   * Small count badge. `undefined` renders nothing. Never pass 0 to mean
   * "unknown" - omit it instead.
   */
  badgeCount?: number;
}

export interface NavigationProps {
  items: NavigationItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  testID?: string;
}

export function Navigation({ items, activeKey, onSelect, testID }: NavigationProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const handleSelect = useCallback(
    (key: string) => {
      if (key !== activeKey && Platform.OS === 'android') {
        void Haptics.selectionAsync();
      }
      onSelect(key);
    },
    [activeKey, onSelect],
  );

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel="Main navigation"
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
          paddingBottom: insets.bottom,
          height: theme.control.tabBarHeight + insets.bottom,
        },
      ]}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const color = active ? theme.colors.blue : theme.colors.muted;
        const hasBadge = typeof item.badgeCount === 'number' && item.badgeCount > 0;

        return (
          <Pressable
            key={item.key}
            testID={`nav-${item.key}`}
            onPress={() => handleSelect(item.key)}
            accessibilityRole="tab"
            accessibilityLabel={
              hasBadge ? `${item.label}, ${item.badgeCount} new` : item.label
            }
            accessibilityState={{ selected: active }}
            android_ripple={{ color: theme.colors.border, borderless: true, radius: 40 }}
            style={({ pressed }) => [
              styles.item,
              { minHeight: theme.control.minTouchTarget, opacity: pressed ? 0.7 : 1 },
            ]}>
            <View>
              <Ionicons name={active ? item.iconActive : item.icon} size={23} color={color} />
              {hasBadge ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.colors.red, borderColor: theme.colors.card },
                  ]}>
                  <Text
                    variant="label"
                    style={{ color: theme.colors.onAccent, fontSize: 9, lineHeight: 12 }}>
                    {item.badgeCount! > 9 ? '9+' : String(item.badgeCount)}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              variant="label"
              numberOfLines={1}
              style={{
                color,
                fontSize: 10,
                letterSpacing: 0.2,
                marginTop: 3,
                fontFamily: active ? theme.fontFamily.bold : theme.fontFamily.medium,
              }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The canonical four. Imported by the tabs layout; do not redefine elsewhere. */
export const PRIMARY_NAVIGATION: NavigationItem[] = [
  { key: 'index', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'posts', label: 'Posts', icon: 'albums-outline', iconActive: 'albums' },
  { key: 'business', label: 'Business', icon: 'storefront-outline', iconActive: 'storefront' },
  { key: 'settings', label: 'Settings', icon: 'person-outline', iconActive: 'person' },
];

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
});
