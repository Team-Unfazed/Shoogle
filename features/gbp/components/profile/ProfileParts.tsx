/**
 * Business-profile view pieces. Owner: Pranay.
 *
 * Layout only — nothing here fetches, and nothing here decides what is true.
 * Every judgement comes in as a value from `fields.ts`, `hoursModel.ts` or
 * `writePlan.ts`, so a screen cannot render a claim these components invented.
 *
 * THE ONE VISUAL RULE THIS FILE ENFORCES
 * --------------------------------------
 * "Not set" and "Unknown" must never look alike. A field Google was asked about
 * and returned nothing for is a MEASUREMENT the owner can act on, and it is
 * drawn in amber with the word "Not set". A field Shoogle never asked about is
 * drawn as `—` with the word "Unknown" and the reason underneath. If those two
 * ever collapse into the same grey row, an owner will be sent to fix something
 * that may already be correct.
 *
 * Everything pressable is at least `control.minTouchTarget` (44) tall and
 * carries an accessible name. No colour, radius, size or spacing is written
 * here as a literal — all of it comes from `@/theme`.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Divider, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

import {
  completenessSentence,
  describeProvenance,
  describeWritePath,
  FIELD_UNKNOWN_COPY,
  writeCoverageSentence,
  type ProfileCompleteness,
  type ProfileFieldView,
  type WriteCoverage,
} from './fields';
import {
  ACCEPTED_NOT_LIVE_NOTE,
  describeEditStatus,
  planSentence,
  QUEUE_EXPLAINER,
  summarisePlan,
  type EditProgress,
  type QueueBudget,
} from './writePlan';

/* -------------------------------------------------------------------------- */
/* Small shared pieces                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A labelled count that never renders a bare number without its noun.
 * Used for the completeness breakdown, where "3" alone would be meaningless.
 */
export function CountChip({
  count,
  noun,
  accent,
  testID,
}: {
  count: number;
  noun: string;
  accent: AccentName;
  testID?: string;
}) {
  const theme = useTheme();
  const { fg, bg } = theme.accent(accent);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${count} ${noun}`}
      style={[
        styles.countChip,
        {
          backgroundColor: bg,
          borderRadius: theme.radii.sm,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
        },
      ]}>
      <Text variant="cardTitle" style={{ color: fg }}>
        {count}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={2} style={{ marginTop: 2 }}>
        {noun}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Completeness                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How complete the profile is — three counts, no score.
 *
 * There is deliberately no ring and no percentage. A percentage would have to
 * decide what the unknown fields are worth, and both available answers are
 * false. See `summariseCompleteness`.
 */
export function CompletenessCard({
  completeness,
  coverage,
  testID,
}: {
  completeness: ProfileCompleteness;
  coverage: WriteCoverage;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <Card testID={testID}>
      <Text variant="label" tone="muted2" accessibilityRole="header">
        Profile completeness
      </Text>
      <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
        {completenessSentence(completeness)}
      </Text>

      <View style={[styles.chipRow, { marginTop: theme.spacing.lg, gap: theme.spacing.sm }]}>
        <CountChip
          count={completeness.filled}
          noun="filled in"
          accent="green"
          testID="completeness-filled"
        />
        <CountChip
          count={completeness.missing}
          noun="empty on Google"
          accent="amber"
          testID="completeness-missing"
        />
        <CountChip
          count={completeness.unknown}
          noun="Shoogle could not check"
          accent="neutral"
          testID="completeness-unknown"
        />
      </View>

      <Divider spacing={theme.spacing.lg} />

      <Text variant="caption" tone="muted" testID="write-coverage-sentence">
        {writeCoverageSentence(coverage)}
      </Text>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* One field                                                                  */
/* -------------------------------------------------------------------------- */

function ValueLine({ field }: { field: ProfileFieldView }) {
  const theme = useTheme();

  switch (field.value.kind) {
    case 'present':
      return (
        <View>
          <Text variant="bodyStrong" numberOfLines={3}>
            {field.value.display}
          </Text>
          {field.value.detail !== undefined ? (
            <Text variant="caption" tone="muted2" style={{ marginTop: 2 }}>
              {field.value.detail}
            </Text>
          ) : null}
        </View>
      );

    case 'empty':
      // A MEASUREMENT: Google was asked and returned nothing.
      return (
        <View>
          <Text variant="bodyStrong" tone="amber" testID={`field-empty-${field.spec.id}`}>
            Not set
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            Shoogle asked Google for this and Google returned nothing, so it is genuinely empty.
          </Text>
        </View>
      );

    case 'unknown':
      // NOT a measurement. Must not look like the row above.
      return (
        <View>
          <Text
            variant="bodyStrong"
            tone="muted2"
            testID={`field-unknown-${field.spec.id}`}
            style={{ letterSpacing: theme.typography.label.letterSpacing }}>
            — Unknown
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {FIELD_UNKNOWN_COPY[field.value.why]}
          </Text>
        </View>
      );
  }
}

/**
 * One field row, expandable into its evidence.
 *
 * Collapsed it answers "what is there and can you fix it". Expanded it shows
 * where the value came from, the exact `updateMask` path an edit would use, the
 * line of the capability matrix that decides whether Shoogle may write it, and
 * — when it may not — the steps the owner takes instead. Grexa shows the value;
 * this shows the value and the reason anyone should believe it.
 */
export function ProfileFieldCard({
  field,
  onFix,
  testID,
}: {
  field: ProfileFieldView;
  /** Provided only for a field Shoogle can genuinely write. */
  onFix?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const write = describeWritePath(field.writePath);
  const provenance = describeProvenance(field.provenance);

  return (
    <Card testID={testID} padded={false}>
      <Pressable
        testID={`${field.spec.id}-toggle`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${field.spec.label}. ${write.chip}. ${provenance.chip}.`}
        accessibilityHint={expanded ? 'Hides the detail for this field' : 'Shows where this value came from and how it can be changed'}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [
          styles.fieldHead,
          {
            padding: theme.spacing.lg,
            minHeight: theme.control.minTouchTarget,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <View style={styles.fieldHeadText}>
          <View style={[styles.chipRow, { gap: theme.spacing.sm }]}>
            <Text variant="label" tone="muted2">
              {field.spec.label}
            </Text>
          </View>

          <View style={{ marginTop: theme.spacing.sm }}>
            <ValueLine field={field} />
          </View>

          <View style={[styles.chipRow, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
            <Badge label={provenance.chip} accent={provenance.accent} />
            <Badge label={write.chip} accent={write.accent} />
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.colors.muted2}
        />
      </Pressable>

      {expanded ? (
        <View
          testID={`${field.spec.id}-detail`}
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.lg,
          }}>
          <Divider spacing={0} style={{ marginBottom: theme.spacing.lg }} />

          <Text variant="label" tone="muted2">
            Where this came from
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            {provenance.body}
          </Text>

          <Text variant="label" tone="muted2" style={{ marginTop: theme.spacing.lg }}>
            Why it matters
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            {field.spec.whyItMatters}
          </Text>

          <Text variant="label" tone="muted2" style={{ marginTop: theme.spacing.lg }}>
            Can Shoogle change it
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            {write.body}
          </Text>
          <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
            {field.spec.matrixNote}
          </Text>
          <Text
            variant="caption"
            tone="muted2"
            style={{ marginTop: theme.spacing.xs }}
            testID={`${field.spec.id}-mask`}>
            {`Google method: ${field.spec.googleMethod} · updateMask: ${field.spec.wireField}`}
          </Text>

          {field.writePath.kind === 'one_tap' && onFix !== undefined ? (
            <Button
              label={`Fix ${field.spec.label.toLowerCase()}`}
              size="medium"
              onPress={onFix}
              accessibilityHint="Opens the screen where this change is prepared and queued"
              style={{ marginTop: theme.spacing.lg }}
              testID={`${field.spec.id}-fix`}
            />
          ) : (
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text variant="label" tone="muted2">
                What to do instead
              </Text>
              {field.spec.ownerSteps.map((step, index) => (
                <View key={step} style={[styles.step, { marginTop: theme.spacing.sm }]}>
                  <Text variant="caption" tone="muted2" style={{ width: theme.spacing.lg }}>
                    {index + 1}
                  </Text>
                  <Text variant="caption" tone="muted" style={styles.stepText}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Google-initiated edits                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What Google changed behind the owner's back.
 *
 * `locations.getGoogleUpdated` is the single most differentiated read in the
 * whole API family and no competitor surfaces it. Owners are routinely
 * surprised to find their hours or phone number rewritten by Google from a user
 * suggestion or a crawl.
 *
 * The three states are kept apart on purpose: a read that returned an EMPTY
 * diff is a real, reassuring answer; a read that never happened is not, and
 * must never be drawn as reassurance.
 */
export function GoogleChangedCard({
  changedFields,
  pendingFields,
  /** False when `getGoogleUpdated` was never read. Then nothing below is claimed. */
  wasRead,
  testID,
}: {
  changedFields: readonly string[];
  pendingFields: readonly string[];
  wasRead: boolean;
  testID?: string;
}) {
  const theme = useTheme();

  if (!wasRead) {
    return (
      <Card testID={testID} accent="neutral">
        <Text variant="cardTitle">Changes Google made</Text>
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          Shoogle has not been able to ask Google for its own copy of this listing, so it cannot tell
          you whether Google has changed anything. That is not the same as nothing having changed.
        </Text>
      </Card>
    );
  }

  const nothingChanged = changedFields.length === 0 && pendingFields.length === 0;

  return (
    <Card testID={testID} accent={changedFields.length > 0 ? 'red' : 'green'}>
      <Text variant="cardTitle">Changes Google made</Text>

      {nothingChanged ? (
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          Google’s own copy of this listing matches yours. Nothing has been changed behind your back,
          and nothing of yours is waiting to be applied.
        </Text>
      ) : null}

      {changedFields.length > 0 ? (
        <View style={{ marginTop: theme.spacing.sm }} testID="google-changed-list">
          <Text variant="body">
            Google changed {changedFields.length === 1 ? 'one thing' : `${changedFields.length} things`} on
            this listing without asking you.
          </Text>
          {changedFields.map((label) => (
            <View key={label} style={[styles.step, { marginTop: theme.spacing.sm }]}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.colors.red} />
              <Text variant="caption" style={[styles.stepText, { marginLeft: theme.spacing.sm }]}>
                Google changed {label}.
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {pendingFields.length > 0 ? (
        <View style={{ marginTop: theme.spacing.lg }} testID="google-pending-list">
          <Text variant="body">
            {pendingFields.length === 1 ? 'One edit of yours is' : `${pendingFields.length} edits of yours are`}{' '}
            still waiting on Google.
          </Text>
          {pendingFields.map((label) => (
            <View key={label} style={[styles.step, { marginTop: theme.spacing.sm }]}>
              <Ionicons name="time-outline" size={16} color={theme.colors.blue} />
              <Text variant="caption" style={[styles.stepText, { marginLeft: theme.spacing.sm }]}>
                Your change to {label} has not been applied yet, so customers still see the old value.
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The Voice of Merchant state, as a first-class banner rather than an error.
 *
 * For a small Indian business "not verified" is the LIKELIEST state, not the
 * edge case, and it changes what every button on the screen can honestly claim:
 * Google only publishes edits once a profile holds Voice of Merchant.
 */
export function VerificationNotice({
  title,
  body,
  ownerAction,
  writesMayNotReachGoogle,
  onOwnerAction,
  testID,
}: {
  title: string;
  body: string;
  /** Null when there is genuinely nothing the owner can do. Then no button. */
  ownerAction: string | null;
  writesMayNotReachGoogle: boolean;
  onOwnerAction?: () => void;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <Card testID={testID} accent={writesMayNotReachGoogle ? 'amber' : 'green'}>
      <Text variant="cardTitle">{title}</Text>
      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {body}
      </Text>

      {writesMayNotReachGoogle ? (
        <Text variant="caption" tone="amber" style={{ marginTop: theme.spacing.md }} testID="writes-may-not-reach">
          Anything Shoogle sends while the profile is in this state can be accepted by Google and
          still never appear on Search or Maps. Shoogle will say “accepted”, not “live”.
        </Text>
      ) : null}

      {ownerAction !== null && onOwnerAction !== undefined ? (
        <Button
          label={ownerAction}
          variant="secondary"
          size="medium"
          onPress={onOwnerAction}
          style={{ marginTop: theme.spacing.lg }}
          testID="verification-action"
        />
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The write plan                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The queue, with its real state on the outside.
 *
 * `progress` is null before a run: the card then explains what would be queued
 * and what would not, and offers the button. During and after a run every row
 * shows exactly what the provider said. Nothing self-ticks.
 */
export function WritePlanCard({
  title,
  intro,
  actionLabel,
  queueable,
  progress,
  budget,
  running,
  onRun,
  disabledReason,
  emptyReason,
  testID,
}: {
  title: string;
  /** What this plan would do, in the owner's words. Composed by the screen. */
  intro: string;
  actionLabel: string;
  /** Edits that will actually be queued. Zero disables the button. */
  queueable: number;
  progress: readonly EditProgress[] | null;
  budget: QueueBudget;
  running: boolean;
  onRun: () => void;
  /** Set when the button must be disabled, and says why on screen. */
  disabledReason?: string;
  /** Why there is nothing to queue. Shown instead of a silent disabled button. */
  emptyReason: string;
  testID?: string;
}) {
  const theme = useTheme();
  const summary = progress === null ? null : summarisePlan(progress);
  const anyAcceptedNotLive = summary !== null && summary.acceptedNotLive > 0;

  return (
    <Card testID={testID}>
      <Text variant="cardTitle">{title}</Text>

      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {intro}
      </Text>

      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.md }} testID="queue-explainer">
        {QUEUE_EXPLAINER}
      </Text>
      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.xs }} testID="queue-budget">
        {`${budget.slotsRemaining} of ${budget.maxPerWindow} slots free right now${
          budget.pending > 0 ? `, ${budget.pending} waiting` : ''
        }.`}
      </Text>

      {progress !== null && summary !== null ? (
        <View style={{ marginTop: theme.spacing.lg }} testID="plan-progress">
          <Text variant="bodyStrong" testID="plan-sentence">
            {planSentence(summary)}
          </Text>

          {progress.map((entry) => {
            const status = describeEditStatus(entry.status);
            return (
              <View
                key={entry.id}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${entry.label}, ${status.text}`}
                style={[styles.planRow, { marginTop: theme.spacing.md, minHeight: theme.control.minTouchTarget }]}>
                <View style={[styles.planRowText, { marginRight: theme.spacing.sm }]}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {entry.label}
                  </Text>
                  <Text variant="caption" tone="muted2" numberOfLines={1}>
                    {`updateMask: ${entry.updateMask}`}
                  </Text>
                  {entry.status.kind === 'blocked' ? (
                    <Text variant="caption" tone="muted" testID={`plan-blocked-${entry.id}`}>
                      {entry.status.message}
                    </Text>
                  ) : null}
                  {entry.status.kind === 'failed' ? (
                    <Text variant="caption" tone="red" testID={`plan-failed-${entry.id}`}>
                      {entry.status.message}
                    </Text>
                  ) : null}
                </View>
                <Badge label={status.text} accent={status.accent} />
              </View>
            );
          })}

          {anyAcceptedNotLive ? (
            <Text variant="caption" tone="amber" style={{ marginTop: theme.spacing.md }} testID="accepted-not-live">
              {ACCEPTED_NOT_LIVE_NOTE}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Button
        label={running ? 'Sending…' : actionLabel}
        onPress={onRun}
        loading={running}
        disabled={queueable === 0 || disabledReason !== undefined}
        accessibilityHint="Queues the changes Shoogle is able to send and reports what Google says about each"
        style={{ marginTop: theme.spacing.lg }}
        testID="run-plan"
      />

      {disabledReason !== undefined ? (
        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }} testID="run-disabled-reason">
          {disabledReason}
        </Text>
      ) : null}
      {queueable === 0 && disabledReason === undefined ? (
        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }} testID="run-nothing-reason">
          {emptyReason}
        </Text>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

/** A 44pt-minimum row into another screen this feature owns. */
export function ProfileNavRow({
  title,
  subtitle,
  icon,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navRow,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          minHeight: theme.control.minTouchTarget,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Ionicons name={icon} size={20} color={theme.colors.muted} />
      <View style={{ flex: 1, marginLeft: theme.spacing.md, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  countChip: { flex: 1 },
  chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  fieldHead: { flexDirection: 'row', alignItems: 'flex-start' },
  fieldHeadText: { flex: 1, minWidth: 0 },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepText: { flex: 1, minWidth: 0 },
  planRow: { flexDirection: 'row', alignItems: 'center' },
  planRowText: { flex: 1, minWidth: 0 },
  navRow: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
});
