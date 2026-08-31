/**
 * SocialContentGenerator — the seam between Shoogle's UI and whichever model
 * writes captions. Owner: Yash.
 *
 * ============================ WHY THIS EXISTS ==============================
 *
 * No screen in this feature imports Gemini, or any other model SDK. They call
 * `getSocialContentGenerator()` and render whatever `DataState` comes back.
 * That buys three things:
 *
 *   - the composer can be built, tested and shipped before a model is chosen;
 *   - swapping providers is one `setSocialContentGenerator()` call, not a
 *     rewrite of every screen;
 *   - a generator that is not configured reports `unavailable('not_connected')`
 *     rather than the UI having to know why nothing happened.
 *
 * ==================== CUSTOMER DATA — READ BEFORE WIRING ===================
 *
 * `BusinessBrief` is deliberately narrow: business name, category, locality.
 * No customer names, no review text, no phone numbers, no photos of people.
 *
 * Before ANY real business's data is sent to a model provider, the configured
 * tier's data-use terms must be appropriate for production. A free tier that
 * trains on submitted prompts is not. Enabling a paid tier costs money, so it
 * is a STOP-AND-ASK, not an engineering decision. There is no API key in this
 * repository and no `EXPO_PUBLIC_*` variable for one — a generation key must
 * never ship inside the APK, so the real implementation calls a Shoogle-side
 * endpoint that holds the key server-side.
 *
 * ============================= NO THEATRE ==================================
 *
 * `generateCaption` resolves once. There is no progress callback and no
 * percentage, because a model gives neither (product rule 10). The UI shows an
 * indeterminate state while the promise is outstanding, and the post sits in
 * `generating` until it settles.
 */

import type { Result } from '@/lib/providers/types';
import { unavailable } from '@/lib/state/DataState';

import type { BusinessBrief, Caption, CaptionLanguage, Platform } from './types';

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

export interface CaptionRequest {
  business: BusinessBrief;
  /** The platforms this caption is for. Tone differs; the text may not. */
  platforms: Platform[];
  language: CaptionLanguage;
  /**
   * The owner's own words about what this post is for, e.g. "monsoon offer,
   * 20% off haircuts this week". Minimising owner input (product rule 2) means
   * this is the ONLY free-text field the composer asks for.
   */
  brief: string;
  /** Existing caption when the owner asked for a rewrite rather than a draft. */
  rewriteOf: Caption | null;
}

export interface SlideCopyRequest {
  business: BusinessBrief;
  language: CaptionLanguage;
  brief: string;
  /** How many slides to write copy for. */
  slideCount: number;
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                  */
/* -------------------------------------------------------------------------- */

export interface GeneratedCaption {
  caption: Caption;
  /** Which model produced it. Stored on the caption for traceability. */
  modelId: string;
  generatedAt: string;
}

/**
 * Slide copy as plain heading/body pairs.
 *
 * Deliberately NOT `CarouselSlide`: `features/carousel` imports from this
 * feature, so importing its types back would be a cycle. The carousel editor
 * maps these onto its own slides, preserving ids and any owner edits.
 */
export interface GeneratedSlideCopy {
  slides: { heading: string | null; body: string | null }[];
  modelId: string;
  generatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* The contract                                                               */
/* -------------------------------------------------------------------------- */

export interface SocialContentGenerator {
  /** Stable id, e.g. 'shoogle-server'. Recorded on generated captions. */
  readonly id: string;
  /** Owner-facing name, shown as "Written by …" where provenance matters. */
  readonly displayName: string;
  /**
   * False until a real endpoint and an approved data-use tier exist. The
   * composer disables "Write it for me" rather than offering a button that
   * cannot work.
   */
  isConfigured(): boolean;
  generateCaption(request: CaptionRequest): Result<GeneratedCaption>;
  generateSlideCopy(request: SlideCopyRequest): Result<GeneratedSlideCopy>;
}

/* -------------------------------------------------------------------------- */
/* The honest default                                                         */
/* -------------------------------------------------------------------------- */

const NOT_CONFIGURED_MESSAGE =
  'Shoogle cannot write posts yet. Content generation is not switched on for this account.';

/**
 * The generator in force until a real one is installed.
 *
 * It performs no I/O, returns no text, and never pretends a model ran. This is
 * the same posture as `lib/providers/registry.ts` takes for connections: the
 * literal truth is "nothing is wired up", so that is what it says.
 */
export const unconfiguredGenerator: SocialContentGenerator = {
  id: 'unconfigured',
  displayName: 'Not configured',
  isConfigured: () => false,
  generateCaption: () => Promise.resolve(unavailable('not_connected', NOT_CONFIGURED_MESSAGE)),
  generateSlideCopy: () => Promise.resolve(unavailable('not_connected', NOT_CONFIGURED_MESSAGE)),
};

let active: SocialContentGenerator | null = null;

/**
 * Install the real generator. Called once, from this feature's entry point,
 * the day a server-side generation endpoint exists.
 */
export function setSocialContentGenerator(generator: SocialContentGenerator | null): void {
  active = generator;
}

export function getSocialContentGenerator(): SocialContentGenerator {
  return active ?? unconfiguredGenerator;
}

/** True when a real generator is installed AND says it can work. */
export function isGenerationAvailable(): boolean {
  return getSocialContentGenerator().isConfigured();
}
