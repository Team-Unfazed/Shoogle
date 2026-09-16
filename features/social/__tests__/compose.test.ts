import {
  advanceBlockedReason,
  blockerFor,
  COMPOSE_STEPS,
  composeReducer,
  composedContent,
  contentFor,
  draftFor,
  initialComposeState,
  nextStep,
  previousStep,
  reviewFor,
  toDraftPost,
  type Caption,
  type ComposeEvent,
  type ComposeState,
  type MediaAsset,
} from '../index';

/**
 * THE COMPOSE FLOW.
 *
 * Two things are under test:
 *
 *   1. PRODUCT RULE 13, at the compose layer. Every platform has its own draft,
 *      its own status and its own errors, so no platform can disturb another.
 *      These are the tests that would fail if someone "simplified" the per
 *      platform map into one shared draft with a shared status.
 *
 *   2. The step machine — what gates each step, and why a disabled button is
 *      disabled.
 */

const generated = (body: string, model = 'fake-model-1'): Caption => ({
  body,
  hashtags: [],
  language: 'en',
  origin: 'generated',
  generatedBy: model,
});

function image(id = 'm1'): MediaAsset {
  return {
    id,
    kind: 'image',
    format: 'jpeg',
    uri: 'https://example.invalid/m1.jpg',
    width: 1080,
    height: 1350,
    byteSize: 400_000,
    durationSeconds: null,
    altText: null,
  };
}

/** Apply a list of events in order, from the initial state. */
function run(...events: ComposeEvent[]): ComposeState {
  return events.reduce(composeReducer, initialComposeState());
}

const GOOD = 'Weekday mornings are the quietest time here. There is room to talk it through.';

/* ========================================================================== */
/* 1. Target independence                                                     */
/* ========================================================================== */

describe('targets are selected independently', () => {
  it('starts with nothing selected, so no platform is a default', () => {
    expect(initialComposeState().targets).toEqual([]);
  });

  it('allows Instagram alone', () => {
    const state = run({ type: 'toggle_target', platform: 'instagram' });
    expect(state.targets).toEqual(['instagram']);
  });

  it('allows Facebook alone', () => {
    const state = run({ type: 'toggle_target', platform: 'facebook' });
    expect(state.targets).toEqual(['facebook']);
  });

  it('allows Google Business alone', () => {
    const state = run({ type: 'toggle_target', platform: 'google_business' });
    expect(state.targets).toEqual(['google_business']);
  });

  it('allows Instagram and Google Business with no Facebook at all', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'toggle_target', platform: 'google_business' },
    );
    expect(state.targets).toEqual(['instagram', 'google_business']);
    expect(state.targets).not.toContain('facebook');
  });

  it('keeps a canonical order however they are picked', () => {
    const a = run(
      { type: 'toggle_target', platform: 'google_business' },
      { type: 'toggle_target', platform: 'instagram' },
    );
    expect(a.targets).toEqual(['instagram', 'google_business']);
  });

  it('deselecting one leaves the others untouched', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'toggle_target', platform: 'google_business' },
      { type: 'toggle_target', platform: 'facebook' },
    );
    expect(state.targets).toEqual(['instagram', 'google_business']);
  });

  /**
   * Deselecting must not DESTROY the other platform's work either — that would
   * be a way for one platform to damage another, which is the failure rule 13
   * is about.
   */
  it('deselecting Facebook does not disturb the Instagram draft', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'generation_succeeded', platform: 'instagram', text: generated(GOOD), modelId: 'm' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated('FB copy'), modelId: 'm' },
      { type: 'toggle_target', platform: 'facebook' },
    );

    expect(draftFor(state, 'instagram').text?.body).toBe(GOOD);
    expect(draftFor(state, 'instagram').status).toBe('ready');
    // And Facebook's own copy survives, so re-selecting it does not lose work.
    expect(draftFor(state, 'facebook').text?.body).toBe('FB copy');
  });
});

/* ========================================================================== */
/* 2. Draft independence                                                      */
/* ========================================================================== */

describe('each platform’s draft stands on its own', () => {
  const twoTargets: ComposeEvent[] = [
    { type: 'toggle_target', platform: 'instagram' },
    { type: 'toggle_target', platform: 'facebook' },
  ];

  it('a Facebook failure leaves the Instagram draft ready', () => {
    const state = run(
      ...twoTargets,
      { type: 'generation_succeeded', platform: 'instagram', text: generated(GOOD), modelId: 'm' },
      { type: 'generation_failed', platform: 'facebook', message: 'Rate limited.' },
    );

    expect(draftFor(state, 'instagram').status).toBe('ready');
    expect(draftFor(state, 'instagram').error).toBeNull();
    expect(draftFor(state, 'facebook').status).toBe('failed');
    expect(draftFor(state, 'facebook').error).toBe('Rate limited.');
  });

  it('generating one platform does not put another into "generating"', () => {
    const state = run(...twoTargets, { type: 'generation_started', platform: 'facebook' });
    expect(draftFor(state, 'facebook').status).toBe('generating');
    expect(draftFor(state, 'instagram').status).toBe('idle');
  });

  it('editing one platform does not change another', () => {
    const state = run(
      ...twoTargets,
      { type: 'generation_succeeded', platform: 'instagram', text: generated('IG'), modelId: 'm' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated('FB'), modelId: 'm' },
      { type: 'edit_text', platform: 'facebook', body: 'FB, rewritten by the owner' },
    );

    expect(draftFor(state, 'facebook').text?.body).toBe('FB, rewritten by the owner');
    expect(draftFor(state, 'instagram').text?.body).toBe('IG');
    expect(draftFor(state, 'instagram').edited).toBe(false);
  });

  it('a platform-specific field belongs to that platform alone', () => {
    const state = run(
      ...twoTargets,
      { type: 'set_link', link: 'https://example.invalid/book' },
    );
    const facebook = draftFor(state, 'facebook');
    const instagram = draftFor(state, 'instagram');

    expect(facebook.platform === 'facebook' && facebook.link).toBe('https://example.invalid/book');
    // Instagram has no link field at all — the type has none, and neither does
    // the draft. There is nowhere for Facebook's link to leak to.
    expect(instagram.platform).toBe('instagram');
    expect('link' in instagram).toBe(false);
  });

  it('one platform’s validation errors never appear on another’s review', () => {
    // Instagram with no media cannot be built; Facebook publishes words alone.
    const state = run(
      ...twoTargets,
      { type: 'generation_succeeded', platform: 'instagram', text: generated(GOOD), modelId: 'm' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD), modelId: 'm' },
    );

    expect(contentFor(state, 'instagram')).toBeNull();
    expect(blockerFor(state, 'instagram')).toMatch(/needs a photo or video/i);

    // Facebook is entirely unaffected by Instagram's missing media.
    expect(blockerFor(state, 'facebook')).toBeNull();
    expect(reviewFor(state, 'facebook')?.ok).toBe(true);
  });

  it('reviews only ever carry their own platform’s issues', () => {
    const state = run(
      ...twoTargets,
      { type: 'add_media', asset: image() },
      { type: 'generation_succeeded', platform: 'instagram', text: generated('x'.repeat(2300)), modelId: 'm' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD), modelId: 'm' },
    );

    const instagram = reviewFor(state, 'instagram');
    const facebook = reviewFor(state, 'facebook');

    expect(instagram?.ok).toBe(false);
    for (const issue of instagram?.issues ?? []) expect(issue.platform).toBe('instagram');
    // Facebook has no documented message limit, so the same text is fine there.
    expect(facebook?.ok).toBe(true);
  });
});

/* ========================================================================== */
/* 3. Content stays platform-specific                                         */
/* ========================================================================== */

describe('the composition builds three different objects', () => {
  it('builds each platform its own content type', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'toggle_target', platform: 'google_business' },
      { type: 'add_media', asset: image() },
      { type: 'generation_succeeded', platform: 'instagram', text: generated(GOOD), modelId: 'm' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD), modelId: 'm' },
      { type: 'generation_succeeded', platform: 'google_business', text: generated(GOOD), modelId: 'm' },
    );

    const content = composedContent(state);
    expect(content.instagram?.platform).toBe('instagram');
    expect(content.facebook?.platform).toBe('facebook');
    expect(content.google_business?.platform).toBe('google_business');

    // The shapes genuinely differ, which is the point of three types.
    expect(content.instagram?.format.kind).toBe('single_image');
    expect(content.facebook?.format.kind).toBe('photo');
    expect(content.google_business?.topic.kind).toBe('STANDARD');
  });

  it('gives Facebook a text post when there is no media, where Instagram gets nothing', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'generation_succeeded', platform: 'instagram', text: generated(GOOD), modelId: 'm' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD), modelId: 'm' },
    );

    expect(contentFor(state, 'facebook')?.platform).toBe('facebook');
    expect(contentFor(state, 'instagram')).toBeNull();

    // The composition still carries Facebook — Instagram's gap removes nothing.
    const content = composedContent(state);
    expect(content.facebook).toBeDefined();
    expect(content.instagram).toBeUndefined();
  });

  it('turns a Facebook link into a link post rather than pasting a URL into the text', () => {
    const state = run(
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD), modelId: 'm' },
      { type: 'set_link', link: 'https://example.invalid/book' },
    );
    const content = contentFor(state, 'facebook');
    expect(content?.platform === 'facebook' && content.format.kind).toBe('link');
  });

  it('never carries content for a platform that is not targeted', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD), modelId: 'm' },
      { type: 'toggle_target', platform: 'facebook' },
    );
    // Facebook's draft survives deselection, but it is not part of the post.
    expect(draftFor(state, 'facebook').text).not.toBeNull();
    expect(composedContent(state).facebook).toBeUndefined();
  });
});

/* ========================================================================== */
/* 4. Provenance                                                              */
/* ========================================================================== */

describe('provenance survives editing', () => {
  it('marks generated copy the owner edited as generated_edited, never owner', () => {
    const state = run(
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD, 'm1'), modelId: 'm1' },
      { type: 'edit_text', platform: 'facebook', body: 'The owner’s own rewrite.' },
    );

    const draft = draftFor(state, 'facebook');
    expect(draft.text?.origin).toBe('generated_edited');
    // The model that wrote it stays recorded on the caption, so a bad batch can
    // still be traced to its source after the owner has rewritten it.
    expect(draft.text?.generatedBy).toBe('m1');
    expect(draft.modelId).toBe('m1');
    expect(draft.edited).toBe(true);
  });

  it('leaves copy the owner typed from nothing as their own', () => {
    const state = run(
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'edit_text', platform: 'facebook', body: 'Typed from scratch.' },
    );
    const draft = draftFor(state, 'facebook');
    expect(draft.text?.origin).toBe('owner');
    expect(draft.edited).toBe(false);
  });

  it('a fresh generation replaces the text and clears the edited flag', () => {
    const state = run(
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated('first'), modelId: 'm' },
      { type: 'edit_text', platform: 'facebook', body: 'edited' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated('second'), modelId: 'm' },
    );
    expect(draftFor(state, 'facebook').text?.body).toBe('second');
    expect(draftFor(state, 'facebook').edited).toBe(false);
  });

  it('editing a failed draft clears its error rather than stranding it', () => {
    const state = run(
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'generation_failed', platform: 'facebook', message: 'Rate limited.' },
      { type: 'edit_text', platform: 'facebook', body: 'I will write it myself.' },
    );
    expect(draftFor(state, 'facebook').status).toBe('ready');
    expect(draftFor(state, 'facebook').error).toBeNull();
  });
});

/* ========================================================================== */
/* 5. Step transitions                                                        */
/* ========================================================================== */

describe('the step machine', () => {
  it('runs targets → brief → drafts → saved', () => {
    expect(COMPOSE_STEPS).toEqual(['targets', 'brief', 'drafts', 'saved']);
    expect(nextStep('targets')).toBe('brief');
    expect(nextStep('brief')).toBe('drafts');
    expect(previousStep('drafts')).toBe('brief');
    expect(previousStep('targets')).toBeNull();
    expect(nextStep('saved')).toBeNull();
  });

  /** Targets come first because content is written per platform. */
  it('will not leave the targets step with nothing chosen, and says why', () => {
    expect(advanceBlockedReason(initialComposeState())).toMatch(/at least one place/i);

    const chosen = run({ type: 'toggle_target', platform: 'instagram' });
    expect(advanceBlockedReason(chosen)).toBeNull();
  });

  it('will not leave the brief step empty, and says why', () => {
    const atBrief = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'go_to', step: 'brief' },
    );
    expect(advanceBlockedReason(atBrief)).toMatch(/what this post is about/i);

    const withBrief = composeReducer(atBrief, { type: 'set_brief', brief: 'quiet mornings' });
    expect(advanceBlockedReason(withBrief)).toBeNull();
  });

  it('treats a whitespace-only brief as empty', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'go_to', step: 'brief' },
      { type: 'set_brief', brief: '   \n ' },
    );
    expect(advanceBlockedReason(state)).not.toBeNull();
  });

  /**
   * Saving a DRAFT is not publishing. Requiring every platform to be
   * publishable would be a publish gate wearing a draft's name — and a
   * coupling: an Instagram card waiting for a photo would stop the owner
   * saving the Facebook copy they had already finished.
   */
  it('lets a draft be saved when one platform has text, even if another cannot publish', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'toggle_target', platform: 'facebook' },
      { type: 'go_to', step: 'drafts' },
      { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD), modelId: 'm' },
    );

    // Instagram is genuinely not publishable — no media — and says so.
    expect(blockerFor(state, 'instagram')).not.toBeNull();
    // The draft can still be saved.
    expect(advanceBlockedReason(state)).toBeNull();
  });

  it('refuses to save a draft with nothing written at all', () => {
    const state = run(
      { type: 'toggle_target', platform: 'instagram' },
      { type: 'go_to', step: 'drafts' },
    );
    expect(advanceBlockedReason(state)).toMatch(/write or generate/i);
  });
});

/* ========================================================================== */
/* 6. Saving                                                                  */
/* ========================================================================== */

describe('saving the composition', () => {
  const composed = run(
    { type: 'toggle_target', platform: 'facebook' },
    { type: 'toggle_target', platform: 'google_business' },
    { type: 'set_brief', brief: 'quiet weekday mornings' },
    { type: 'generation_succeeded', platform: 'facebook', text: generated(GOOD), modelId: 'm' },
    { type: 'generation_succeeded', platform: 'google_business', text: generated(GOOD), modelId: 'm' },
  );

  const post = toDraftPost(composed, { businessId: 'b1' }, '2026-09-11T00:00:00.000Z', 'post-1');

  /** A draft is a draft. Nothing here implies anything was sent anywhere. */
  it('saves as a draft, never scheduled and never published', () => {
    expect(post.state).toBe('draft');
    expect(post.schedule).toBeNull();
  });

  it('claims no publication: every target is unattempted with no remote id', () => {
    expect(post.targets.map((target) => target.platform)).toEqual(['facebook', 'google_business']);
    for (const target of post.targets) {
      expect(target.status).toBe('not_attempted');
      expect(target.remoteId).toBeNull();
      expect(target.publishedAt).toBeNull();
    }
  });

  it('carries per-platform content, not one shared caption', () => {
    expect(post.content.facebook?.platform).toBe('facebook');
    expect(post.content.google_business?.platform).toBe('google_business');
    expect(post.content.instagram).toBeUndefined();
  });

  it('reports no insights, because nothing has been measured', () => {
    expect(post.insights).toBeNull();
  });

  it('titles the post from the owner’s brief', () => {
    expect(post.title).toBe('quiet weekday mornings');
  });

  it('marks the state saved once a store has taken it', () => {
    const saved = composeReducer(composed, { type: 'saved', postId: 'post-1' });
    expect(saved.step).toBe('saved');
    expect(saved.savedPostId).toBe('post-1');
  });
});
