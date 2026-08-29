import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FixtureBanner } from './FixtureBanner';
import { useTheme } from '@/theme';

/**
 * The page container every screen sits in.
 *
 * It owns the four things that are easy to get wrong on Android and that no
 * feature should have to re-solve:
 *
 *  1. SAFE AREAS - top inset applied here; the bottom inset is owned by the tab
 *     bar, so screens inside (tabs) must NOT add it again or content floats.
 *  2. KEYBOARD - `KeyboardAvoidingView` plus `keyboardShouldPersistTaps` so a
 *     button under the keyboard is reachable and the first tap activates it
 *     instead of only dismissing the keyboard.
 *  3. NO HORIZONTAL OVERFLOW - a single horizontal padding token and a max
 *     content width; nothing inside should set its own screen padding.
 *  4. FIXTURE HONESTY - when a screen renders development fixtures it must pass
 *     `showsFixtureData`, which pins a visible banner. Fixtures can never be
 *     mistaken for the owner's real data.
 *
 * Tested at 390x844 and 412x915.
 */
export interface ScreenProps {
  children: React.ReactNode;
  /** Non-scrolling chrome pinned above the scroll area, e.g. `<TopBar />`. */
  header?: React.ReactNode;
  /** Pinned action bar above the tab bar, e.g. a primary CTA. */
  footer?: React.ReactNode;
  /** Turn off for screens that own their own FlatList. */
  scrollable?: boolean;
  /** Applies the top safe-area inset. Off inside a Stack that draws its own header. */
  edgeTop?: boolean;
  /** Adds the bottom inset. Only for screens OUTSIDE the tab navigator. */
  edgeBottom?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** MUST be true whenever any content on this screen comes from fixtures. */
  showsFixtureData?: boolean;
  /** Removes horizontal padding for edge-to-edge content such as carousels. */
  bleed?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({
  children,
  header,
  footer,
  scrollable = true,
  edgeTop = true,
  edgeBottom = false,
  refreshing = false,
  onRefresh,
  showsFixtureData = false,
  bleed = false,
  contentContainerStyle,
  style,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const paddingHorizontal = bleed ? 0 : theme.layout.screenPaddingX;

  const body = (
    <View style={[styles.body, { maxWidth: theme.layout.maxContentWidth }]}>
      {showsFixtureData ? <FixtureBanner /> : null}
      {children}
    </View>
  );

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.bg,
          paddingTop: edgeTop ? insets.top : 0,
        },
        style,
      ]}>
      {header}

      <KeyboardAvoidingView
        style={styles.flex}
        // Android resizes the window itself (adjustResize), so adding padding
        // here would double-count the keyboard height.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scrollable ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              {
                paddingHorizontal,
                paddingBottom: (edgeBottom ? insets.bottom : 0) + theme.spacing['3xl'],
              },
              contentContainerStyle,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[theme.colors.blue]}
                  tintColor={theme.colors.blue}
                  progressBackgroundColor={theme.colors.card}
                />
              ) : undefined
            }>
            {body}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.flex,
              { paddingHorizontal, paddingBottom: edgeBottom ? insets.bottom : 0 },
              contentContainerStyle,
            ]}>
            {body}
          </View>
        )}
      </KeyboardAvoidingView>

      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: theme.layout.screenPaddingX,
              paddingTop: theme.spacing.md,
              paddingBottom: (edgeBottom ? insets.bottom : 0) + theme.spacing.md,
              backgroundColor: theme.colors.card,
              borderTopColor: theme.colors.border,
            },
          ]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'stretch' },
  body: { width: '100%', alignSelf: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
