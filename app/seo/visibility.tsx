/**
 * HOW YOU LOOK TO AI. Route: `/seo/visibility`. Feature owner: Pranay.
 *
 * An Indian salon owner is increasingly found through an AI answer rather than
 * only through the map pack. Grexa does not address that at all, which makes
 * this the strongest differentiator available — and, unusually, the cheapest:
 * every measurement on this screen is read from the owner's own website with
 * zero credentials, no billing account and no model.
 *
 * WHAT IS ON THIS SCREEN, AND WHY ONLY THIS
 * -----------------------------------------
 * docs/research/ai-search-visibility.md §7 claims eight shippable items. Its
 * own CORRECTIONS block retracts that for three of them. Only the 7A items are
 * here:
 *
 *   §7.1 the AI visibility check      -> features/seo/ai/visibility.ts
 *   §7.2 schema generation            -> features/seo/ai/schema.ts
 *   §7.4 the India directory checklist-> features/seo/ai/directories.ts
 *   §7.7 readability observations     -> features/seo/ai/readability.ts
 *
 * The 7B items — the NAP consistency check, the live Google rating row and
 * "Ask an AI" — need a Maps Platform billing account or a Supabase edge
 * function that nobody has built. They are rendered as BLOCKED, with the reason,
 * rather than stubbed, disabled or quietly left out.
 *
 * THE RULES THIS SCREEN IS BUILT AROUND
 * -------------------------------------
 * - Every observation carries what was seen and the date it was seen. That is
 *   enforced by `EvidenceLine` / `ObservedStamp`, whose props make it
 *   impossible to render a claim without its evidence.
 * - Anything not measurable renders as unavailable with a reason. Never
 *   guessed, never scored as zero, never silently absent.
 * - There is no "AI visibility score". Nothing validates one, so a number would
 *   be invented. Coverage is reported as counts of checks.
 * - The model-backed part goes through `AiProvider`, whose development client
 *   is `__DEV__`-gated and refuses anything that is not fixture data. When it
 *   refuses, the card says so and the control is disabled with that reason —
 *   never a spinner waiting on a request that was never allowed to start.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * A labelled fixture page snapshot in development, under the fixture banner.
 * Otherwise every card reports `not_connected`, because Shoogle does not know
 * the owner's website address until a profile is linked. There is no third path.
 */

import { useState } from 'react';

import { Screen, TopBar } from '@/components/shared';
import { Section, Text } from '@/components/ui';
import {
  buildLocalBusinessSchema,
  checkAiVisibility,
  geminiAiProvider,
  noAiProvider,
  observeReadability,
  type AiProvider,
  type LocalBusinessSchemaResult,
} from '@/features/seo';
import {
  AiDraftCard,
  AiVisibilityView,
  BlockedWorkCard,
  DirectoryChecklistCard,
  SchemaCard,
  type AiVisibilityInspection,
} from '@/features/seo/components';
import { getSeoFixtures, seoFixtureState } from '@/fixtures/seo';
import { unavailable, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';
import type { BusinessCategory } from '@/types/domain';

/** The page we read. One page, named, so the copy can say which. */
const PAGE_LABEL = 'home';

const NO_WEBSITE_KNOWN =
  'Shoogle does not know your website address yet. It comes from your Google Business Profile, ' +
  'which is not connected, so there is nothing to read.';

const NO_BUSINESS_DETAILS =
  'Shoogle does not hold your address, hours or phone number yet, so there is nothing to turn into ' +
  'machine-readable markup.';

const NO_CATEGORY =
  'Shoogle does not know what kind of business this is yet, and the right directories depend on ' +
  'that. Guessing would send you to the wrong ones.';

/**
 * Production gets `noAiProvider`, which honestly reports that generation is not
 * built. Development gets the fixture-only client, which refuses anything else.
 * There is no configuration in between.
 */
function activeAiProvider(): AiProvider {
  return __DEV__ ? geminiAiProvider : noAiProvider;
}

/* -------------------------------------------------------------------------- */
/* Gated reads                                                                */
/* -------------------------------------------------------------------------- */

/*
 * Each of these is called once, through a `useState` lazy initialiser. They are
 * deliberately NOT `useMemo`: `getSeoFixtures()` reads the environment, so the
 * React Compiler cannot prove the call is pure and refuses to preserve the
 * memoisation. A lazy initialiser says what is actually meant — read this once,
 * at mount — and keeps the value stable for the life of the screen.
 */

/** Everything derived from one read of the owner's page. */
function readInspection(): DataState<AiVisibilityInspection> {
  // Gated accessor: null outside development, so a release build cannot reach
  // fixture content at all.
  const fixtures = getSeoFixtures();
  if (fixtures === null) return unavailable('not_connected', NO_WEBSITE_KNOWN);

  const snapshot = fixtures.pageSnapshot;
  return seoFixtureState<AiVisibilityInspection>({
    report: checkAiVisibility(snapshot),
    readability: observeReadability({ html: snapshot.html, pageLabel: PAGE_LABEL }),
    pageLabel: PAGE_LABEL,
  });
}

function readSchema(): DataState<LocalBusinessSchemaResult> {
  const fixtures = getSeoFixtures();
  if (fixtures === null) return unavailable('not_connected', NO_BUSINESS_DETAILS);
  return seoFixtureState(buildLocalBusinessSchema(fixtures.schemaInput));
}

function readCategory(): DataState<BusinessCategory> {
  const fixtures = getSeoFixtures();
  if (fixtures === null) return unavailable('not_connected', NO_CATEGORY);
  return seoFixtureState(fixtures.schemaInput.category);
}

/** Fixture material for the model, or null. Real business text never goes here. */
function readAiPayload(): string | null {
  return getSeoFixtures()?.aiPromptPayload ?? null;
}

export default function VisibilityScreen() {
  const theme = useTheme();

  const [inspection] = useState<DataState<AiVisibilityInspection>>(readInspection);
  const [schema] = useState<DataState<LocalBusinessSchemaResult>>(readSchema);
  const [category] = useState<DataState<BusinessCategory>>(readCategory);
  const [aiPayload] = useState<string | null>(readAiPayload);

  const showsFixtureData = inspection.status === 'ready' && inspection.isFixture === true;

  return (
    <Screen
      testID="visibility-screen"
      header={<TopBar />}
      edgeBottom
      showsFixtureData={showsFixtureData}>
      <Text variant="screenTitle">How you look to AI</Text>
      <Text
        variant="caption"
        tone="muted"
        style={{ marginTop: 6, marginBottom: theme.spacing.lg }}>
        What an AI assistant can actually read about you, checked against your own website. Every
        line below says what was seen and when. Nothing here is a rank and nothing here is a score
        — neither of those can be measured, so neither is shown.
      </Text>

      <AiVisibilityView state={inspection} />

      <Section
        title="Machine-readable business details"
        subtitle="The markup that lets an assistant read your hours and address without guessing.">
        <SchemaCard state={schema} testID="visibility-schema" />
      </Section>

      <Section
        title="Where assistants can read about you"
        subtitle="We cannot read these directories, so this is your answer, not ours.">
        <DirectoryChecklistCard state={category} testID="visibility-directories" />
      </Section>

      <Section
        title="Written by a model"
        subtitle="The only part of this screen a model touches. Everything above is a measurement.">
        <AiDraftCard
          provider={activeAiProvider()}
          payload={aiPayload}
          testID="visibility-ai-draft"
        />
      </Section>

      <Section
        title="Blocked, and why"
        subtitle="Named rather than missing, so nobody plans around work that cannot start.">
        <BlockedWorkCard testID="visibility-blocked" />
      </Section>
    </Screen>
  );
}
