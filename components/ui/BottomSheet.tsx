import React, { useCallback, useEffect } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './IconButton';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Bottom sheet - the primary way Shoogle asks for a decision on Android.
 *
 * Behaviour required on Android specifically:
 *  - the hardware/gesture BACK button dismisses the sheet before the screen
 *  - the sheet lifts above the keyboard rather than being covered by it
 *  - the bottom safe-area inset is padded so content clears the gesture pill
 *
 * Radius 26 on the top corners, from the design system's "sheet" swatch.
 */
export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  /** Optional one-line explanation under the title. */
  description?: string;
  children?: React.ReactNode;
  /** Pinned action row, kept out of the scroll area. */
  footer?: React.ReactNode;
  /** Hides the close button when dismissal must be an explicit choice. */
  dismissible?: boolean;
  /** Scrolls the body. Turn off for sheets that own their own list. */
  scrollable?: boolean;
  testID?: string;
}

const TIMING: WithTimingConfig = { duration: 180 };

export function BottomSheet({
  visible,
  onDismiss,
  title,
  description,
  children,
  footer,
  dismissible = true,
  scrollable = true,
  testID,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, TIMING);
  }, [visible, progress]);

  // Android back button closes the sheet, not the underlying screen.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dismissible) onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [visible, dismissible, onDismiss]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 32 }],
    opacity: progress.value,
  }));

  const handleBackdrop = useCallback(() => {
    if (dismissible) onDismiss();
  }, [dismissible, onDismiss]);

  const Body = scrollable ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleBackdrop}
      testID={testID}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]}
            onPress={handleBackdrop}
            accessibilityRole="button"
            accessibilityLabel="Close"
            accessibilityHint="Closes this sheet"
            importantForAccessibility={dismissible ? 'yes' : 'no-hide-descendants'}
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
          pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              sheetStyle,
              {
                backgroundColor: theme.colors.card,
                borderTopLeftRadius: theme.radii.sheet,
                borderTopRightRadius: theme.radii.sheet,
                paddingBottom: insets.bottom + theme.spacing.lg,
                ...theme.elevation.overlay,
              },
            ]}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[styles.grabber, { backgroundColor: theme.colors.border }]}
            />

            <View style={[styles.header, { paddingHorizontal: theme.spacing.xl }]}>
              <View style={styles.headerText}>
                <Text variant="cardTitle" accessibilityRole="header">
                  {title}
                </Text>
                {description ? (
                  <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
                    {description}
                  </Text>
                ) : null}
              </View>
              {dismissible ? (
                <IconButton name="close" accessibilityLabel="Close" onPress={onDismiss} tone="muted" />
              ) : null}
            </View>

            <Body
              style={styles.body}
              contentContainerStyle={
                scrollable
                  ? { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }
                  : undefined
              }
              {...(scrollable
                ? { keyboardShouldPersistTaps: 'handled' as const, bounces: false }
                : { style: [styles.body, { paddingHorizontal: theme.spacing.xl }] })}>
              {children}
            </Body>

            {footer ? (
              <View
                style={[
                  styles.footer,
                  { paddingHorizontal: theme.spacing.xl, borderTopColor: theme.colors.border },
                ]}>
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  keyboardWrap: { justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', paddingTop: 8 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerText: { flex: 1, paddingRight: 8 },
  body: { flexGrow: 0 },
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
