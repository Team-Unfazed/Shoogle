import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

import type { ContentReview } from '../../content';
import type { ComposeDraft } from '../../compose';
import { PLATFORM_LABEL, type Platform } from '../../types';

/**
 * Compose flow pieces. Feature owner: Yash.
 *
 * Built from `@/components/ui` primitives — Card, Text, Badge — and theme
 * tokens only. Nothing here hard-codes a colour, radius or size, and no
 * primitive is forked: the compose screen has to look like the rest of Shoogle,
 * not like a second product wearing its colours.
 *
 * Layout only. These render what they are given, derive nothing, and never
 * decide whether a platform is usable — `compose/state.ts` does that, where it
 * can be tested.
 */

/* -------------------------------------------------------------------------- */
/* Platform identity                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One accent per platform, so a card, a chip and an error all read as the same
 * platform at a glance. Accents come from the shared palette; these are
 * existing module colours, not new ones.
 */
export const PLATFORM_ACCENT: Record<Platform, AccentName> = {
  instagram: 'blue',
  facebook: 'neutral',
  google_business: 'green',
};

export const PLATFORM_ICON: Record<Platform, keyof typeof Ionicons.glyphMap> = {
  instagram: 'logo-instagram',
  facebook: 'logo-facebook',
  google_business: 'storefront-outline',
};

/** What each platform will actually publish, in the owner's terms. */
export const PLATFORM_BLURB: Record<Platform, string> = {
  instagram: 'A caption with hashtags. Needs a photo or video.',
  facebook: 'A Page post. Can go out as words alone.',
  google_business: 'A local post shown in Google Search and Maps.',
};

/* -------------------------------------------------------------------------- */
/* Target chooser                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One selectable platform.
 *
 * Each renders and toggles entirely on its own. There is no "select all", no
 * grouping and no dependency between rows: an owner with Instagram and no
 * Facebook Page picks Instagram and is never told about a Page.
 */
export function TargetOption({
  platform,
  selected,
  note,
  unavailableReason,
  onToggle,
}: {
  platform: Platform;
  selected: boolean;
  /**
   * Platform-scoped information that does NOT block selection — a connection
   * state, typically. Drafting needs no connection; publishing does, and that
   * is a different screen's problem.
   */
  note?: string | null;
  /** Platform-specific and platform-scoped. Never mentions another platform. */
  unavailableReason?: string | null;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const accent = theme.accent(PLATFORM_ACCENT[platform]);
  const blocked = typeof unavailableReason === 'string' && unavailableReason !== '';

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: blocked }}
      accessibilityLabel={PLATFORM_LABEL[platform]}
      accessibilityHint={blocked ? unavailableReason : PLATFORM_BLURB[platform]}
      disabled={blocked}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.option,
        {
          borderRadius: theme.radii.lg,
          borderColor: selected ? accent.fg : theme.colors.border,
          backgroundColor: selected ? accent.bg : theme.colors.card,
          padding: theme.spacing.lg,
          opacity: blocked ? 0.55 : pressed ? 0.9 : 1,
        },
      ]}>
      <View
        style={[
          styles.optionIcon,
          { backgroundColor: accent.bg, borderRadius: theme.radii.md },
        ]}>
        <Ionicons name={PLATFORM_ICON[platform]} size={20} color={accent.fg} />
      </View>

      <View style={styles.optionBody}>
        <Text variant="cardTitle">{PLATFORM_LABEL[platform]}</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {blocked ? unavailableReason : PLATFORM_BLURB[platform]}
        </Text>
        {!blocked && typeof note === 'string' && note !== '' ? (
          <Text variant="caption" tone="muted2" style={{ marginTop: 2 }}>
            {note}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={selected ? accent.fg : theme.colors.muted2}
      />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Draft card                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One platform's draft, with its own status, its own errors and its own
 * actions.
 *
 * Every card is self-contained on purpose. A reader can see at a glance that
 * Facebook failed and Instagram did not, because the two states are never
 * merged into one banner — the same reason `compose/state.ts` keeps a status
 * per platform instead of one for the post.
 */
export function PlatformDraftHeader({
  draft,
  review,
  blocker,
}: {
  draft: ComposeDraft;
  review: ContentReview | null;
  blocker: string | null;
}) {
  const theme = useTheme();
  const accent = theme.accent(PLATFORM_ACCENT[draft.platform]);

  return (
    <View style={styles.draftHeader}>
      <View
        style={[
          styles.optionIcon,
          { backgroundColor: accent.bg, borderRadius: theme.radii.md },
        ]}>
        <Ionicons name={PLATFORM_ICON[draft.platform]} size={18} color={accent.fg} />
      </View>

      <View style={{ flex: 1 }}>
        <Text variant="cardTitle">{PLATFORM_LABEL[draft.platform]}</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {statusLine(draft, review, blocker)}
        </Text>
      </View>

      <DraftBadge draft={draft} blocker={blocker} />
    </View>
  );
}

function DraftBadge({ draft, blocker }: { draft: ComposeDraft; blocker: string | null }) {
  if (draft.status === 'generating') return <Badge label="Writing" accent="neutral" />;
  if (draft.status === 'failed') return <Badge label="Failed" accent="red" />;
  if (draft.text === null) return <Badge label="Empty" accent="neutral" variant="outline" />;
  if (blocker !== null) return <Badge label="Needs work" accent="amber" />;
  // "Ready" means Shoogle found no fault. It does NOT mean the platform will
  // accept it — unchecked rules are listed on the card below.
  return <Badge label="Ready" accent="green" />;
}

function statusLine(
  draft: ComposeDraft,
  review: ContentReview | null,
  blocker: string | null,
): string {
  if (draft.status === 'generating') return 'Writing this one…';
  if (draft.status === 'failed') return draft.error ?? 'Could not write this one.';
  if (blocker !== null) return blocker;
  if (draft.modelId === null && draft.text !== null) return 'Written by you';
  if (draft.edited) return `Written by ${draft.modelId ?? 'a model'}, edited by you`;
  if (draft.modelId !== null) return `Written by ${draft.modelId}`;
  if (review !== null && review.unchecked.length > 0) return 'Ready, with some rules unchecked';
  return 'Nothing written yet';
}

/* -------------------------------------------------------------------------- */
/* Review output                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A platform's validation results.
 *
 * Blocking issues and unchecked rules are rendered SEPARATELY and labelled
 * differently, because they mean different things: one is "this will be
 * rejected", the other is "Shoogle could not confirm this". Collapsing them
 * into a single list of warnings is how "we validated this" becomes a false
 * claim — see `platforms.ts`.
 */
export function ReviewNotes({ review }: { review: ContentReview | null }) {
  const theme = useTheme();
  if (review === null) return null;

  const blocking = review.issues.filter((issue) => issue.blocking);
  const advisory = review.issues.filter((issue) => !issue.blocking);
  if (blocking.length === 0 && advisory.length === 0 && review.unchecked.length === 0) return null;

  return (
    <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      {blocking.map((issue) => (
        <NoteLine key={`b-${issue.code}`} icon="alert-circle" tone="red" text={issue.message} />
      ))}
      {advisory.map((issue) => (
        <NoteLine key={`a-${issue.code}`} icon="information-circle" tone="amber" text={issue.message} />
      ))}
      {review.unchecked.map((message) => (
        <NoteLine key={`u-${message}`} icon="help-circle" tone="muted" text={message} />
      ))}
    </View>
  );
}

function NoteLine({
  icon,
  tone,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'red' | 'amber' | 'muted';
  text: string;
}) {
  const theme = useTheme();
  const color =
    tone === 'red' ? theme.colors.red : tone === 'amber' ? theme.colors.amber : theme.colors.muted2;

  return (
    <View style={styles.note}>
      <Ionicons name={icon} size={15} color={color} style={{ marginTop: 1.5 }} />
      <Text variant="caption" tone={tone === 'muted' ? 'muted2' : tone} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Step progress                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Where the owner is in the flow.
 *
 * A count of real steps, not a percentage: product rule 10 forbids progress
 * theatre, and "step 2 of 3" is a fact while "67%" would be an invention.
 */
export function StepProgress({ index, total }: { index: number; total: number }) {
  const theme = useTheme();
  return (
    <View style={styles.steps} accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            height: 3,
            flex: 1,
            borderRadius: theme.radii.sm,
            backgroundColor: i <= index ? theme.colors.blue : theme.colors.card2,
          }}
        />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty media note                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Says what media is missing and for which platform — never a generic
 * "add media" nag. Facebook and Google publish without it; Instagram does not,
 * and that difference is Meta's rule rather than Shoogle's.
 */
export function MediaNote({ platforms }: { platforms: readonly Platform[] }) {
  const theme = useTheme();
  if (platforms.length === 0) return null;
  const names = platforms.map((platform) => PLATFORM_LABEL[platform]).join(' and ');

  return (
    <Card flat padded style={{ marginTop: theme.spacing.lg }}>
      <View style={styles.note}>
        <Ionicons name="image-outline" size={16} color={theme.colors.muted} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          {names} cannot publish without a photo or video. Facebook and Google Business can.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
  },
  optionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: { flex: 1 },
  draftHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  steps: { flexDirection: 'row', gap: 4 },
});
