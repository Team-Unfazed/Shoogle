import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import {
  coverageEvidenceSentence,
  describeMediaAge,
  type MediaCoverageObservation,
} from './model';

/**
 * Photo coverage as an audit-style OBSERVATION. Owner: Pranay.
 *
 * WHY THIS EXISTS INSTEAD OF A PERFORMANCE PANEL
 * ----------------------------------------------
 * "Photos help you rank higher" is unfalsifiable — Google publishes no rank and
 * no photo views. "You have nothing showing the inside of your shop" is a fact
 * derived from a list Google returned, it is checkable by the owner in two
 * seconds, and it names something to do this afternoon. Coverage is what is
 * left once every unmeasurable claim is removed, and it turns out to be the
 * useful part.
 *
 * Every count on this card is a MEASUREMENT of `media.list`. A bucket with zero
 * items is a measured zero and says so; it is not the same as the whole card
 * being absent, which is what happens when the list could not be read at all.
 * That branch lives on the screen, not here — this component is only ever
 * handed an observation that exists.
 */
export function MediaCoverageCard({
  observation,
  now,
}: {
  observation: MediaCoverageObservation;
  /** RFC 3339 "now", passed in so the recency line is deterministic. */
  now: string;
}) {
  const theme = useTheme();
  const newestAge = describeMediaAge(observation.newestCreateTime, now);

  return (
    <Card testID="media-coverage-card">
      <Text variant="cardTitle">What your photos cover</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
        {observation.emptyBuckets.length === 0
          ? 'Every kind of photo people look for is covered.'
          : `${observation.emptyBuckets.length} of ${observation.buckets.length} kinds of photo are missing.`}
      </Text>

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        {observation.buckets.map((bucket) => {
          const covered = bucket.count > 0;
          return (
            <View
              key={bucket.id}
              testID={`coverage-bucket-${bucket.id}`}
              accessible
              accessibilityLabel={
                covered
                  ? `${bucket.label}: ${bucket.count} ${bucket.count === 1 ? 'photo' : 'photos'}.`
                  : `${bucket.label}: nothing yet. ${bucket.why}`
              }
              style={[styles.row, { gap: theme.spacing.md }]}>
              <Ionicons
                name={covered ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={covered ? theme.colors.green : theme.colors.muted2}
              />
              <View style={styles.rowBody}>
                <Text variant="bodyStrong">{bucket.label}</Text>
                <Text variant="caption" tone="muted">
                  {covered
                    ? `${bucket.count} ${bucket.count === 1 ? 'photo' : 'photos'} you have added`
                    : `Nothing yet. ${bucket.why}`}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View
        style={[
          styles.recency,
          {
            marginTop: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            borderTopColor: theme.colors.border,
          },
        ]}>
        <Text variant="caption" tone="muted" testID="media-recency-line">
          {newestAge.kind === 'known'
            ? `Newest photo you added: ${newestAge.label.toLowerCase()}.`
            : 'Newest photo you added: Google returned no usable date, so the age is unknown.'}
        </Text>
        {/*
          The observation the claim rests on. Grexa states an outcome and shows
          nothing behind it; this line is what makes the sentence above
          arguable, and an owner who can argue with a finding can trust it.
        */}
        <Text
          variant="caption"
          tone="muted2"
          testID="media-coverage-evidence"
          style={{ marginTop: theme.spacing.xs }}>
          {coverageEvidenceSentence(observation)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowBody: { flex: 1 },
  recency: { borderTopWidth: StyleSheet.hairlineWidth },
});
