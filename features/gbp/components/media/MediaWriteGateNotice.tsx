import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import type { VoiceOfMerchantExplanation } from '../../voiceOfMerchant';

/**
 * What Voice of Merchant means for uploading a photo. Owner: Pranay.
 *
 * WHY THIS IS ON THE PHOTOS SCREEN AT ALL
 * ---------------------------------------
 * For a small Indian business, "not in Voice of Merchant" is the LIKELIEST
 * state, not an edge case — unverified, awaiting Google's processing, claimed
 * by a previous owner, or suspended. Google does not document a verification
 * gate on `media.create` specifically, but it does document that edits reach
 * Maps only once the profile holds Voice of Merchant. So this warns rather than
 * blocks: uploading may be attempted, but promising the photo will appear on
 * Google would be a claim we cannot support.
 *
 * The four remedial outcomes are rendered from `describeVoiceOfMerchant`, so
 * the wording here can never drift from the rest of the GBP surface, and
 * `ownerAction` of `null` renders no button — "wait" is not an action
 * (CONTRIBUTING rule 7).
 */
export function MediaWriteGateNotice({
  explanation,
}: {
  explanation: VoiceOfMerchantExplanation;
}) {
  const theme = useTheme();

  if (!explanation.writesMayNotReachGoogle) return null;

  return (
    <Card testID="media-write-gate" accent="amber">
      <View style={[styles.head, { gap: theme.spacing.md }]}>
        <Ionicons name="alert-circle-outline" size={20} color={theme.colors.amber} />
        <Text variant="cardTitle" style={styles.title}>
          {explanation.title}
        </Text>
      </View>

      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {explanation.body}
      </Text>

      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.md }}>
        A photo uploaded while this is unresolved may never appear on Search or Maps. Shoogle will
        not report a photo as live on Google until Google says it is.
      </Text>

      {explanation.ownerAction === null ? (
        // Deliberately no button. There is nothing for the owner to do, and a
        // control that cannot help is worse than none.
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
          There is nothing to submit — this one is on Google’s side.
        </Text>
      ) : (
        <Text
          variant="caption"
          tone="amber"
          testID="media-write-gate-action"
          style={{ marginTop: theme.spacing.sm }}>
          Next step: {explanation.ownerAction}.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});
