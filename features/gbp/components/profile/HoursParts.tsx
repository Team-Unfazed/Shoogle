/**
 * Opening-hours view pieces. Owner: Pranay.
 *
 * Layout only. Every fact comes in from `hoursModel.ts`.
 *
 * THE DISTINCTION THIS FILE EXISTS TO PROTECT
 * -------------------------------------------
 * Three different things must never look the same:
 *
 *   "Hours are not set"  Google was asked and returned no regular hours at all.
 *   "Closed"             Hours ARE set, and this day has no opening period.
 *   "Unreadable"         Google sent a period Shoogle could not parse, so the
 *                        table below is short and says so.
 *
 * A week of "Closed" rows drawn for a business whose hours were simply never
 * read would be a fabricated week, and it is the kind of fabrication an owner
 * would never catch.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Divider, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import {
  COMPLETE_CALENDAR_NOTE,
  describeDay,
  describeSpecialHourEntry,
  PARTIAL_CALENDAR_CAVEAT,
  type FestivalPromptSet,
  type RegularHoursReading,
  type SpecialHoursReading,
} from './hoursModel';

/* -------------------------------------------------------------------------- */
/* Regular hours                                                              */
/* -------------------------------------------------------------------------- */

export function RegularHoursCard({
  reading,
  testID,
}: {
  reading: RegularHoursReading;
  testID?: string;
}) {
  const theme = useTheme();

  if (reading.kind === 'not_set') {
    return (
      <Card testID={testID} accent="amber">
        <Text variant="cardTitle">No opening hours on Google</Text>
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          Shoogle asked Google for your opening hours and Google returned none. Without them Google
          cannot show “Open now”, and a customer deciding between you and the next shop has nothing
          to go on.
        </Text>
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.md }}>
          This is not the same as being closed every day. Google simply holds no hours for this
          listing.
        </Text>
      </Card>
    );
  }

  return (
    <Card testID={testID} padded={false}>
      <View style={{ padding: theme.spacing.lg }}>
        <Text variant="label" tone="muted2" accessibilityRole="header">
          Opening hours on Google
        </Text>
      </View>

      {reading.days.map((day, index) => (
        <View key={day.day}>
          {index > 0 ? <Divider spacing={0} inset={theme.spacing.lg} /> : null}
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${day.label}, ${describeDay(day)}`}
            style={[
              styles.dayRow,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.md,
                minHeight: theme.control.minTouchTarget,
              },
            ]}>
            <Text variant="bodyStrong" style={styles.dayLabel}>
              {day.label}
            </Text>
            <Text
              variant="body"
              tone={day.slots.length === 0 ? 'muted' : 'default'}
              align="right"
              style={styles.dayValue}>
              {describeDay(day)}
            </Text>
          </View>
        </View>
      ))}

      {reading.unreadablePeriods > 0 ? (
        <View style={{ padding: theme.spacing.lg }} testID="hours-unreadable">
          <Text variant="caption" tone="red">
            {`Google sent ${reading.unreadablePeriods} opening period${
              reading.unreadablePeriods === 1 ? '' : 's'
            } that Shoogle could not read, so this table is incomplete. The days above are right; there may be more.`}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Special hours                                                              */
/* -------------------------------------------------------------------------- */

export function SpecialHoursCard({
  reading,
  testID,
}: {
  reading: SpecialHoursReading;
  testID?: string;
}) {
  const theme = useTheme();

  if (reading.kind === 'none_set') {
    return (
      <Card testID={testID} accent="amber">
        <Text variant="cardTitle">No holiday hours set</Text>
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          Shoogle asked Google and there are no special dates on this listing. Until one is set,
          Google keeps showing your normal hours on every festival and every holiday.
        </Text>
      </Card>
    );
  }

  return (
    <Card testID={testID} padded={false}>
      <View style={{ padding: theme.spacing.lg }}>
        <Text variant="label" tone="muted2" accessibilityRole="header">
          Holiday hours on Google
        </Text>
      </View>

      {reading.entries.map((entry, index) => (
        <View key={`${entry.startDate}-${entry.endDate}-${index}`}>
          {index > 0 ? <Divider spacing={0} inset={theme.spacing.lg} /> : null}
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${entry.startDate}${
              entry.endDate === entry.startDate ? '' : ` to ${entry.endDate}`
            }, ${describeSpecialHourEntry(entry)}`}
            style={[
              styles.dayRow,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.md,
                minHeight: theme.control.minTouchTarget,
              },
            ]}>
            <View style={styles.dayLabel}>
              <Text variant="bodyStrong">{entry.startDate}</Text>
              {entry.endDate !== entry.startDate ? (
                <Text variant="caption" tone="muted2">
                  {`to ${entry.endDate}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.dayValue}>
              <Badge
                label={entry.closed ? 'Closed' : 'Special hours'}
                accent={entry.closed ? 'red' : 'blue'}
                style={styles.selfEnd}
              />
              <Text variant="caption" tone="muted" align="right" style={{ marginTop: 2 }}>
                {describeSpecialHourEntry(entry)}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {reading.unreadableEntries > 0 ? (
        <View style={{ padding: theme.spacing.lg }} testID="special-hours-unreadable">
          <Text variant="caption" tone="red">
            {`Google sent ${reading.unreadableEntries} holiday date${
              reading.unreadableEntries === 1 ? '' : 's'
            } that Shoogle could not read. One of them may be a date you care about, so treat this list as incomplete.`}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Festivals                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Upcoming festival closures.
 *
 * The caveat at the bottom is not boilerplate — it is the load-bearing part of
 * this card. `INDIA_HOLIDAY_CALENDAR` only carries fixed-date holidays, so an
 * empty list here means "Shoogle does not know", and a salon owner who reads it
 * as "nothing coming" three days before Ganpati is worse off than if the card
 * did not exist.
 */
export function FestivalPromptsCard({
  promptSet,
  onSetHoliday,
  testID,
}: {
  promptSet: FestivalPromptSet;
  /** Opens the guidance for setting a holiday date. Never claims to do it. */
  onSetHoliday: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const uncovered = promptSet.prompts.filter((prompt) => prompt.coverage.kind !== 'covered').length;

  return (
    <Card testID={testID} accent={uncovered > 0 ? 'amber' : 'green'}>
      <Text variant="cardTitle">Festivals coming up</Text>
      <Text variant="caption" tone="muted2" style={{ marginTop: 2 }}>
        {`Checked ${promptSet.windowFrom} to ${promptSet.windowTo} · calendar ${promptSet.calendarVersion}`}
      </Text>

      {promptSet.prompts.length === 0 ? (
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.md }} testID="festivals-empty">
          Shoogle has no fixed-date holiday in this window.
        </Text>
      ) : (
        <View style={{ marginTop: theme.spacing.md }} testID="festival-list">
          {promptSet.prompts.map((prompt) => {
            const covered = prompt.coverage.kind;
            const status =
              covered === 'covered'
                ? { label: 'Hours set', accent: 'green' as const }
                : covered === 'not_covered'
                  ? { label: 'Nothing set', accent: 'amber' as const }
                  : { label: 'Unknown', accent: 'neutral' as const };

            return (
              <View
                key={`${prompt.holiday.date}-${prompt.holiday.name}`}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${prompt.holiday.name}, ${prompt.holiday.date}, ${status.label}`}
                style={[
                  styles.dayRow,
                  { paddingVertical: theme.spacing.sm, minHeight: theme.control.minTouchTarget },
                ]}>
                <View style={styles.dayLabel}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {prompt.holiday.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {`${prompt.holiday.date} · ${
                      prompt.holiday.closureLikelihood === 'most_close'
                        ? 'most shops close'
                        : 'some shops close'
                    }`}
                  </Text>
                  {covered === 'unknown' ? (
                    <Text variant="caption" tone="muted2">
                      Some of your holiday dates could not be read, so Shoogle cannot say whether this
                      one is covered.
                    </Text>
                  ) : null}
                </View>
                <Badge label={status.label} accent={status.accent} style={styles.selfEnd} />
              </View>
            );
          })}
        </View>
      )}

      <Text
        variant="caption"
        tone={promptSet.windowFullyCovered ? 'muted' : 'amber'}
        style={{ marginTop: theme.spacing.lg }}
        testID="calendar-caveat">
        {promptSet.windowFullyCovered ? COMPLETE_CALENDAR_NOTE : PARTIAL_CALENDAR_CAVEAT}
      </Text>

      <Button
        label="How to set a holiday date"
        variant="secondary"
        size="medium"
        onPress={onSetHoliday}
        accessibilityHint="Shows the steps for adding special hours on Google"
        style={{ marginTop: theme.spacing.lg }}
        testID="set-holiday"
      />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Guidance                                                                   */
/* -------------------------------------------------------------------------- */

/** Numbered steps, shown when Shoogle cannot perform the change itself. */
export function GuidedSteps({
  title,
  steps,
  note,
  testID,
}: {
  title: string;
  steps: readonly string[];
  note?: string;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <Card testID={testID} flat>
      <Text variant="label" tone="muted2">
        {title}
      </Text>
      {steps.map((step, index) => (
        <View key={step} style={[styles.step, { marginTop: theme.spacing.sm }]}>
          <Text variant="caption" tone="muted2" style={{ width: theme.spacing.lg }}>
            {index + 1}
          </Text>
          <Text variant="caption" tone="muted" style={styles.stepText}>
            {step}
          </Text>
        </View>
      ))}
      {note !== undefined ? (
        <View style={[styles.step, { marginTop: theme.spacing.md }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.muted2} />
          <Text variant="caption" tone="muted2" style={[styles.stepText, { marginLeft: theme.spacing.sm }]}>
            {note}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center' },
  dayLabel: { flex: 1, minWidth: 0 },
  dayValue: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  selfEnd: { alignSelf: 'flex-end' },
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  stepText: { flex: 1, minWidth: 0 },
});
