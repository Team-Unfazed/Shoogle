import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Screen, TopBar } from '@/components/shared';
import { Button, Section, Text, useToast } from '@/components/ui';
import type { AuditRun, ShoogleFinding } from '@/features/audit';
import {
  AuditNotRun,
  AuditSkeleton,
  CoverageByArea,
  FindingsList,
  InsufficientDataPanel,
  ScoreHero,
  UncheckedAreasCard,
} from '@/features/audit/components';
import { getAuditFixtures, type AuditFixtures } from '@/fixtures/audit';
import { getProvider } from '@/lib/providers';
import type { ConnectionInfo } from '@/lib/providers/types';
import { loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * THE AUDIT REPORT. Route `/seo/audit`. Owner: Pranay.
 *
 * This screen answers "how do I look online?" and turns the answer into things
 * to do. It is the only surface where any of the 34 checks becomes visible.
 *
 * FOUR STATES, AND THEY MUST LOOK LIKE FOUR DIFFERENT THINGS
 * ----------------------------------------------------------
 *  1. SCORED             all four gates passed, so there is an honest number.
 *  2. INSUFFICIENT DATA  the gates did not pass. NOT an error and NOT an empty
 *                        screen — it is the most common state today and a
 *                        genuine answer: here is what we measured, here is what
 *                        we could not, here is which test the result failed.
 *                        Every finding from the checks that DID run is still
 *                        listed, because a missing score must never suppress a
 *                        real problem (§3.3).
 *  3. NOT CONNECTED      no Google listing linked, so nothing was measured at
 *                        all. No score, no findings, no zeros.
 *  4. LOADING            skeletons. Never a zero, never a percentage.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * There is no live Google Business Profile pipeline yet, and this screen does
 * not pretend otherwise. It asks the provider registry, which answers
 * `not_connected` until `features/gbp` registers a real implementation — so the
 * honest production path today is state 3.
 *
 * In development with `EXPO_PUBLIC_ENABLE_FIXTURES=1`, `getAuditFixtures()`
 * feeds the REAL engine two invented input sets and returns the two runs it
 * produces. That is what makes states 1 and 2 reachable for review without
 * hand-writing a report, and every pixel of it sits under the fixture banner
 * that `showsFixtureData` pins to the top.
 *
 * NEVER ON THIS SCREEN: a search rank position. Google publishes none through
 * any API, so there is no honest number to render and no check produces one.
 */

/** Which fixture run the development switch is showing. */
type FixtureView = 'scored' | 'insufficient';

type AuditSource =
  | { kind: 'loading' }
  /** Nothing has been measured. `notConnected` distinguishes the two reasons. */
  | { kind: 'not_run'; notConnected: boolean; message: string }
  | { kind: 'run'; run: AuditRun; isFixture: boolean };

export default function AuditScreen() {
  const theme = useTheme();
  const toast = useToast();

  // Gated accessor: null outside development, so a release build cannot reach
  // fixture content at all. Held in state so pull-to-refresh can re-run the
  // engine rather than replaying a memoised result.
  const [fixtures, setFixtures] = useState<AuditFixtures | null>(() => getAuditFixtures());
  const [fixtureView, setFixtureView] = useState<FixtureView>('scored');
  const [connection, setConnection] = useState<DataState<ConnectionInfo>>(loading());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (fixtures !== null) return;
    let cancelled = false;
    void getProvider('google_business')
      .getConnection()
      .then((next) => {
        if (!cancelled) setConnection(next);
      });
    return () => {
      cancelled = true;
    };
  }, [fixtures]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    const next = getAuditFixtures();
    setFixtures(next);
    if (next !== null) {
      // The engine is pure and synchronous, so this genuinely re-ran. There is
      // nothing to wait for and no progress to theatre about.
      setRefreshing(false);
      return;
    }
    void getProvider('google_business')
      .getConnection()
      .then((state) => {
        setConnection(state);
        setRefreshing(false);
      });
  }, []);

  const notBuilt = useCallback(
    (message: string) => () => toast.show({ message, tone: 'neutral', durationMs: 4000 }),
    [toast],
  );

  const handleFix = useCallback(
    (finding: ShoogleFinding) => {
      // CONTRIBUTING rule 7. `fixableByShoogle` says Google exposes the write
      // and the provider contract declares a method — it does NOT say anyone
      // has wired the call yet. Saying so is the only honest response.
      toast.show({
        message: `Fixing "${finding.title}" for you is not built yet. No change has been sent to Google.`,
        tone: 'neutral',
        durationMs: 5000,
      });
    },
    [toast],
  );

  const source = resolveSource(fixtures, fixtureView, connection);

  return (
    <Screen
      testID="audit-screen"
      header={<TopBar title="Profile audit" />}
      showsFixtureData={source.kind === 'run' && source.isFixture}
      edgeBottom
      refreshing={refreshing}
      onRefresh={handleRefresh}>
      <Text variant="screenTitle" accessibilityRole="header">
        How you look online
      </Text>
      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.xs }}>
        What Shoogle can see about your business on Google, and what to do about it.
      </Text>

      {/*
        Development-only switch between the two fixture runs. It is a real
        control with a real implementation — both options render a run the
        engine actually produced — and it is unreachable outside development,
        because `getAuditFixtures()` returns null there.
      */}
      {fixtures !== null ? (
        <View testID="fixture-view-switch" style={{ marginTop: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button
              label="Scored"
              variant={fixtureView === 'scored' ? 'primary' : 'secondary'}
              size="small"
              onPress={() => setFixtureView('scored')}
              accessibilityLabel="Preview the scored fixture run"
              style={{ flex: 1 }}
              testID="fixture-view-scored"
            />
            <Button
              label="Not enough data"
              variant={fixtureView === 'insufficient' ? 'primary' : 'secondary'}
              size="small"
              onPress={() => setFixtureView('insufficient')}
              accessibilityLabel="Preview the not-enough-data fixture run"
              style={{ flex: 1 }}
              testID="fixture-view-insufficient"
            />
          </View>
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            Development switch. Both runs come from the real engine, fed invented data.
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: theme.spacing.xl, gap: theme.layout.cardGap }}>
        {source.kind === 'loading' ? <AuditSkeleton /> : null}

        {source.kind === 'not_run' ? (
          <AuditNotRun
            notConnected={source.notConnected}
            message={source.message}
            onPrimaryAction={notBuilt(
              source.notConnected
                ? 'Connecting Google Business Profile is not built yet.'
                : 'Reading your Google listing is not built yet.',
            )}
          />
        ) : null}

        {source.kind === 'run' ? <AuditReportBody run={source.run} onFix={handleFix} /> : null}
      </View>
    </Screen>
  );
}

/**
 * The two states that have a run behind them.
 *
 * The difference between them is the header and NOTHING ELSE: unchecked areas,
 * findings and coverage render identically whether or not a number came out.
 * That is the point — the score is one output of the audit, not its purpose.
 */
function AuditReportBody({
  run,
  onFix,
}: {
  run: AuditRun;
  onFix: (finding: ShoogleFinding) => void;
}) {
  const theme = useTheme();
  const { report, score } = run;

  return (
    <>
      {report.status === 'ready' ? (
        <ScoreHero
          score={report.value.score}
          uncheckedCount={run.uncheckedCount}
          ranCount={score.ranCount}
          applicableCount={score.applicableCount}
        />
      ) : (
        <InsufficientDataPanel
          message={reportMessage(report)}
          gates={score.gates}
          uncheckedCount={run.uncheckedCount}
        />
      )}

      {/*
        Directly under the header, before the findings. An owner deserves to
        know the audit was partial before they read a word of its conclusions.
      */}
      <UncheckedAreasCard areas={run.uncheckedAreas} count={run.uncheckedCount} />

      <Section
        title="What to do first"
        subtitle={
          run.findings.length > 0
            ? 'Ordered by what is costing you customers today, not by what is easiest.'
            : undefined
        }>
        <FindingsList
          findings={run.findings}
          onFix={onFix}
          uncheckedCount={run.uncheckedCount}
        />
      </Section>

      <Section
        title="What we could measure"
        subtitle="Coverage by area. An area we could not read is left out of the score, not scored as zero.">
        <CoverageByArea areas={score.areas} />

        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.lg }}>
          {/*
            No rank position is shown anywhere on this screen. Google publishes
            none through any API, so there is no honest number to put here.
          */}
          Shoogle measures your profile, not your position in search results — Google does not
          publish rankings to anyone.
        </Text>
      </Section>
    </>
  );
}

/**
 * Decides which of the four states is true.
 *
 * Note what is NOT here: any branch that turns a missing connection into an
 * empty report, or a failed read into a zero. Each input maps to exactly one
 * honest statement.
 */
function resolveSource(
  fixtures: AuditFixtures | null,
  fixtureView: FixtureView,
  connection: DataState<ConnectionInfo>,
): AuditSource {
  if (fixtures !== null) {
    return {
      kind: 'run',
      run: fixtureView === 'scored' ? fixtures.scored : fixtures.unconnected,
      isFixture: true,
    };
  }

  switch (connection.status) {
    case 'loading':
      return { kind: 'loading' };
    case 'ready':
      return connection.value.status === 'connected'
        ? // Linked, but no read has happened — `features/gbp` supplies the
          // observations and nothing calls it yet. Saying "not connected" here
          // would be a false statement about the owner's account.
          { kind: 'not_run', notConnected: false, message: '' }
        : {
            kind: 'not_run',
            notConnected: true,
            message: `Shoogle's access to your Google listing is ${connection.value.status}.`,
          };
    case 'unavailable':
    case 'error':
      return { kind: 'not_run', notConnected: true, message: connection.message };
  }
}

/**
 * The engine's own sentence for a missing score, used verbatim.
 *
 * The fallback exists only for exhaustiveness: `runAuditEngine` returns either
 * `ready` or `unavailable('insufficient_data', …)`, never `loading` or `error`.
 * It must still never invent a number, so it does not.
 */
function reportMessage(report: AuditRun['report']): string {
  if (report.status === 'unavailable' || report.status === 'error') return report.message;
  return 'There is not enough measured yet to score your profile honestly.';
}
