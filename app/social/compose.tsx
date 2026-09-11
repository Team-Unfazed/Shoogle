/**
 * COMPOSE A POST. Route `/social/compose`. Owner: Yash.
 *
 * ==================== WHAT THIS SCREEN DOES NOT DECIDE ======================
 *
 * Almost everything. Target selection, per-platform drafts, validation,
 * blockers and step gating all live in `features/social/compose/state.ts` as a
 * pure reducer, which is why product rule 13 can be asserted in a unit test
 * rather than argued about in a screenshot. This file renders that state and
 * dispatches into it — the same split the Posts tab already uses.
 *
 * ========================= PRODUCT RULE 13 ON SCREEN ========================
 *
 * Each platform is a separate card with its own status, its own error, its own
 * Rewrite button and its own validation notes. There is deliberately no
 * combined banner and no shared spinner: if Facebook's draft fails, Instagram's
 * stays on screen, editable and saveable. Selecting Instagram alone never
 * mentions a Facebook Page.
 *
 * ============================ NOTHING PUBLISHES =============================
 *
 * The only action here writes a `draft` post to a store. No adapter is called,
 * no OAuth happens, and the post's state is literally `'draft'`. Scheduling and
 * publishing are a later milestone behind the publisher seam, which still
 * refuses to act with no adapter wired up.
 *
 * ======================== WHY THE BUSINESS IS A FIXTURE =====================
 *
 * `BusinessProvider.getBusiness()` has no implementation yet, so there is no
 * real business to compose for. The context below is a labelled development
 * fixture and the screen shows the fixture banner — which is also what makes
 * generation possible at all, since the AI guards refuse anything that is not
 * fixture-marked.
 */

import { useMemo } from 'react';
import { View } from 'react-native';

import { Screen, TopBar } from '@/components/shared';
import { Button, Card, Section, Select, Text, Textarea, useToast } from '@/components/ui';
import {
  MediaNote,
  PlatformDraftHeader,
  ReviewNotes,
  StepProgress,
  TargetOption,
} from '@/features/social/components/compose';
import {
  availabilityForAll,
  blockerFor,
  COMPOSE_STEPS,
  contentFor,
  createInMemoryPostStore,
  createSocialGenerator,
  createDevProxyAiProvider,
  draftFor,
  OBJECTIVE_LABEL,
  reviewFor,
  SOCIAL_PLATFORMS,
  STEP_TITLE,
  useCompose,
  type BusinessContext,
  type CaptionLanguage,
  type ContentObjectiveKind,
  type Platform,
} from '@/features/social';
import { noAiProvider, type AiProvider } from '@/features/seo';
import { CAPTION_LANGUAGE_LABEL } from '@/features/social';
import { useRouter } from 'expo-router';

/**
 * Production gets `noAiProvider`, which honestly reports that generation is not
 * built. Development gets the dev-proxy client, which refuses anything that is
 * not fixture data and holds no key — the key lives in the Node proxy on the
 * engineer's machine. There is no configuration in between.
 */
function activeAiProvider(): AiProvider {
  return __DEV__ ? createDevProxyAiProvider() : noAiProvider;
}

/**
 * The business this composes for.
 *
 * Every string is `[FIXTURE]`-marked, which is what lets the generation guards
 * accept it: the free tier may train on what it receives, so nothing unmarked
 * is allowed near it. `offer: null` matters — with no offer recorded, the
 * anti-fabrication guard rejects any draft that mentions a discount.
 */
const FIXTURE_CONTEXT: BusinessContext = {
  businessId: 'fixture-business-0001',
  name: '[FIXTURE] Tilak Road Hair Studio',
  category: 'salon',
  locality: '[FIXTURE] Vashi',
  city: '[FIXTURE] Navi Mumbai',
  services: ['[FIXTURE] haircut', '[FIXTURE] hair colour'],
  keywords: ['[FIXTURE] haircut'],
  audience: null,
  offer: null,
  hours: null,
};

export default function ComposeScreen() {
  const router = useRouter();
  const toast = useToast();

  // One store for the life of the screen. In-memory for this milestone: a
  // durable store is Sunny's, and pretending otherwise would be a false claim
  // about where the owner's draft went.
  const store = useMemo(() => createInMemoryPostStore([]), []);
  const generator = useMemo(() => createSocialGenerator({ ai: activeAiProvider() }), []);

  const compose = useCompose({ context: FIXTURE_CONTEXT, generator, store });
  const { state, dispatch } = compose;

  /*
   * Availability is computed per platform from its own connection — none of
   * which exist yet. It is shown as a NOTE and never as a block: drafting
   * needs no connection, and disabling Instagram because Facebook is
   * unconnected is precisely the coupling rule 13 forbids.
   */
  const availability = useMemo(() => availabilityForAll({}), []);

  const stepIndex = COMPOSE_STEPS.indexOf(state.step);

  const instagramNeedsMedia = state.targets.filter(
    (platform) => platform === 'instagram' && state.media.length === 0,
  );

  const save = () => {
    void compose.saveDraft().then((post) => {
      if (post !== null) toast.show({ message: 'Draft saved on this device.', tone: 'success' });
    });
  };

  return (
    <Screen
      edgeTop
      edgeBottom
      showsFixtureData
      header={<TopBar title="Create post" bordered />}
      footer={
        state.step === 'saved' ? null : (
          <View style={{ gap: 8 }}>
            {compose.blockedReason !== null ? (
              <Text variant="caption" tone="muted" align="center">
                {compose.blockedReason}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {compose.canGoBack ? (
                <Button label="Back" variant="secondary" fullWidth={false} onPress={compose.goBack} />
              ) : null}
              {state.step === 'drafts' ? (
                <Button
                  label="Save draft"
                  onPress={save}
                  loading={compose.saving}
                  disabled={compose.blockedReason !== null}
                  style={{ flex: 1 }}
                />
              ) : (
                <Button
                  label="Continue"
                  onPress={compose.goNext}
                  disabled={compose.blockedReason !== null}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>
        )
      }>
      <StepProgress index={Math.max(stepIndex, 0)} total={COMPOSE_STEPS.length - 1} />

      <Section title={STEP_TITLE[state.step]} first style={{ marginTop: 16 }}>
        {/* ---- Step 1: targets, chosen independently ---------------------- */}
        {state.step === 'targets' ? (
          <View style={{ gap: 10 }}>
            <Text variant="body" tone="muted">
              Pick any combination. Each one is written separately, because the three platforms
              publish genuinely different things.
            </Text>
            {SOCIAL_PLATFORMS.map((platform) => (
              <TargetOption
                key={platform}
                platform={platform}
                selected={state.targets.includes(platform)}
                note={connectionNote(availability[platform].available)}
                onToggle={() => dispatch({ type: 'toggle_target', platform })}
              />
            ))}
          </View>
        ) : null}

        {/* ---- Step 2: the owner's brief ---------------------------------- */}
        {state.step === 'brief' ? (
          <View style={{ gap: 12 }}>
            <Select<ContentObjectiveKind>
              label="What is this for?"
              value={state.objective}
              options={(Object.keys(OBJECTIVE_LABEL) as ContentObjectiveKind[]).map((kind) => ({
                value: kind,
                label: OBJECTIVE_LABEL[kind],
              }))}
              onChange={(objective) => dispatch({ type: 'set_objective', objective })}
            />

            <Textarea
              label="In your own words"
              hint="A sentence is enough. Shoogle writes the rest, and will not invent anything you have not said."
              value={state.brief}
              onChangeText={(brief) => dispatch({ type: 'set_brief', brief })}
              placeholder="quiet weekday mornings, good time for a colour appointment"
            />

            <Select<CaptionLanguage>
              label="Language"
              value={state.language}
              options={(Object.keys(CAPTION_LANGUAGE_LABEL) as CaptionLanguage[]).map((code) => ({
                value: code,
                label: CAPTION_LANGUAGE_LABEL[code],
              }))}
              onChange={(language) => dispatch({ type: 'set_language', language })}
            />
          </View>
        ) : null}

        {/* ---- Step 3: one card per platform, each independent ------------ */}
        {state.step === 'drafts' ? (
          <View style={{ gap: 12 }}>
            <Button
              label={compose.isGenerating ? 'Writing…' : 'Write them for me'}
              variant="ai"
              loading={compose.isGenerating}
              onPress={() => void compose.generateAll()}
            />

            <MediaNote platforms={instagramNeedsMedia} />

            {state.targets.map((platform) => (
              <PlatformDraftEditor
                key={platform}
                platform={platform}
                compose={compose}
              />
            ))}
          </View>
        ) : null}

        {/* ---- Step 4: saved ---------------------------------------------- */}
        {state.step === 'saved' ? (
          <View style={{ gap: 12 }}>
            <Card padded accent="green">
              <Text variant="cardTitle">Draft saved</Text>
              <Text variant="body" tone="muted" style={{ marginTop: 6 }}>
                It is saved on this device only. Shoogle cannot schedule or publish it yet — no
                account is connected, and there is no server to send it from.
              </Text>
            </Card>
            <Button label="Done" onPress={() => router.back()} />
          </View>
        ) : null}
      </Section>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* One platform's editor                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A self-contained card: its own text, its own errors, its own Rewrite.
 *
 * Nothing in here reads another platform's state, which is the screen-level
 * expression of the rule `availabilityFor` enforces by signature.
 */
function PlatformDraftEditor({
  platform,
  compose,
}: {
  platform: Platform;
  compose: ReturnType<typeof useCompose>;
}) {
  const { state, dispatch } = compose;
  const draft = draftFor(state, platform);
  const review = reviewFor(state, platform);
  const blocker = blockerFor(state, platform);
  const built = contentFor(state, platform);

  return (
    <Card padded>
      <PlatformDraftHeader draft={draft} review={review} blocker={blocker} />

      <Textarea
        label="Post text"
        value={draft.text?.body ?? ''}
        onChangeText={(body) => dispatch({ type: 'edit_text', platform, body })}
        placeholder={
          draft.status === 'generating' ? 'Writing…' : 'Write it yourself, or use the button above.'
        }
        disabled={draft.status === 'generating'}
        containerStyle={{ marginTop: 12 }}
        minHeight={110}
      />

      {/* Hashtags exist on Instagram and nowhere else — Meta documents a limit
          for it and neither Facebook nor Google has the concept. */}
      {platform === 'instagram' && draft.text !== null ? (
        <Textarea
          label="Hashtags"
          hint="Instagram takes up to 30. Fewer, more specific tags do more."
          value={draft.text.hashtags.join(' ')}
          onChangeText={(value) =>
            dispatch({
              type: 'edit_hashtags',
              platform,
              hashtags: value.split(/[\s,]+/).filter((tag) => tag !== ''),
            })
          }
          containerStyle={{ marginTop: 10 }}
          minHeight={60}
        />
      ) : null}

      {/* A link is a Facebook field. Instagram captions carry none. */}
      {platform === 'facebook' && draft.platform === 'facebook' ? (
        <Textarea
          label="Link (optional)"
          hint="Facebook renders a preview. Leave it empty for a plain post."
          value={draft.link ?? ''}
          onChangeText={(link) => dispatch({ type: 'set_link', link })}
          containerStyle={{ marginTop: 10 }}
          minHeight={60}
        />
      ) : null}

      <ReviewNotes review={review} />

      {built === null && draft.text !== null ? (
        <Text variant="caption" tone="muted2" style={{ marginTop: 10 }}>
          Nothing to check yet — this post cannot be built until it has what the platform needs.
        </Text>
      ) : null}

      <Button
        label={draft.text === null ? 'Write this one' : 'Rewrite this one'}
        variant="ai"
        size="small"
        loading={draft.status === 'generating'}
        onPress={() => void compose.generateOne(platform)}
        style={{ marginTop: 12 }}
      />
    </Card>
  );
}

function connectionNote(available: boolean): string | null {
  // Drafting works regardless. Saying so is more useful than hiding it, and
  // more honest than implying the post can go out.
  return available ? null : 'Not connected yet — you can still write a draft.';
}
