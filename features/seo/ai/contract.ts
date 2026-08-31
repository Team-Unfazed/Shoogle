/**
 * The AI provider seam. Owner: Pranay.
 *
 * Every model-backed surface in `features/seo` is written against `AiProvider`
 * and never against a vendor SDK, so that:
 *
 *   - the free-tier development client and a future server-side proxy are
 *     interchangeable without touching a single screen, and
 *   - the safety guards live in ONE place that every surface must go through.
 *
 * ## What is and is not "AI" here
 *
 * Most of what this feature does needs no model at all. The AI visibility
 * check, the schema generator, the directory checklist and the readability
 * observations are deterministic analyses of text the owner already has. They
 * live in sibling modules, take no `AiProvider`, cost nothing and cannot
 * hallucinate. That is deliberate: a model is used only where generation is
 * genuinely required, and it is always clearly labelled as one model's output.
 *
 * ## The data-classification guard
 *
 * The only implementation that exists today is the free-tier Gemini client,
 * whose terms permit the provider to use submitted content to improve its
 * products. That makes it unsuitable for a real customer's business data, so
 * this contract does not let a caller hand over an unlabelled string: input
 * arrives inside an `AiRequestEnvelope` carrying an explicit classification,
 * and implementations are required to refuse anything that is not fixture data.
 *
 * The guard is enforced twice on purpose — once on the declared classification
 * and once on the payload's own content — because a declaration is a promise
 * and a promise can be wrong. Both checks read `AiRequestEnvelope`; neither may
 * be evaluated against a rendered prompt, where our own instruction text could
 * satisfy a check that is supposed to be about the caller's data.
 */

import { unavailable, type UnavailableReason, type UnavailableState } from '@/lib/state/DataState';
import type { Result } from '@/lib/providers/types';

/* -------------------------------------------------------------------------- */
/* Data classification                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What kind of data a request carries.
 *
 * There is no 'anonymised' or 'probably fine' member, because in practice those
 * become the default and the guard stops guarding.
 */
export type AiDataClassification =
  /** Invented development data from `fixtures/`. Safe to send anywhere. */
  | 'fixture'
  /** A real business's data. Never sent to a free-tier endpoint. */
  | 'customer';

/**
 * The visible marker every fixture value carries (see `fixtures/README.md`).
 *
 * The Gemini client checks for it in `AiRequestEnvelope.payload` — the data the
 * classification actually covers — so mislabelling real data as `fixture` still
 * fails. It is deliberately NOT checked against the instruction or against the
 * two concatenated: the instruction is written by us, carries no
 * classification, and a marker in it would prove nothing about the payload.
 */
export const FIXTURE_MARKER = '[FIXTURE]';

export interface AiRequestEnvelope<T> {
  readonly classification: AiDataClassification;
  readonly payload: T;
}

/** Wrap development fixture data. The only classification any free-tier client accepts. */
export function fixtureInput<T>(payload: T): AiRequestEnvelope<T> {
  return { classification: 'fixture', payload };
}

/**
 * Wrap a real business's data.
 *
 * Nothing today accepts this, and that is the correct state of the world: it
 * needs the server-side proxy that does not exist yet. Constructing one is
 * still useful, because it means the call sites for the production feature can
 * be written and reviewed now and will fail loudly rather than silently leak.
 */
export function customerInput<T>(payload: T): AiRequestEnvelope<T> {
  return { classification: 'customer', payload };
}

/* -------------------------------------------------------------------------- */
/* Readiness                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether a provider may run at all, decided synchronously and without I/O so a
 * screen can render the honest state before it does anything.
 */
export type AiReadiness =
  | { readonly status: 'ready' }
  | {
      readonly status: 'blocked';
      readonly reason: UnavailableReason;
      /** Owner-facing. Must not name a key, a header or an endpoint. */
      readonly message: string;
    };

export const AI_READY: AiReadiness = { status: 'ready' };

export function aiBlocked(reason: UnavailableReason, message: string): AiReadiness {
  return { status: 'blocked', reason, message };
}

/** Turn a blocked readiness into the `DataState` a screen renders. */
export function readinessToUnavailable(readiness: AiReadiness): UnavailableState | null {
  return readiness.status === 'blocked'
    ? unavailable(readiness.reason, readiness.message)
    : null;
}

/* -------------------------------------------------------------------------- */
/* Requests and results                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The generation jobs this feature has a use for. A closed union rather than a
 * free-form prompt field, so that every prompt shipped is reviewable in the
 * repository instead of assembled at a call site.
 */
export type AiTask =
  /** Draft a Business Profile description from known facts. */
  | 'business_description'
  /** Rewrite one over-long passage into self-contained paragraphs. */
  | 'passage_rewrite'
  /** Draft the `description` property for LocalBusiness JSON-LD. */
  | 'schema_description'
  /** Ask a model a question a customer would ask, and show what it said. */
  | 'answer_probe'
  /**
   * Draft a reply to one Google review.
   *
   * The draft is never sent anywhere on its own: the owner reads it, edits it,
   * and submits it themselves, and Google then moderates what they submitted.
   * Added for `app/seo/review-reply.tsx`.
   */
  | 'review_reply';

export interface AiTextRequest {
  readonly task: AiTask;
  /** What the model is being asked to do. Written by us, never by the owner. */
  readonly instruction: string;
  /** The material to work from, with its classification attached. */
  readonly input: AiRequestEnvelope<string>;
  /** Soft cap on the reply. Implementations may translate it to a token budget. */
  readonly maxOutputChars?: number;
}

export interface AiTextResult {
  readonly task: AiTask;
  readonly text: string;
  /** Exact model identifier that produced the text. Shown in the UI caption. */
  readonly model: string;
  readonly provider: AiProviderId;
  /**
   * Always true for anything this contract can currently produce, because the
   * only accepted input class is fixture data. It exists as a field so the flag
   * travels with the value into `ready(value, at, isFixture)`.
   */
  readonly derivedFromFixtureData: boolean;
}

export type AiProviderId = 'gemini_free_dev' | 'none';

export interface AiProvider {
  readonly id: AiProviderId;
  readonly displayName: string;
  /**
   * May this provider run right now? Synchronous and side-effect free, so a
   * screen can decide what to render without starting a request.
   */
  readiness(): AiReadiness;
  /**
   * Generate text. Implementations MUST refuse any request whose input is not
   * classified `fixture` and MUST NOT partially succeed: either a `ready`
   * result with real model output, or a non-ready state explaining why not.
   */
  generateText(request: AiTextRequest): Result<AiTextResult>;
}

/* -------------------------------------------------------------------------- */
/* The honest default                                                         */
/* -------------------------------------------------------------------------- */

export const NO_AI_PROVIDER_MESSAGE =
  'Shoogle cannot generate this yet. It needs a Shoogle server to talk to the model on your behalf, ' +
  'which is not built.';

/**
 * The provider a production build gets: none.
 *
 * It is not a stub that pretends — it reports `blocked` and returns
 * `unavailable`, which is exactly what is true. Surfaces written against
 * `AiProvider` can therefore ship today and render the correct empty state,
 * and gain real behaviour the day a server-side implementation is registered.
 */
export const noAiProvider: AiProvider = {
  id: 'none',
  displayName: 'No AI provider',
  readiness(): AiReadiness {
    return aiBlocked('not_connected', NO_AI_PROVIDER_MESSAGE);
  },
  async generateText(_request: AiTextRequest) {
    return unavailable('not_connected', NO_AI_PROVIDER_MESSAGE);
  },
};
