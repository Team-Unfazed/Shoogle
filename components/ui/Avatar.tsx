import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Business or person avatar.
 *
 * Falls back to initials when there is no image, which is the normal case for
 * a newly-signed-up business - so the fallback must look intentional, not
 * broken. The colour is derived deterministically from the name so the same
 * business always gets the same tile.
 */
export interface AvatarProps {
  /** Used for initials and for the accessible label. */
  name: string;
  /** Remote or local image. Null/undefined renders initials. */
  uri?: string | null;
  size?: number;
  /** Square with rounded corners, for businesses rather than people. */
  shape?: 'circle' | 'rounded';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** First letters of up to two words, uppercased. */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

const PALETTE = ['blue', 'green', 'amber', 'red'] as const;

/** Stable hash so a given name always maps to the same accent. */
function accentFor(name: string): (typeof PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length] ?? 'blue';
}

export function Avatar({ name, uri, size = 40, shape = 'circle', style, testID }: AvatarProps) {
  const theme = useTheme();
  const radius = shape === 'circle' ? theme.radii.full : theme.radii.md;
  const { fg, bg } = theme.accent(accentFor(name));

  const base: ViewStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    backgroundColor: bg,
    overflow: 'hidden',
  };

  if (uri) {
    return (
      <Image
        testID={testID}
        source={{ uri }}
        style={[base, style as object]}
        contentFit="cover"
        accessible
        accessibilityLabel={name}
        transition={120}
      />
    );
  }

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[styles.fallback, base, style]}>
      <Text
        variant="cardTitle"
        style={{ color: fg, fontSize: Math.max(11, size * 0.38), lineHeight: size }}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
