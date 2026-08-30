import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Select, Text, type SelectOption } from '@/components/ui';
import { useTheme } from '@/theme';

import {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_HINT,
  MEDIA_CATEGORY_LABEL,
  MEDIA_REQUIREMENTS,
  MIN_SHORT_EDGE_PX,
  SIZE_EXEMPT_CATEGORIES,
  describeValidation,
  formatBytes,
  validateMediaCandidate,
  type GbpMediaCategory,
  type MediaCandidate,
} from './model';

/**
 * "Add photos & videos" — the category picker and the client-side checks that
 * run before any upload path exists. Owner: Pranay.
 *
 * WHAT IS REAL IN HERE
 * --------------------
 * The category picker is the documented `locationAssociation` list, all
 * thirteen values, and the validation is Google's documented minimums enforced
 * client-side exactly as research §8 instructs: 250px on the short edge, 10KB
 * as a file, with cover photos and profile pictures exempt. Changing the
 * category re-runs the check, which is why a file that fails as "Outside the
 * shop" can pass as "Cover photo" — that is Google's rule, not a loophole.
 *
 * WHAT IS NOT REAL, AND SAYS SO
 * -----------------------------
 * There is no upload. No Google credential exists, `contracts.ts` declares no
 * media method, and `features/gbp` deliberately does not register a provider.
 * So the upload button is DISABLED with the reason printed next to it rather
 * than enabled and silently doing nothing (CONTRIBUTING rule 7). The same goes
 * for choosing a file from the phone: no picker is wired, and the control says
 * so instead of pretending.
 */
export function AddMediaSheet({
  visible,
  onDismiss,
  candidates,
  blockedReason,
}: {
  visible: boolean;
  onDismiss: () => void;
  /** Files already chosen. Empty in every real build today. */
  candidates: readonly MediaCandidate[];
  /** Why nothing can be uploaded yet. Printed beside the disabled button. */
  blockedReason: string;
}) {
  const theme = useTheme();
  const [category, setCategory] = useState<GbpMediaCategory>('EXTERIOR');

  const options: SelectOption<GbpMediaCategory>[] = MEDIA_CATEGORIES.map((value) => ({
    value,
    label: MEDIA_CATEGORY_LABEL[value],
    description: MEDIA_CATEGORY_HINT[value],
  }));

  const exempt = SIZE_EXEMPT_CATEGORIES.includes(category);

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title="Add photos and videos"
      description="Pick where the photo belongs on your listing. Shoogle checks Google's size rules before anything is sent."
      testID="add-media-sheet"
      footer={
        <View>
          {/*
            The reason is printed, not hidden behind the press. A disabled
            button with no visible explanation is the other way to build a dead
            control.
          */}
          <Text
            variant="caption"
            tone="muted"
            testID="upload-blocked-reason"
            style={{ marginBottom: theme.spacing.sm }}>
            {blockedReason}
          </Text>
          <Button
            label="Upload to Google"
            disabled
            accessibilityLabel="Upload to Google. Not available yet."
            testID="upload-media-button"
          />
        </View>
      }>
      <Select
        label="Category"
        value={category}
        options={options}
        onChange={setCategory}
        hint={
          exempt
            ? 'Google sets no size minimum for this category.'
            : `Google needs at least ${MIN_SHORT_EDGE_PX} pixels on the short edge and 10 KB for this category.`
        }
        testID="media-category-select"
      />

      <View style={{ marginTop: theme.spacing.xl }}>
        <Text variant="label" tone="muted2">
          What Google requires
        </Text>
        {MEDIA_REQUIREMENTS.map((line) => (
          <View
            key={line}
            style={[styles.bullet, { marginTop: theme.spacing.sm, gap: theme.spacing.sm }]}>
            <Ionicons name="ellipse" size={6} color={theme.colors.muted2} style={styles.dot} />
            <Text variant="caption" tone="muted" style={styles.bulletText}>
              {line}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <Text variant="label" tone="muted2">
          Files you have chosen
        </Text>

        {candidates.length === 0 ? (
          <View style={{ marginTop: theme.spacing.sm }}>
            <Button
              label="Choose a photo"
              variant="secondary"
              size="medium"
              disabled
              accessibilityLabel="Choose a photo. Not built yet."
              testID="choose-photo-button"
            />
            <Text
              variant="caption"
              tone="muted"
              testID="choose-photo-reason"
              style={{ marginTop: theme.spacing.sm }}>
              Picking a photo from your phone is not built yet, so there is nothing to check. The
              size rules above are what it will check when it is.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.md }}>
            {candidates.map((candidate) => {
              const validation = validateMediaCandidate({ ...candidate, category });
              const accent =
                validation.kind === 'ok'
                  ? 'green'
                  : validation.kind === 'rejected'
                    ? 'red'
                    : 'amber';
              const { fg, bg } = theme.accent(accent);
              const verdict =
                validation.kind === 'ok'
                  ? 'Ready to send'
                  : validation.kind === 'rejected'
                    ? 'Google would reject this'
                    : 'Cannot be checked';

              const measurements = [
                candidate.widthPx !== null && candidate.heightPx !== null
                  ? `${candidate.widthPx} × ${candidate.heightPx} px`
                  : 'Size in pixels not reported',
                candidate.byteSize !== null
                  ? formatBytes(candidate.byteSize)
                  : 'File size not reported',
              ].join(' · ');

              return (
                <View
                  key={candidate.id}
                  testID={`media-candidate-${candidate.id}`}
                  accessible
                  accessibilityLabel={`${candidate.fileName}. ${verdict}. ${describeValidation(validation).join(' ')}`}
                  style={[
                    styles.candidate,
                    {
                      backgroundColor: theme.colors.card2,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radii.lg,
                      padding: theme.spacing.md,
                    },
                  ]}>
                  <View style={[styles.candidateHead, { gap: theme.spacing.sm }]}>
                    <Text variant="bodyStrong" numberOfLines={1} style={styles.candidateName}>
                      {candidate.fileName}
                    </Text>
                    <View
                      style={[
                        styles.verdict,
                        {
                          backgroundColor: bg,
                          borderRadius: theme.radii.xs,
                          paddingHorizontal: theme.spacing.sm,
                        },
                      ]}>
                      <Text
                        variant="label"
                        style={{ color: fg }}
                        testID={`media-candidate-verdict-${candidate.id}`}>
                        {verdict}
                      </Text>
                    </View>
                  </View>

                  <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.xs }}>
                    {measurements}
                  </Text>

                  {describeValidation(validation).map((line) => (
                    <Text
                      key={line}
                      variant="caption"
                      tone="muted"
                      style={{ marginTop: theme.spacing.xs }}>
                      {line}
                    </Text>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: 'row', alignItems: 'flex-start' },
  dot: { marginTop: 6 },
  bulletText: { flex: 1 },
  candidate: { borderWidth: StyleSheet.hairlineWidth },
  candidateHead: { flexDirection: 'row', alignItems: 'center' },
  candidateName: { flex: 1 },
  verdict: { justifyContent: 'center' },
});
