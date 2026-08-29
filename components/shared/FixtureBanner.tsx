import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Pinned, unmissable marker that the content below is DEVELOPMENT FIXTURE DATA.
 *
 * Product rule 9: fixtures must never be presented as customer data. Any screen
 * rendering fixtures passes `showsFixtureData` to `<Screen>`, which mounts this.
 *
 * It cannot be dismissed and cannot be styled down. It only ever appears in
 * development: `isFixtureModeEnabled()` returns false in any release build, so
 * a Play Store binary can never show it - or the data behind it.
 */
export function FixtureBanner({ testID }: { testID?: string }) {
  const theme = useTheme();

  return (
    <View
      testID={testID ?? 'fixture-banner'}
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Warning. This screen is showing development fixture data, not real business data."
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.amberSoft,
          borderColor: theme.colors.amber,
          borderRadius: theme.radii.sm,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.lg,
        },
      ]}>
      <Ionicons name="flask-outline" size={18} color={theme.colors.amber} />
      <View style={styles.text}>
        <Text variant="label" tone="amber">
          Fixture data
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
          Development only. These values are made up and are not from this business.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1 },
  text: { flex: 1, marginLeft: 10 },
});
