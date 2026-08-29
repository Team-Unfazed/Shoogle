import { Ionicons } from '@expo/vector-icons';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Transient confirmation / failure messages.
 *
 * HONESTY RULE: a toast reports something that ACTUALLY happened. Never show
 * "Post published" optimistically - wait for the provider to confirm, or say
 * "Scheduled" (which is true locally) instead.
 *
 * Toasts are announced to TalkBack via `announceForAccessibility` because a
 * transient view that mounts and unmounts is otherwise easy for a screen
 * reader to miss.
 */
export type ToastTone = 'neutral' | 'success' | 'error' | 'warning';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Milliseconds on screen. Errors default to longer. */
  durationMs?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastEntry extends Required<Pick<ToastOptions, 'message'>> {
  id: number;
  tone: ToastTone;
  durationMs: number;
  action?: { label: string; onPress: () => void };
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Access the toast API. Throws outside the provider so a missing provider is a
 * loud, immediate error rather than a silently swallowed message.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>. It is mounted in app/_layout.tsx.');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = useState<ToastEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setEntry(null);
  }, [clearTimer]);

  const show = useCallback(
    ({ message, tone = 'neutral', durationMs, action }: ToastOptions) => {
      clearTimer();
      const resolved = durationMs ?? (tone === 'error' ? 5000 : 3000);
      nextId.current += 1;
      setEntry({ id: nextId.current, message, tone, durationMs: resolved, ...(action ? { action } : {}) });
      AccessibilityInfo.announceForAccessibility(message);
      timer.current = setTimeout(() => setEntry(null), resolved);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {entry ? <ToastView key={entry.id} entry={entry} onDismiss={dismiss} /> : null}
    </ToastContext.Provider>
  );
}

const TONE_ICON: Record<ToastTone, React.ComponentProps<typeof Ionicons>['name']> = {
  neutral: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  error: 'alert-circle-outline',
  warning: 'warning-outline',
};

function ToastView({ entry, onDismiss }: { entry: ToastEntry; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: theme.motion.base });
  }, [progress, theme.motion.base]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 16 }],
  }));

  const accent = (() => {
    switch (entry.tone) {
      case 'success':
        return theme.colors.green;
      case 'error':
        return theme.colors.red;
      case 'warning':
        return theme.colors.amber;
      default:
        return theme.colors.blue;
    }
  })();

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        animated,
        { bottom: insets.bottom + theme.control.tabBarHeight + theme.spacing.md },
      ]}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLabel={entry.message}
        style={[
          styles.toast,
          {
            backgroundColor: theme.colors.card,
            borderRadius: theme.radii.lg,
            borderLeftWidth: 3,
            borderLeftColor: accent,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            ...theme.elevation.overlay,
          },
        ]}>
        <Ionicons name={TONE_ICON[entry.tone]} size={20} color={accent} />
        <Text variant="caption" style={styles.message} numberOfLines={3}>
          {entry.message}
        </Text>
        {entry.action ? (
          <Pressable
            onPress={() => {
              entry.action?.onPress();
              onDismiss();
            }}
            accessibilityRole="button"
            accessibilityLabel={entry.action.label}
            hitSlop={10}
            style={styles.action}>
            <Text variant="caption" tone="blue" style={{ fontFamily: theme.fontFamily.bold }}>
              {entry.action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  toast: { flexDirection: 'row', alignItems: 'center' },
  message: { flex: 1, marginLeft: 10 },
  action: { marginLeft: 12 },
});
