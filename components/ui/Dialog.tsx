import { useEffect } from 'react';
import { BackHandler, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Centred confirmation dialog.
 *
 * Used only for decisions that are destructive or hard to undo (disconnect an
 * account, delete a scheduled post). Everything else should be a BottomSheet -
 * it is far easier to reach one-handed on a 412x915 phone.
 *
 * `accessibilityViewIsModal` traps TalkBack focus inside the dialog, and the
 * Android back button maps to the cancel action.
 */
export interface DialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Renders the confirm button in the destructive palette. */
  destructive?: boolean;
  /** Disables both buttons and shows a spinner on confirm. */
  busy?: boolean;
  testID?: string;
}

export function Dialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
  busy = false,
  testID,
}: DialogProps) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 140 });
  }, [visible, progress]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) onCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible, busy, onCancel]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.94 + progress.value * 0.06 }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={busy ? () => {} : onCancel}
      testID={testID}>
      <View style={[styles.root, { backgroundColor: theme.colors.scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            cardStyle,
            {
              backgroundColor: theme.colors.card,
              borderRadius: theme.radii.xl,
              padding: theme.spacing.xl,
              ...theme.elevation.overlay,
            },
          ]}>
          <Text variant="cardTitle" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            {message}
          </Text>

          <View style={[styles.actions, { marginTop: theme.spacing.xl }]}>
            <Button
              label={cancelLabel}
              variant="secondary"
              size="medium"
              onPress={onCancel}
              disabled={busy}
              fullWidth={false}
              style={styles.action}
            />
            <Button
              label={confirmLabel}
              variant={destructive ? 'destructive' : 'primary'}
              size="medium"
              onPress={onConfirm}
              loading={busy}
              fullWidth={false}
              style={[styles.action, { marginLeft: 10 }]}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  action: { flex: 1 },
});
