import { StyleSheet, View } from 'react-native';

import { EmptyState, Score, Text } from '@/components/ui';
import { AREA_LABEL, type AuditArea } from '../types';
import { useTheme } from '@/theme';

/**
 * "No audit has run." Owner: Pranay.
 *
 * Two honest sub-cases, and they are different facts with different next steps:
 *
 *   not_connected  Shoogle has no Google Business Profile to read. Nothing has
 *                  been measured, so there is no score and no finding list —
 *                  and crucially no "0", no empty chart and no grey zeros.
 *   connected      A listing is linked, but no read has been performed yet.
 *                  Saying "not connected" there would be a false statement
 *                  about the owner's account.
 *
 * The list of areas is not a result and is not styled like one. It answers "so
 * what would you actually check?", which is the only useful thing this screen
 * can say before it has data.
 */

const AREA_ORDER: readonly AuditArea[] = [
  'foundation',
  'nap',
  'categories',
  'hours',
  'media',
  'reviews',
  'posts',
  'description',
  'website',
];

export interface AuditNotRunProps {
  /** False when a Google Business Profile is linked but has not been read yet. */
  notConnected: boolean;
  /** The reason string the provider registry gave us. Shown, not paraphrased. */
  message: string;
  /** Connect / run action. Must announce itself if it is not built yet. */
  onPrimaryAction: () => void;
  testID?: string;
}

export function AuditNotRun({
  notConnected,
  message,
  onPrimaryAction,
  testID,
}: AuditNotRunProps) {
  const theme = useTheme();

  return (
    <View testID={testID ?? 'audit-not-run'} style={{ gap: theme.layout.cardGap }}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.xl,
            padding: theme.spacing.xl,
          },
        ]}>
        {/* Null, not zero. A business nobody has audited has no score at all. */}
        <Score value={null} label="Profile score" testID="audit-score" />

        <EmptyState
          icon={notConnected ? 'link-outline' : 'time-outline'}
          title={notConnected ? 'Nothing measured yet' : 'Not read yet'}
          body={
            notConnected
              ? `${message} Once it is linked, Shoogle checks 34 things about how your business looks on Google and tells you what to fix first.`
              : 'Your Google listing is linked, but Shoogle has not read it yet. Nothing here has been measured.'
          }
          action={{
            label: notConnected ? 'Connect Google Business Profile' : 'Run the audit',
            onPress: onPrimaryAction,
          }}
          compact
        />
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.xl,
            padding: theme.spacing.lg,
          },
        ]}>
        <Text variant="label" tone="muted2">
          What the audit looks at
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
          Nothing below has been measured. This is what Shoogle will check.
        </Text>
        <View style={[styles.areas, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
          {AREA_ORDER.map((area) => (
            <View
              key={area}
              style={{
                backgroundColor: theme.colors.card2,
                borderRadius: theme.radii.sm,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
              }}>
              <Text variant="caption" tone="muted">
                {AREA_LABEL[area]}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  areas: { flexDirection: 'row', flexWrap: 'wrap' },
});
