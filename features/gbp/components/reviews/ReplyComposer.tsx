/**
 * The reply composer, and the sentence that has to be on screen before an owner
 * presses submit. Owner: Pranay.
 *
 * THE MODERATION STATEMENT IS NOT DECORATION
 * ------------------------------------------
 * `docs/research/google-business-profile.md` §5 records `ReviewReplyState`
 * (2026-04-01): a reply enters MODERATION. So the owner is told, before they
 * commit, that pressing this button submits the reply to Google rather than
 * publishing it — and the button says "Submit", never "Publish" and never
 * "Post". Getting this wrong is not a copy nit; it is the difference between an
 * owner believing they have answered an angry customer and actually having done
 * so.
 *
 * CHARACTER GUIDANCE, NOT A CHARACTER LIMIT
 * -----------------------------------------
 * Google's own maximum reply length is UNVERIFIED in the research document, and
 * the same rule that governs `LocalPost.summary` applies here: silently
 * truncating an owner's words to a guessed limit is worse than letting Google
 * reject the request with its real message. So `Textarea` is given no
 * `maxCharacters`, the count is shown as guidance, and the guidance says
 * plainly that the cap is Google's and unknown to us.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Textarea, countCharacters, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/* -------------------------------------------------------------------------- */
/* Tone                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Tone changes the INSTRUCTION sent to the model, and nothing else. It does not
 * post-process the owner's own words, and it does not change what is submitted.
 */
export type ReplyTone = 'warm' | 'plain' | 'apologetic';

export const REPLY_TONES: readonly { value: ReplyTone; label: string; hint: string }[] = [
  { value: 'warm', label: 'Warm', hint: 'Friendly and personal, the way a small shop replies.' },
  { value: 'plain', label: 'Plain', hint: 'Short and factual. No flourish.' },
  {
    value: 'apologetic',
    label: 'Apologetic',
    hint: 'Acknowledges the problem first. For a complaint you accept.',
  },
];

export interface ToneChipsProps {
  value: ReplyTone;
  onChange: (tone: ReplyTone) => void;
  /** Non-null disables every chip and prints the reason. */
  disabledReason?: string | null;
  testID?: string;
}

/**
 * A 44pt chip row.
 *
 * Built here rather than reusing `Tabs` because these are not tabs: they do not
 * switch a view, they change what the draft button will ask for. Nothing in
 * `components/ui` is that, and adding one there is Aryan's call, not a
 * side-effect of this screen.
 */
export function ToneChips({ value, onChange, disabledReason = null, testID }: ToneChipsProps) {
  const theme = useTheme();
  const disabled = disabledReason !== null;

  return (
    <View testID={testID}>
      <View style={styles.chipRow}>
        {REPLY_TONES.map((tone) => {
          const selected = tone.value === value;
          const { fg, bg } = theme.accent(selected ? 'blue' : 'neutral');
          return (
            <Pressable
              key={tone.value}
              onPress={disabled ? undefined : () => onChange(tone.value)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${tone.label} tone`}
              accessibilityHint={disabled ? `Disabled. ${disabledReason}` : tone.hint}
              android_ripple={{ color: theme.colors.border }}
              testID={`${testID ?? 'tone'}-${tone.value}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  minHeight: theme.control.minTouchTarget,
                  paddingHorizontal: theme.spacing.lg,
                  borderRadius: theme.radii.sm,
                  backgroundColor: bg,
                  borderColor: selected ? fg : theme.colors.border,
                  opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}>
              <Text
                variant="caption"
                style={{
                  color: selected ? fg : theme.colors.muted,
                  fontFamily: selected ? theme.fontFamily.bold : theme.fontFamily.semibold,
                }}>
                {tone.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {disabled
          ? disabledReason
          : REPLY_TONES.find((tone) => tone.value === value)?.hint ?? ''}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Guidance                                                                   */
/* -------------------------------------------------------------------------- */

/** The band that reads well on a Google profile. Advice, never enforced. */
export const REPLY_GUIDANCE_BAND = { min: 60, max: 350 } as const;

export function replyLengthGuidance(value: string): string {
  const count = countCharacters(value);
  if (count === 0) {
    return `Nothing written yet. Replies of about ${REPLY_GUIDANCE_BAND.min}–${REPLY_GUIDANCE_BAND.max} characters read best on a Google profile.`;
  }
  if (count < REPLY_GUIDANCE_BAND.min) {
    return `${count} characters. Short replies can read as dismissive; around ${REPLY_GUIDANCE_BAND.min} is a comfortable minimum.`;
  }
  if (count > REPLY_GUIDANCE_BAND.max) {
    return `${count} characters. Longer than most people read on a profile. Shoogle does not cut it off — Google's own maximum is not documented in our research, so no limit is enforced here and Google will say if it objects.`;
  }
  return `${count} characters. A good length for a profile reply.`;
}

/* -------------------------------------------------------------------------- */
/* Composer                                                                   */
/* -------------------------------------------------------------------------- */

export const MODERATION_STATEMENT =
  'Google reviews every reply before it appears. Pressing submit sends it to Google — it does not put it on your profile. Shoogle will show you what Google decided, and will not call it published until Google says so.';

export interface ReplyComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Non-null puts the field in a disabled state with the reason shown. */
  disabledReason?: string | null;
  /** True when a reply already exists on Google and this will replace it. */
  isReplacingExistingReply?: boolean;
  testID?: string;
}

export function ReplyComposer({
  value,
  onChangeText,
  disabledReason = null,
  isReplacingExistingReply = false,
  testID,
}: ReplyComposerProps) {
  const theme = useTheme();

  return (
    <View testID={testID}>
      <Textarea
        label="Your reply"
        value={value}
        onChangeText={onChangeText}
        disabled={disabledReason !== null}
        placeholder="Write what you would say to this customer."
        hint={replyLengthGuidance(value)}
        minHeight={140}
        accessibilityLabel="Your reply to this review"
        testID={`${testID ?? 'composer'}-input`}
      />

      {isReplacingExistingReply ? (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'composer'}-replaces`}>
          This review already has a reply. Google’s API replaces a reply rather than adding a second
          one, so submitting this will replace what is there — and the replacement goes through
          moderation exactly like a new reply.
        </Text>
      ) : null}

      <View
        style={{
          marginTop: theme.spacing.lg,
          padding: theme.spacing.md,
          borderRadius: theme.radii.lg,
          backgroundColor: theme.colors.amberSoft,
        }}
        testID={`${testID ?? 'composer'}-moderation-notice`}>
        <Text variant="bodyStrong" tone="amber">
          This is reviewed by Google before it appears
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
          {MODERATION_STATEMENT}
        </Text>
      </View>

      {disabledReason === null ? null : (
        <Text
          variant="caption"
          tone="muted"
          style={{ marginTop: theme.spacing.sm }}
          testID={`${testID ?? 'composer'}-disabled-reason`}>
          {disabledReason}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
