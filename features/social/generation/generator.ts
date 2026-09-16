/**
 * The AI-backed social content generator. Owner: Yash.
 *
 * ======================= WHAT THIS FILE DOES NOT DO =========================
 *
 * It does not read `GEMINI_API_KEY`. It does not name it, receive it, or hold
 * it. It does not construct a Gemini client, know the endpoint, or import
 * anything from `@google/*`.
 *
 * It holds an `AiProvider` — Pranay's seam — and calls `generateText`. Whether
 * that provider is the free-tier development client, the local dev proxy, or a
 * future server-side implementation is decided by whoever constructs this, and
 * this file cannot tell the difference. That is the point: there is exactly ONE
 * door out to a model in this repository, with the data-classification guards
 * standing in it, and adding a second would mean adding a second door.
 *
 * ========================= THE GENERATION LOOP =============================
 *
 * A model's first answer is often fine and sometimes is not, so output is
 * CHECKED rather than trusted:
 *
 *    build a per-platform prompt
 *      -> ask the provider
 *      -> reject invented facts        (fabrication.ts)
 *      -> reject machine-sounding copy (humanize.ts)
 *      -> retry, up to `maxAttempts`
 *      -> if it never passes, report unavailable and say why
 *
 * The last step matters more than the retries. A generator that cannot produce
 * honest copy returns nothing and explains itself; it does not hand over its
 * best failing attempt with a warning attached, because a warning next to a
 * publishable-looking caption gets dismissed.
 */

import type { Result } from '@/lib/providers/types';
import { failed, ready, unavailable, unwrapOrNull } from '@/lib/state/DataState';
import {
  fixtureInput,
  type AiProvider,
  type AiTextRequest,
} from '@/features/seo/ai';

import { extractInlineHashtags, normaliseHashtags } from '../captions';
import type { Caption, CaptionLanguage, Platform } from '../types';

import { reviewCompleteness, type CompletenessFinding } from './completeness';
import { type BusinessContext, type ContentObjective } from './context';
import { reviewFabrication, type FabricationFinding } from './fabrication';
import { reviewHumanness, type HumanizeFinding } from './humanize';
import { facebookPrompt } from './prompts/facebook';
import { gbpPrompt } from './prompts/gbp';
import { instagramPrompt } from './prompts/instagram';

/* -------------------------------------------------------------------------- */
/* Prompt selection                                                           */
/* -------------------------------------------------------------------------- */

export interface PromptOptions {
  hasMedia?: boolean;
  hasLink?: boolean;
  callToAction?: Parameters<typeof gbpPrompt>[2] extends { callToAction?: infer T } ? T : never;
}

/**
 * The prompt for one platform.
 *
 * A `switch` with no default, so adding a platform is a compile error here
 * rather than a silent fallback to somebody else's prompt — which is exactly
 * how "three platforms" quietly becomes "Instagram, plus two copies of it".
 */
export function promptFor(
  platform: Platform,
  context: BusinessContext,
  objective: ContentObjective,
  options: PromptOptions = {},
): string {
  switch (platform) {
    case 'instagram':
      return instagramPrompt(context, objective);
    case 'facebook':
      return facebookPrompt(context, objective, {
        hasMedia: options.hasMedia,
        hasLink: options.hasLink,
      });
    case 'google_business':
      return gbpPrompt(context, objective, { callToAction: options.callToAction ?? null });
  }
}

/* -------------------------------------------------------------------------- */
/* Verdict                                                                    */
/* -------------------------------------------------------------------------- */

export interface DraftVerdict {
  readonly accepted: boolean;
  readonly fabrication: readonly FabricationFinding[];
  readonly humanness: readonly HumanizeFinding[];
  /**
   * Evidence the model was cut off mid-thought. Added after the first live
   * call returned a caption that invented nothing and read like a person and
   * stopped mid-sentence — the other two guards both passed it.
   */
  readonly completeness: readonly CompletenessFinding[];
}

/**
 * Judge one draft. Exported so a test — and a future review screen — can run
 * the exact checks the generator runs, rather than an approximation of them.
 *
 * Completeness is checked FIRST because it is the cheapest and because a
 * truncated draft's other findings are not worth reporting: half a caption
 * fabricates nothing simply by virtue of having stopped early.
 */
export function judgeDraft(text: string, context: BusinessContext): DraftVerdict {
  const completeness = reviewCompleteness(text);
  const fabrication = reviewFabrication(text, context);
  const humanness = reviewHumanness(text, context.keywords);
  return {
    accepted: completeness.ok && fabrication.ok && humanness.ok,
    fabrication: fabrication.findings,
    humanness: humanness.findings,
    completeness: completeness.findings,
  };
}

/* -------------------------------------------------------------------------- */
/* The generator                                                              */
/* -------------------------------------------------------------------------- */

export interface SocialGeneratorDeps {
  /** Pranay's seam. This module never constructs one itself. */
  readonly ai: AiProvider;
  /** How many times to redraft before giving up. */
  readonly maxAttempts?: number;
  readonly now?: () => string;
}

export interface PlatformDraft {
  readonly platform: Platform;
  readonly caption: Caption;
  readonly modelId: string;
  readonly generatedAt: string;
  /**
   * Advisory findings on the ACCEPTED draft — burstiness and repeated openers.
   * Non-blocking by design, and surfaced rather than swallowed so the composer
   * can show "this reads a little flat" without refusing to hand it over.
   */
  readonly advisories: readonly HumanizeFinding[];
}

export const GENERATION_REFUSED_MESSAGE =
  'Shoogle drafted this a few times. Each version either invented something about your business, ' +
  'read like it was written by a machine, or stopped halfway through. ' +
  'Nothing was saved. Try adding a bit more detail about what you want to say.';

/**
 * Draft copy for ONE platform.
 *
 * One platform per call, deliberately: three platforms are three prompts and
 * three independent verdicts, and a shared call would tempt a shared draft.
 * Product rule 13's shape, applied to generation.
 */
export function createSocialGenerator(deps: SocialGeneratorDeps) {
  const maxAttempts = deps.maxAttempts ?? 3;
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    async draftFor(
      platform: Platform,
      context: BusinessContext,
      objective: ContentObjective,
      options: PromptOptions = {},
    ): Result<PlatformDraft> {
      const readiness = deps.ai.readiness();
      if (readiness.status === 'blocked') {
        return unavailable(readiness.reason, readiness.message);
      }

      const instruction = promptFor(platform, context, objective, options);
      let lastVerdict: DraftVerdict | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const request: AiTextRequest = {
          task: 'social_caption',
          instruction: attempt === 0 ? instruction : `${instruction}\n\n${redraftNote(lastVerdict)}`,
          /*
           * Classified at the call site, and `fixtureInput` is the ONLY
           * classification this path constructs. Real customer data needs
           * `customerInput`, which no provider accepts today — see
           * `features/seo/ai/contract.ts`. When that changes it will be a
           * deliberate edit here, not a default that drifted.
           */
          input: fixtureInput(objective.brief),
          maxOutputChars: 1400,
        };

        const state = await deps.ai.generateText(request);
        const result = unwrapOrNull(state);
        if (result === null) {
          // Pass the provider's own state through rather than replacing it:
          // "rate limited" and "no key set" are different problems and the
          // engineer reading this needs to know which one happened.
          return state as ReturnType<typeof unavailable>;
        }

        const text = result.text.trim();
        const verdict = judgeDraft(text, context);
        lastVerdict = verdict;

        if (verdict.accepted) {
          return ready<PlatformDraft>(
            {
              platform,
              caption: captionFrom(text, objective.language, result.model),
              modelId: result.model,
              generatedAt: now(),
              advisories: verdict.humanness.filter((finding) => !finding.blocking),
            },
            now(),
            result.derivedFromFixtureData,
          );
        }
      }

      /*
       * Every attempt failed. Nothing is returned and nothing is stored.
       *
       * Handing over the least-bad draft with a warning attached would be the
       * comfortable option and the wrong one: a warning beside a caption that
       * LOOKS finished gets dismissed, and the invented fact goes out anyway.
       */
      return failed(
        'generation_refused',
        `${GENERATION_REFUSED_MESSAGE}${describeFailure(lastVerdict)}`,
        true,
      );
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Turn model text into a `Caption`, preserving provenance.
 *
 * `origin: 'generated'` and `generatedBy` are set here and nowhere else on this
 * path. A generated caption can later become `generated_edited` when the owner
 * touches it, but it can never become `owner` — see `captions.ts`.
 */
function captionFrom(text: string, language: CaptionLanguage, modelId: string): Caption {
  const hashtags = normaliseHashtags(extractInlineHashtags(text));
  const body = text
    .split('\n')
    .filter((line) => !/^\s*(#[\p{L}\p{M}\p{N}_]+\s*)+$/u.test(line))
    .join('\n')
    .trim();

  return {
    body: body.length > 0 ? body : text,
    hashtags,
    language,
    origin: 'generated',
    generatedBy: modelId,
  };
}

/** What to tell the model about its previous attempt. */
function redraftNote(verdict: DraftVerdict | null): string {
  if (verdict === null) return '';
  const problems = [
    ...verdict.completeness.map((finding) => `- ${finding.message}`),
    ...verdict.fabrication.map((finding) => `- ${finding.message}`),
    ...verdict.humanness.filter((f) => f.blocking).map((finding) => `- ${finding.message}`),
  ];

  const note = [
    'YOUR PREVIOUS ATTEMPT WAS REJECTED',
    ...problems,
    'Write it again. Fix these specifically; do not simply rephrase.',
  ];

  /*
   * A truncated attempt is a LENGTH problem, not a content one. Told only to
   * "fix it", a model rewrites at the same length and gets cut off in the same
   * place, so every retry burns a call and fails identically.
   */
  if (verdict.completeness.length > 0) {
    note.push('Your last answer was cut off. Write a SHORTER post that finishes properly.');
  }

  return note.join('\n');
}

/** A short, engineer-facing tail on the refusal, so a log says which guard fired. */
function describeFailure(verdict: DraftVerdict | null): string {
  if (verdict === null) return '';
  const codes = [
    ...verdict.completeness.map((finding) => finding.code),
    ...verdict.fabrication.map((finding) => finding.code),
    ...verdict.humanness.filter((f) => f.blocking).map((finding) => finding.code),
  ];
  return codes.length === 0 ? '' : ` (last rejection: ${[...new Set(codes)].join(', ')})`;
}
