import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

/**
 * Settings composition pieces. Feature owner: Aryan.
 *
 * Measurements transcribed from the `settings` screen in
 * "Shoogle Website.dc.html": grouped cards at radius 18 with 15px horizontal
 * padding, rows at 15px vertical with hairline separators, and uppercase group
 * labels inset by 4px.
 */

/* -------------------------------------------------------------------------- */
/* Group                                                                      */
/* -------------------------------------------------------------------------- */

export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <Text
        variant="label"
        tone="muted2"
        accessibilityRole="header"
        style={{ paddingLeft: 4, marginBottom: 9 }}>
        {title}
      </Text>
      <View
        style={[
          styles.groupCard,
          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
        ]}>
        {children}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                        */
/* -------------------------------------------------------------------------- */

export function SettingsRow({
  label,
  /** Right-aligned value, e.g. "Growth" or "3". */
  value,
  /** Small status pill shown before the chevron. */
  badge,
  badgeAccent = 'red',
  onPress,
  /** Renders the label in the destructive colour, e.g. Log out. */
  destructive = false,
  /** Hides the chevron for terminal actions. */
  showChevron = true,
  last = false,
  testID,
}: {
  label: string;
  value?: string;
  badge?: string;
  badgeAccent?: AccentName;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
  last?: boolean;
  testID?: string;
}) {
  const theme = useTheme();

  const content = (
    <>
      <Text
        variant="body"
        tone={destructive ? 'red' : 'default'}
        style={{
          flex: 1,
          fontSize: 14,
          fontFamily: destructive ? theme.fontFamily.semibold : theme.fontFamily.regular,
        }}>
        {label}
      </Text>

      {badge ? <Badge label={badge} accent={badgeAccent} /> : null}

      {value ? (
        <Text variant="caption" tone="muted2" style={{ fontSize: 13, marginLeft: 8 }}>
          {value}
        </Text>
      ) : null}

      {showChevron && !destructive ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.colors.muted2}
          style={{ marginLeft: 8 }}
        />
      ) : null}
    </>
  );

  const rowStyle = [
    styles.row,
    {
      minHeight: theme.control.minTouchTarget,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
  ];

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${label}${value ? `, ${value}` : ''}`} style={rowStyle}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}${badge ? `, ${badge}` : ''}`}
      android_ripple={{ color: theme.colors.border }}
      style={({ pressed }) => [...rowStyle, { opacity: pressed ? 0.7 : 1 }]}>
      {content}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Toggle row                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A switch row drawn to the design's 46x28 pill rather than the platform
 * Switch, so it matches the rest of the list.
 */
export function SettingsToggle({
  label,
  value,
  onChange,
  last = false,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: theme.control.minTouchTarget,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Text variant="body" style={{ flex: 1, fontSize: 14 }}>
        {label}
      </Text>
      <View
        style={[
          styles.track,
          {
            backgroundColor: value ? theme.colors.blue : theme.colors.border,
            justifyContent: value ? 'flex-end' : 'flex-start',
          },
        ]}>
        <View style={styles.knob} />
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Account card                                                               */
/* -------------------------------------------------------------------------- */

export function AccountCard({
  businessName,
  initials,
  ownerLine,
  onSwitch,
}: {
  businessName: string;
  initials: string;
  ownerLine: string;
  onSwitch?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.accountCard,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}>
      <View style={[styles.accountTile, { backgroundColor: theme.colors.blue }]}>
        <Text
          style={{ fontFamily: theme.fontFamily.display, fontSize: 17, color: theme.colors.onAccent }}>
          {initials}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" style={{ fontSize: 15 }} numberOfLines={1}>
          {businessName}
        </Text>
        <Text variant="caption" tone="muted" style={{ fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
          {ownerLine}
        </Text>
      </View>

      {onSwitch ? (
        <Pressable
          onPress={onSwitch}
          accessibilityRole="button"
          accessibilityLabel="Switch business"
          hitSlop={10}>
          <Text variant="caption" tone="blue" style={{ fontFamily: theme.fontFamily.bold, fontSize: 12.5 }}>
            Switch
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  group: { marginTop: 18 },
  groupCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },

  track: {
    width: 46,
    height: 28,
    borderRadius: 99,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },

  accountCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  accountTile: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
