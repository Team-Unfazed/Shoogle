/**
 * "How you look to AI" — the report body of `app/seo/visibility.tsx`.
 * Owner: Pranay.
 *
 * Grexa does not do this, and it costs nothing to do: every statement on this
 * screen is a fact about bytes that came back from the owner's own website,
 * observed with zero credentials and no model. See `features/seo/ai/`.
 *
 * WHAT THIS SCREEN MAY SAY
 * ------------------------
 * Only what `checkAiVisibility` and `observeReadability` actually measured, and
 * only alongside the observation behind it and the date it was made — which is
 * why every claim goes through `EvidenceLine` / `ObservedStamp`, whose props
 * make the evidence non-optional.
 *
 * WHAT IT MAY NOT SAY
 * -------------------
 * - No "AI visibility score". Nothing validates one, so a number is invented
 *   (docs/research/ai-search-visibility.md §6.6). `checksRun` / `checksPassed`
 *   are COUNTS of our own coverage and are labelled as such.
 * - No claim that the business appears in AI Overviews. No API reports it.
 * - No rank. Google publishes none.
 * - No "fix this for me". Every finding here is a change on the owner's own
 *   website, outside anything Shoogle can write to, so each reads as guidance.
 *   `SeoFinding.fixHref` is null throughout; a fix affordance would be a dead
 *   control with a confident label.
 * - Nothing about a check that did not run. Those are named out loud under
 *   "Not checked", because an absent finding must never read as a pass.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { DataStateView } from '@/components/shared';
import { Badge, Card, EmptyState, Section, Text } from '@/components/ui';
import type { DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';
import type { AiVisibilityReport } from '../ai/visibility';
import { CITED_PASSAGE_WORD_BAND, type ReadabilityResult } from '../ai/readability';
import type { SeoFinding } from '../types';
import { EvidenceLine, ObservedStamp, formatIsoDay } from './evidence';

/* -------------------------------------------------------------------------- */
/* View model                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Everything derived from ONE fetch of the owner's homepage. They travel
 * together in a single `DataState` because they share a single failure: if the
 * page could not be read, none of them exist, and a screen that showed half of
 * them would imply the other half passed.
 */
export interface AiVisibilityInspection {
  readonly report: AiVisibilityReport;
  readonly readability: ReadabilityResult;
  /** Owner-facing name of the page that was read, e.g. 'home'. */
  readonly pageLabel: string;
}

const SEVERITY: Readonly<
  Record<SeoFinding['severity'], { label: string; accent: AccentName }>
> = {
  critical: { label: 'Blocks AI assistants', accent: 'red' },
  important: { label: 'Worth fixing', accent: 'amber' },
  minor: { label: 'Minor', accent: 'neutral' },
};

/* -------------------------------------------------------------------------- */
/* One finding                                                                */
/* -------------------------------------------------------------------------- */

export function AiFindingCard({
  finding,
  observedOn,
  testID,
}: {
  finding: SeoFinding;
  /** When the page was read. Findings are only as fresh as the fetch. */
  observedOn: string;
  testID?: string;
}) {
  const theme = useTheme();
  const severity = SEVERITY[finding.severity];

  return (
    <Card testID={testID} style={{ marginBottom: theme.spacing.md }}>
      <Badge label={severity.label} accent={severity.accent} />

      <Text variant="cardTitle" style={{ marginTop: theme.spacing.sm }}>
        {finding.title}
      </Text>

      <Text variant="body" tone="muted" style={{ marginTop: 6 }}>
        {finding.detail}
      </Text>

      {/*
        No fix button. `fixHref` is null on every finding this check produces —
        they are all edits to the owner's own website, which Shoogle does not
        host and cannot change. Saying so is guidance; a button would be a dead
        control wearing a confident label.
      */}
      {finding.fixHref === null ? (
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
          This is a change on your website. Shoogle cannot make it for you.
        </Text>
      ) : null}

      <EvidenceLine
        observation={finding.observation}
        basis={finding.evidenceBasis}
        observedOn={observedOn}
        testID={testID === undefined ? undefined : `${testID}-evidence`}
      />
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Lists of things we could not look at                                       */
/* -------------------------------------------------------------------------- */

function NotCheckedList({ items, testID }: { items: readonly string[]; testID?: string }) {
  const theme = useTheme();

  return (
    <Card testID={testID}>
      <Text variant="body">
        These were not checked. Not checked is not a pass — it means nobody looked, so nothing
        here counts for or against your site.
      </Text>

      <View style={{ marginTop: theme.spacing.md }}>
        {items.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <Ionicons
              name="help-circle-outline"
              size={16}
              color={theme.colors.muted2}
              style={styles.bulletIcon}
            />
            <Text variant="caption" tone="muted" style={styles.bulletText}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The view                                                                   */
/* -------------------------------------------------------------------------- */

export interface AiVisibilityViewProps {
  state: DataState<AiVisibilityInspection>;
  onRetry?: () => void;
}

export function AiVisibilityView({ state, onRetry }: AiVisibilityViewProps) {
  const theme = useTheme();

  return (
    <DataStateView
      testID="visibility-state"
      state={state}
      onRetry={onRetry}
      skeletonLines={8}
      emptyOverride={
        state.status === 'unavailable' ? (
          <View>
            <EmptyState
              testID="visibility-unavailable"
              title="No website to read"
              body={state.message}
              icon="globe-outline"
            />
            <Text
              variant="caption"
              tone="muted2"
              align="center"
              style={{ marginTop: theme.spacing.sm, paddingHorizontal: theme.spacing.lg }}>
              Everything on this screen is read from your own website, so there is nothing to
              check until Shoogle knows its address. Nothing has been assumed in the meantime.
            </Text>
          </View>
        ) : undefined
      }>
      {(inspection) => {
        const { report, readability } = inspection;
        const observedOn = report.fetchedAt;
        const day = formatIsoDay(observedOn);

        return (
          <View>
            {/* ---------------------------------------------------------- */}
            {/* What was read, and when                                    */}
            {/* ---------------------------------------------------------- */}
            <Card testID="visibility-source">
              <Text variant="label" tone="muted2">
                Read from your website
              </Text>
              <Text variant="bodyStrong" numberOfLines={2} style={{ marginTop: 6 }}>
                {report.url}
              </Text>
              {report.pageTitle === null ? null : (
                <Text variant="caption" tone="muted" numberOfLines={2} style={{ marginTop: 2 }}>
                  {report.pageTitle}
                </Text>
              )}
              <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }}>
                {day === null ? 'Observed once.' : `Observed ${day}.`} Everything below describes
                the page as it was at that moment.
              </Text>
            </Card>

            {/* ---------------------------------------------------------- */}
            {/* Coverage counts — deliberately NOT a score                  */}
            {/* ---------------------------------------------------------- */}
            <Card testID="visibility-coverage" style={{ marginTop: theme.spacing.md }}>
              <Text
                accessibilityRole="text"
                accessibilityLabel={`${report.checksPassed} of ${report.checksRun} checks passed. This is a count of checks, not a score.`}
                style={{
                  fontFamily: theme.fontFamily.display,
                  fontSize: 22,
                  letterSpacing: -0.44,
                  color: theme.colors.text,
                }}>
                {`${report.checksPassed} of ${report.checksRun} checks passed`}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
                That is a count of what Shoogle could look at, not a score for your site. There is
                no “AI visibility score” here because nothing measures one — a number would be
                invented.
              </Text>
            </Card>

            {/* ---------------------------------------------------------- */}
            {/* Findings                                                   */}
            {/* ---------------------------------------------------------- */}
            <Section
              title="What an assistant runs into"
              subtitle="Each one shows exactly what was seen on your page.">
              {report.findings.length === 0 ? (
                <Card testID="visibility-no-findings">
                  <Text variant="body">
                    Nothing failed among the checks that ran. That is not the same as “your site is
                    fine” — see what was not checked, below.
                  </Text>
                </Card>
              ) : (
                report.findings.map((finding, index) => (
                  <AiFindingCard
                    key={finding.id}
                    finding={finding}
                    observedOn={observedOn}
                    testID={`ai-finding-${index}`}
                  />
                ))
              )}
            </Section>

            {/* ---------------------------------------------------------- */}
            {/* Readability                                                */}
            {/* ---------------------------------------------------------- */}
            <Section
              title="How readable your page is to a machine"
              subtitle="Observations, not a score. Nothing published validates a readability score against being quoted.">
              {readability.observations.length === 0 ? (
                <Card testID="readability-none">
                  <Text variant="body">
                    Nothing stood out on your {inspection.pageLabel} page among the things that
                    could be measured.
                  </Text>
                </Card>
              ) : (
                readability.observations.map((observation, index) => (
                  <Card
                    key={observation.id}
                    testID={`readability-${index}`}
                    style={{ marginBottom: theme.spacing.md }}>
                    <Text variant="bodyStrong">{observation.observation}</Text>
                    <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
                      {observation.reason}
                    </Text>
                    <ObservedStamp
                      basis={observation.evidenceBasis}
                      observedOn={observedOn}
                      testID={`readability-${index}-stamp`}
                    />
                  </Card>
                ))
              )}

              <Card testID="readability-passage">
                <Text variant="label" tone="muted2">
                  Longest block of text
                </Text>
                <Text variant="bodyStrong" style={{ marginTop: 4 }}>
                  {readability.longestPassageWords === null
                    ? 'Not measured — this page has no paragraphs to measure.'
                    : `${readability.longestPassageWords} words`}
                </Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
                  {`One study associates passages of roughly ${CITED_PASSAGE_WORD_BAND.min}–${CITED_PASSAGE_WORD_BAND.max} words with being quoted more often (SE Ranking). It is a study, not a Google rule, and it is not a target to hit.`}
                </Text>
              </Card>

              {readability.notObserved.length === 0 ? null : (
                <View style={{ marginTop: theme.spacing.md }}>
                  <NotCheckedList items={readability.notObserved} testID="readability-unchecked" />
                </View>
              )}
            </Section>

            {/* ---------------------------------------------------------- */}
            {/* Everything we could not look at                            */}
            {/* ---------------------------------------------------------- */}
            <Section title="Not checked">
              <NotCheckedList items={report.uncheckedAreas} testID="visibility-unchecked" />
            </Section>
          </View>
        );
      }}
    </DataStateView>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocked work                                                               */
/* -------------------------------------------------------------------------- */

interface BlockedItem {
  readonly title: string;
  readonly reason: string;
}

/**
 * The AI-visibility work that is genuinely blocked today, named rather than
 * quietly missing.
 *
 * docs/research/ai-search-visibility.md §7 claims all eight items ship with no
 * credentials. Its own CORRECTIONS block retracts that for three of them, and
 * these are those three. Listing them here is the honest alternative to a
 * disabled button or a "coming soon" badge.
 */
const BLOCKED_WORK: readonly BlockedItem[] = [
  {
    title: 'Checking your name, address and phone against Google',
    reason:
      'Reading Google’s own record of your business needs a Maps Platform billing account, which nobody has set up.',
  },
  {
    title: 'Your live Google rating on this screen',
    reason:
      'Same billing account. Ratings must be read fresh each time and cannot be stored, so there is no way to show one today.',
  },
  {
    title: 'Asking an AI assistant about your business and showing what it said',
    reason:
      'Needs a Shoogle server to hold the model key and to ground the answer in Search and Maps. That server does not exist yet.',
  },
];

export function BlockedWorkCard({ testID }: { testID?: string }) {
  const theme = useTheme();

  return (
    <Card testID={testID}>
      <Badge label="Blocked" accent="neutral" />
      <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
        These would belong on this screen and are not built. They are blocked on things Shoogle
        does not have, not on effort, and none of them is guessed at in the meantime.
      </Text>

      <View style={{ marginTop: theme.spacing.md }}>
        {BLOCKED_WORK.map((item) => (
          <View key={item.title} style={styles.bulletRow}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={theme.colors.muted2}
              style={styles.bulletIcon}
            />
            <View style={styles.bulletText}>
              <Text variant="bodyStrong">{item.title}</Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {item.reason}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  bulletIcon: { marginTop: 2, marginRight: 8 },
  bulletText: { flex: 1, minWidth: 0 },
});
