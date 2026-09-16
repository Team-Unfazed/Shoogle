/**
 * Compose state. Owner: Yash.
 *
 * ===================== PURE, SO THE RULES ARE TESTABLE ======================
 *
 * The compose flow's behaviour lives here as a reducer over plain data. The
 * screen renders this and dispatches into it; it decides nothing itself. That
 * is the same split the Posts tab already uses (`view.ts` derives, the screen
 * renders), and it is what lets product rule 13 be asserted in a unit test
 * rather than argued about in a screenshot.
 *
 * ==================== PRODUCT RULE 13 IS THE SHAPE HERE =====================
 *
 * Every platform's draft is its OWN entry in a map, with its own status, its
 * own error and its own edits. There is no shared draft, no shared status and
 * no shared error, so:
 *
 *   - toggling Facebook off cannot disturb the Instagram draft;
 *   - Facebook's generation failing leaves Instagram's `ready`;
 *   - Instagram's validation errors never appear on Google's card.
 *
 * A combined status field would have made all three of those possible to get
 * wrong, which is why there isn't one.
 *
 * ============================= WHAT IS NOT HERE =============================
 *
 * No publishing, no OAuth, no network. Generation goes through the injected
 * generator seam; saving writes a `SocialPost` to whatever `PostStore` the
 * caller supplies, which is the in-memory one for this milestone.
 */

import {
  facebookContent,
  gbpContent,
  instagramContent,
  reviewPlatformContent,
  type ContentReview,
  type GbpCallToAction,
  type GbpTopic,
  type PlatformContent,
  type PostContent,
} from '../content';
import type { BusinessContext, ContentObjectiveKind } from '../generation';
import {
  newTarget,
  type Caption,
  type CaptionLanguage,
  type MediaAsset,
  type Platform,
  type SocialPost,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The four stages of composing a post.
 *
 * `targets` comes FIRST, and that ordering is load-bearing: content is written
 * per platform, so there is nothing to write until the owner has said where the
 * post is going. It is also the reason the Posts list asks for a target before
 * a caption (see `describeUnfinished`).
 */
export type ComposeStep = 'targets' | 'brief' | 'drafts' | 'saved';

export const COMPOSE_STEPS: readonly ComposeStep[] = ['targets', 'brief', 'drafts', 'saved'];

export const STEP_TITLE: Record<ComposeStep, string> = {
  targets: 'Where should this go?',
  brief: 'What is this post about?',
  drafts: 'Check each post',
  saved: 'Draft saved',
};

/* -------------------------------------------------------------------------- */
/* One platform's draft                                                       */
/* -------------------------------------------------------------------------- */

export type DraftStatus = 'idle' | 'generating' | 'ready' | 'failed';

interface DraftCommon {
  readonly status: DraftStatus;
  /** The platform's own words. Null until generated or typed. */
  readonly text: Caption | null;
  /** Model that wrote it, or null when the owner did. */
  readonly modelId: string | null;
  /** True once the owner has changed generated copy. Never resets. */
  readonly edited: boolean;
  /** Why generation failed, for this platform only. */
  readonly error: string | null;
}

/**
 * Per-platform form state. A union, not one shape with optional fields,
 * because the extras genuinely differ: alt text is an Instagram concept that
 * Meta supports on images only, `link` is a Facebook field with no Instagram
 * equivalent, and a topic type is required by Google and by nobody else.
 */
export type InstagramDraft = DraftCommon & {
  readonly platform: 'instagram';
  readonly altText: string | null;
};

export type FacebookDraft = DraftCommon & {
  readonly platform: 'facebook';
  readonly link: string | null;
};

export type GbpDraft = DraftCommon & {
  readonly platform: 'google_business';
  readonly topic: GbpTopic;
  readonly callToAction: GbpCallToAction | null;
};

export type ComposeDraft = InstagramDraft | FacebookDraft | GbpDraft;

function emptyDraft(platform: Platform): ComposeDraft {
  const base = { status: 'idle' as const, text: null, modelId: null, edited: false, error: null };
  switch (platform) {
    case 'instagram':
      return { ...base, platform, altText: null };
    case 'facebook':
      return { ...base, platform, link: null };
    case 'google_business':
      return { ...base, platform, topic: { kind: 'STANDARD' }, callToAction: null };
  }
}

/* -------------------------------------------------------------------------- */
/* The state                                                                  */
/* -------------------------------------------------------------------------- */

export interface ComposeState {
  readonly step: ComposeStep;
  /** Chosen platforms, in canonical order. Independent of one another. */
  readonly targets: readonly Platform[];
  readonly objective: ContentObjectiveKind;
  readonly brief: string;
  readonly language: CaptionLanguage;
  /** Media shared across platforms. Each platform decides what it can use. */
  readonly media: readonly MediaAsset[];
  /** One entry per platform the owner has ever selected. */
  readonly drafts: Partial<Record<Platform, ComposeDraft>>;
  /** Set once the composition has been written to a store. */
  readonly savedPostId: string | null;
}

export function initialComposeState(): ComposeState {
  return {
    step: 'targets',
    targets: [],
    objective: 'promote_service',
    brief: '',
    language: 'en',
    media: [],
    drafts: {},
    savedPostId: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export type ComposeEvent =
  | { type: 'toggle_target'; platform: Platform }
  | { type: 'set_objective'; objective: ContentObjectiveKind }
  | { type: 'set_brief'; brief: string }
  | { type: 'set_language'; language: CaptionLanguage }
  | { type: 'add_media'; asset: MediaAsset }
  | { type: 'remove_media'; assetId: string }
  | { type: 'go_to'; step: ComposeStep }
  | { type: 'generation_started'; platform: Platform }
  | { type: 'generation_succeeded'; platform: Platform; text: Caption; modelId: string }
  | { type: 'generation_failed'; platform: Platform; message: string }
  | { type: 'edit_text'; platform: Platform; body: string }
  | { type: 'edit_hashtags'; platform: Platform; hashtags: string[] }
  | { type: 'set_alt_text'; altText: string }
  | { type: 'set_link'; link: string }
  | { type: 'set_gbp_topic'; topic: GbpTopic }
  | { type: 'set_gbp_cta'; callToAction: GbpCallToAction | null }
  | { type: 'saved'; postId: string };

/* -------------------------------------------------------------------------- */
/* The reducer                                                                */
/* -------------------------------------------------------------------------- */

const PLATFORM_ORDER: readonly Platform[] = ['instagram', 'facebook', 'google_business'];

export function composeReducer(state: ComposeState, event: ComposeEvent): ComposeState {
  switch (event.type) {
    case 'toggle_target': {
      const selected = state.targets.includes(event.platform);
      const targets = selected
        ? state.targets.filter((platform) => platform !== event.platform)
        : PLATFORM_ORDER.filter(
            (platform) => platform === event.platform || state.targets.includes(platform),
          );

      /*
       * Deselecting KEEPS the draft. An owner who unticks Facebook to see what
       * the post looks like without it, then changes their mind, should not
       * have lost the Facebook copy they had already edited — and deleting it
       * would also be a way for one platform to destroy another's work, which
       * is the failure product rule 13 is about.
       *
       * Drafts for unselected platforms are simply not rendered and not saved.
       */
      const drafts = { ...state.drafts };
      if (!selected && drafts[event.platform] === undefined) {
        drafts[event.platform] = emptyDraft(event.platform);
      }
      return { ...state, targets, drafts };
    }

    case 'set_objective':
      return { ...state, objective: event.objective };

    case 'set_brief':
      return { ...state, brief: event.brief };

    case 'set_language':
      return { ...state, language: event.language };

    case 'add_media':
      return { ...state, media: [...state.media, event.asset] };

    case 'remove_media':
      return { ...state, media: state.media.filter((asset) => asset.id !== event.assetId) };

    case 'go_to':
      return { ...state, step: event.step };

    /* -- Generation: one platform at a time, never a shared status -------- */

    case 'generation_started':
      return patchDraft(state, event.platform, (draft) => ({
        ...draft,
        status: 'generating',
        error: null,
      }));

    case 'generation_succeeded':
      return patchDraft(state, event.platform, (draft) => ({
        ...draft,
        status: 'ready',
        text: event.text,
        modelId: event.modelId,
        // A fresh generation replaces the text, so it is no longer owner-edited.
        edited: false,
        error: null,
      }));

    case 'generation_failed':
      /*
       * The failure lands on ONE platform's entry. Nothing else is touched, so
       * a Facebook failure cannot mark an Instagram draft failed — that is the
       * coupling rule 13 forbids, expressed as data.
       */
      return patchDraft(state, event.platform, (draft) => ({
        ...draft,
        status: 'failed',
        error: event.message,
      }));

    /* -- Editing ---------------------------------------------------------- */

    case 'edit_text':
      return patchDraft(state, event.platform, (draft) => ({
        ...draft,
        status: draft.status === 'failed' ? 'ready' : draft.status,
        error: null,
        text: editedCaption(draft, { body: event.body }),
        // Provenance: generated copy the owner touched becomes
        // `generated_edited` and can never become `owner` (see captions.ts).
        edited: draft.modelId !== null,
      }));

    case 'edit_hashtags':
      return patchDraft(state, event.platform, (draft) => ({
        ...draft,
        text: editedCaption(draft, { hashtags: event.hashtags }),
        edited: draft.modelId !== null ? true : draft.edited,
      }));

    /* -- Platform-specific extras ----------------------------------------- */

    case 'set_alt_text':
      return patchDraft(state, 'instagram', (draft) =>
        draft.platform === 'instagram' ? { ...draft, altText: event.altText } : draft,
      );

    case 'set_link':
      return patchDraft(state, 'facebook', (draft) =>
        draft.platform === 'facebook' ? { ...draft, link: event.link } : draft,
      );

    case 'set_gbp_topic':
      return patchDraft(state, 'google_business', (draft) =>
        draft.platform === 'google_business' ? { ...draft, topic: event.topic } : draft,
      );

    case 'set_gbp_cta':
      return patchDraft(state, 'google_business', (draft) =>
        draft.platform === 'google_business'
          ? { ...draft, callToAction: event.callToAction }
          : draft,
      );

    case 'saved':
      return { ...state, savedPostId: event.postId, step: 'saved' };
  }
}

function patchDraft(
  state: ComposeState,
  platform: Platform,
  patch: (draft: ComposeDraft) => ComposeDraft,
): ComposeState {
  const existing = state.drafts[platform] ?? emptyDraft(platform);
  return { ...state, drafts: { ...state.drafts, [platform]: patch(existing) } };
}

function editedCaption(
  draft: ComposeDraft,
  change: { body?: string; hashtags?: string[] },
): Caption {
  const current: Caption = draft.text ?? {
    body: '',
    hashtags: [],
    language: 'en',
    origin: 'owner',
    generatedBy: null,
  };
  return {
    ...current,
    ...(change.body !== undefined ? { body: change.body } : {}),
    ...(change.hashtags !== undefined ? { hashtags: change.hashtags } : {}),
    // Generated copy the owner edits becomes `generated_edited`. It never
    // becomes `owner`: the owner did not write it from nothing.
    origin: current.origin === 'generated' ? 'generated_edited' : current.origin,
  };
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

export function draftFor(state: ComposeState, platform: Platform): ComposeDraft {
  return state.drafts[platform] ?? emptyDraft(platform);
}

/** Drafts for the platforms currently selected, in canonical order. */
export function selectedDrafts(state: ComposeState): ComposeDraft[] {
  return state.targets.map((platform) => draftFor(state, platform));
}

/**
 * Build one platform's real content object, or null when there is not enough
 * to build one.
 *
 * Null is meaningful and is NOT an error: Instagram genuinely cannot be
 * represented without media, because `InstagramFormat` has no text-only member.
 * The screen renders that as "Instagram needs a photo", which is the truth
 * rather than a Shoogle rule.
 */
export function contentFor(state: ComposeState, platform: Platform): PlatformContent | null {
  const draft = draftFor(state, platform);
  if (draft.text === null) return null;

  switch (draft.platform) {
    case 'instagram': {
      const [first] = state.media;
      if (first === undefined) return null;
      if (state.media.length > 1) {
        return instagramContent(draft.text, {
          kind: 'carousel',
          items: state.media.map((asset) =>
            asset.kind === 'video'
              ? ({ kind: 'video', video: asset } as const)
              : ({ kind: 'image', image: asset, altText: draft.altText } as const),
          ),
        });
      }
      return instagramContent(
        draft.text,
        first.kind === 'video'
          ? { kind: 'reel', video: first }
          : { kind: 'single_image', image: first, altText: draft.altText },
      );
    }

    case 'facebook': {
      const [first] = state.media;
      const link = draft.link?.trim() ?? '';
      if (link !== '') return facebookContent(draft.text, { kind: 'link', url: link });
      if (first === undefined) {
        // Facebook publishes words alone. Instagram cannot, and that asymmetry
        // is exactly why these are different types.
        return facebookContent(draft.text, { kind: 'text' });
      }
      if (state.media.length > 1) {
        return facebookContent(draft.text, { kind: 'multi_photo', photos: [...state.media] });
      }
      return facebookContent(
        draft.text,
        first.kind === 'video' ? { kind: 'video', video: first } : { kind: 'photo', photo: first },
      );
    }

    case 'google_business':
      return gbpContent(draft.text, draft.topic, {
        callToAction: draft.callToAction,
        media: [...state.media],
      });
  }
}

/** Content for every selected platform that has enough to build one. */
export function composedContent(state: ComposeState): PostContent {
  const content: PostContent = {};
  for (const platform of state.targets) {
    const built = contentFor(state, platform);
    if (built === null) continue;
    if (built.platform === 'instagram') content.instagram = built;
    if (built.platform === 'facebook') content.facebook = built;
    if (built.platform === 'google_business') content.google_business = built;
  }
  return content;
}

/**
 * One platform's review, or null when there is nothing to review yet.
 *
 * Computed per platform from that platform's own content — the same
 * enforcement as `availabilityFor` and `reviewPlatformContent`. One platform's
 * errors can never reach another's card because they are never in the same
 * object.
 */
export function reviewFor(state: ComposeState, platform: Platform): ContentReview | null {
  const content = contentFor(state, platform);
  return content === null ? null : reviewPlatformContent(content);
}

/** Why this platform is not ready to save, or null when it is. */
export function blockerFor(state: ComposeState, platform: Platform): string | null {
  const draft = draftFor(state, platform);
  if (draft.status === 'generating') return 'Still writing…';
  if (draft.text === null || draft.text.body.trim() === '') return 'Nothing written yet.';

  const content = contentFor(state, platform);
  if (content === null) {
    return platform === 'instagram'
      ? 'Instagram needs a photo or video. It cannot publish text on its own.'
      : 'Not enough to build this post yet.';
  }

  const review = reviewPlatformContent(content);
  if (!review.ok) {
    const blocking = review.issues.find((issue) => issue.blocking);
    return blocking?.message ?? 'This post has a problem.';
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Step gating                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Why the owner cannot move on, or null when they can.
 *
 * Returns a REASON rather than a boolean so the screen can say why a disabled
 * button is disabled. A control that is dead with no explanation is the thing
 * this codebase keeps refusing to ship.
 */
export function advanceBlockedReason(state: ComposeState): string | null {
  switch (state.step) {
    case 'targets':
      return state.targets.length === 0 ? 'Choose at least one place to post.' : null;
    case 'brief':
      return state.brief.trim() === ''
        ? 'Say what this post is about, even in a few words.'
        : null;
    case 'drafts': {
      /*
       * Saving a DRAFT is not publishing, so this does not demand that every
       * platform be publishable. It asks only that there is something to save.
       *
       * Requiring every platform to be ready would be a publish gate wearing a
       * draft's name, and it would also be a coupling: an Instagram card
       * waiting for a photo would stop the owner saving the Facebook copy they
       * already finished. Per-platform readiness is shown on each card by
       * `blockerFor`, where it belongs.
       */
      const hasSomething = state.targets.some((platform) => {
        const text = draftFor(state, platform).text;
        return text !== null && text.body.trim() !== '';
      });
      return hasSomething ? null : 'Write or generate at least one post first.';
    }
    case 'saved':
      return null;
  }
}

export function nextStep(step: ComposeStep): ComposeStep | null {
  const index = COMPOSE_STEPS.indexOf(step);
  return COMPOSE_STEPS[index + 1] ?? null;
}

export function previousStep(step: ComposeStep): ComposeStep | null {
  const index = COMPOSE_STEPS.indexOf(step);
  return index <= 0 ? null : (COMPOSE_STEPS[index - 1] ?? null);
}

/* -------------------------------------------------------------------------- */
/* Saving                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Turn the composition into a `SocialPost` in the `draft` state.
 *
 * DRAFT, not scheduled and not published. Nothing here reaches a platform: the
 * publisher still refuses to schedule without an adapter, and this milestone
 * has none. Saving records what the owner wrote so it survives leaving the
 * screen — no more than that, and the state name says so.
 */
export function toDraftPost(
  state: ComposeState,
  context: Pick<BusinessContext, 'businessId'>,
  now: string,
  id: string,
): SocialPost {
  const content = composedContent(state);
  return {
    id,
    businessId: context.businessId,
    title: draftTitle(state),
    state: 'draft',
    content,
    media: [...state.media],
    carouselId: null,
    schedule: null,
    targets: state.targets.map(newTarget),
    insights: null,
    createdAt: now,
    updatedAt: now,
  };
}

function draftTitle(state: ComposeState): string {
  const brief = state.brief.trim();
  if (brief !== '') return brief.split('\n')[0]?.slice(0, 80) ?? 'Untitled post';
  const firstText = state.targets
    .map((platform) => draftFor(state, platform).text?.body ?? '')
    .find((body) => body.trim() !== '');
  return firstText?.split('\n')[0]?.slice(0, 80) ?? 'Untitled post';
}
