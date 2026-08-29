import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Pinned marker shown whenever the app shell is reachable only because of the
 * development preview bypass.
 *
 * Nobody is signed in. There is no account, no session and no business behind
 * the screens below — so the banner says exactly that, and it cannot be
 * dismissed.
 *
 * It only ever renders in development: `isDevPreviewEnabled()` requires
 * `__DEV__` plus an explicit flag, and both non-development EAS profiles set
 * that flag to "0".
 */
export function DevPreviewBanner({ onExit }: { onExit?: () => void }) {
  const theme = useTheme();

  return (
    <View
      testID="dev-preview-banner"
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Development preview. You are not signed in and no data is real."
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.amberSoft,
          borderBottomColor: theme.colors.amber,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
        },
      ]}>
      <Ionicons name="eye-outline" size={16} color={theme.colors.amber} />
      <Text variant="caption" tone="amber" style={styles.text} numberOfLines={2}>
        Preview mode — not signed in. Nothing here is real data.
      </Text>
      {onExit ? (
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Exit preview mode"
          hitSlop={10}
          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <Text variant="label" tone="amber">
            Exit
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, marginLeft: 8 },
});
