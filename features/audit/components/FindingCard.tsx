import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

import { AREA_LABEL, type FixMode, type Severity, type ShoogleFinding } from '../types';

/**
 * One finding, as the owner reads it. Owner: Pranay.
 *
 * The card answers three questions in one glance, in this order:
 *
 *   1. HOW BAD IS IT — severity is a coloured badge plus a coloured edge, first
 *      in the reading order and first in the accessibility order.
 *   2. WHAT DO I DO — `detail` is the plain-English fix, written by the check.
 *   3. WHY ARE YOU TELLING ME THIS — `observation` (what was literally seen)
 *      and `evidence` (every data point the finding rests on) are ALWAYS on
 *      screen, never behind a tap. A recommendation the owner cannot audit is
 *      indistinguishable from an invented one, and this product does not get to
 *      be indistinguishable from that.
 *
 * THE ACTION IS DECIDED BY `fixableByShoogle`, NOT BY WISHFUL THINKING
 * -------------------------------------------------------------------
 * `fixableByShoogle` is true only when the GBP capability matrix confirms
 * Google exposes the write AND `GoogleBusinessProfileProvider` declares a
 * method for it — four checks today (D1, D2 hours; F3, F4 review replies).
 * Those get "Fix this for me", and because no write path is wired yet it must
 * SAY so when pressed rather than pretend (CONTRIBUTING rule 7).
 *
 * Everything else gets "Show me how", which expands guidance the finding
 * genuinely carries. It never gets a fix button: offering one would promise a
 * write that does not exist.
 */

const SEVERITY_ACCENT: Record<Severity, AccentName> = {
  critical: 'red',
  important: 'amber',
  minor: 'neutral',
};

/** Plain English, per §5.4. Nobody running a salon wants to read "P1". */
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Do this first',
  important: 'Important',
  minor: 'Small thing',
};

/** Who actually performs the fix. Drives the copy so nothing over-promises. */
const FIX_MODE_NOTE: Record<FixMode, string> = {
  auto: 'Shoogle does this one for you.',
  assisted: 'Shoogle can do this one for you — you approve it before anything is sent.',
  guided: "You make this change in Google Business Profile. We'll show you where to tap.",
  owner: 'This one is yours to do — it needs something only you can decide.',
};

export interface FindingCardProps {
  finding: ShoogleFinding;
  /**
   * Called by "Fix this for me". Only reachable when `fixableByShoogle` is
   * true. The screen owns saying that the write path is not built yet.
   */
  onFix: (finding: ShoogleFinding) => void;
  testID?: string;
}

export function FindingCard({ finding, onFix, testID }: FindingCardProps) {
  const theme = useTheme();
  const [showGuidance, setShowGuidance] = useState(false);

  const accent = SEVERITY_ACCENT[finding.severity];
  const { fg } = theme.accent(accent);

  return (
    <View
      testID={testID ?? `finding-${finding.checkId}`}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.xl,
          padding: theme.spacing.lg,
          ...theme.elevation.card,
        },
      ]}>
      <View pointerEvents="none" style={[styles.stripe, { backgroundColor: fg }]} />

      <View style={[styles.badges, { gap: theme.spacing.sm }]}>
        <Badge label={SEVERITY_LABEL[finding.severity]} accent={accent} />
        <Badge label={AREA_LABEL[finding.area]} variant="outline" />
      </View>

      <Text variant="cardTitle" style={{ marginTop: theme.spacing.md }}>
        {finding.title}
      </Text>

      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {finding.detail}
      </Text>

      {/* -----------------------------------------------------------------
          Evidence. Always visible — see the header comment.
         ----------------------------------------------------------------- */}
      <View
        style={{
          backgroundColor: theme.colors.card2,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
          marginTop: theme.spacing.md,
        }}>
        <Text variant="label" tone="muted2">
          Why we&apos;re telling you this
        </Text>

        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
          {finding.observation}
        </Text>

        {finding.evidence.map((line) => (
          <View key={line} style={[styles.evidenceRow, { marginTop: theme.spacing.xs }]}>
            <Ionicons
              name="ellipse"
              size={5}
              color={theme.colors.muted2}
              style={{ marginTop: theme.spacing.sm - 1 }}
            />
            <Text variant="caption" tone="muted" style={{ flex: 1, marginLeft: theme.spacing.sm }}>
              {line}
            </Text>
          </View>
        ))}

        {/*
          `confidence` is not decoration. An inferred finding is our reading of
          the data, not a fact Google stated, and the owner is entitled to know
          which one they are looking at before they act on it.
        */}
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
          {finding.confidence === 'observed'
            ? 'Read directly from your listing.'
            : 'Worked out from your listing, not stated by Google — we can be wrong about this one.'}
        </Text>
      </View>

      {/* -----------------------------------------------------------------
          The action. Assisted gets a fix button; everything else gets
          guidance and NEVER a fix button.
         ----------------------------------------------------------------- */}
      <View style={[styles.actions, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
        {finding.fixableByShoogle ? (
          <Button
            label="Fix this for me"
            size="small"
            fullWidth={false}
            onPress={() => onFix(finding)}
            accessibilityLabel={`Fix this for me: ${finding.title}`}
            accessibilityHint="Shoogle prepares the change and you approve it"
            testID={`finding-fix-${finding.checkId}`}
          />
        ) : null}

        <Button
          label={showGuidance ? 'Hide the steps' : 'Show me how'}
          variant="secondary"
          size="small"
          fullWidth={false}
          onPress={() => setShowGuidance((open) => !open)}
          accessibilityLabel={
            showGuidance ? `Hide the steps: ${finding.title}` : `Show me how: ${finding.title}`
          }
          accessibilityHint="Explains who makes this change and how you will know it worked"
          testID={`finding-guide-${finding.checkId}`}
        />
      </View>

      {showGuidance ? (
        <View
          testID={`finding-guidance-${finding.checkId}`}
          style={[
            styles.guidance,
            {
              borderTopColor: theme.colors.border,
              marginTop: theme.spacing.md,
              paddingTop: theme.spacing.md,
            },
          ]}>
          <Text variant="bodyStrong">{FIX_MODE_NOTE[finding.fixMode]}</Text>

          <Text variant="label" tone="muted2" style={{ marginTop: theme.spacing.md }}>
            What should change
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            {finding.leadingIndicator}
          </Text>

          {/*
            §1.1 — every finding carries "how would we know this was wrong?".
            Showing it is not an apology, it is the difference between advice
            and an oracle: the owner can check it and tell us we are wrong.
          */}
          <Text variant="label" tone="muted2" style={{ marginTop: theme.spacing.md }}>
            If we&apos;ve got this wrong
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            {finding.failureCheck}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  evidenceRow: { flexDirection: 'row', alignItems: 'flex-start' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  guidance: { borderTopWidth: StyleSheet.hairlineWidth },
});
