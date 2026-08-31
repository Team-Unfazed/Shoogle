/**
 * Gemini free-tier client — DEVELOPMENT ONLY. Owner: Pranay.
 *
 * ============================================================================
 * READ THIS BEFORE CHANGING ANYTHING IN THIS FILE
 * ============================================================================
 *
 * This client talks to Google's generative language API directly from the
 * device. That is acceptable ONLY as a development tool, and the file is
 * written so that it cannot become anything else by accident.
 *
 * ## 1. The key is never public
 *
 * The variable is `GEMINI_API_KEY`. It must NEVER be renamed to
 * `EXPO_PUBLIC_GEMINI_API_KEY`. Expo inlines every `EXPO_PUBLIC_*` variable
 * into the JavaScript bundle, and the bundle ships inside the APK, and an APK
 * is a zip file anyone can download and unzip. A key in there is not a secret;
 * it is a published credential attached to a billing account.
 *
 * Because `GEMINI_API_KEY` is NOT prefixed, Expo does not inline it, so on a
 * real device `process.env.GEMINI_API_KEY` is `undefined` and this client
 * reports `not_connected`. That is the intended outcome, not a bug: the only
 * environments where it can work are ones with a real `process.env` — a Jest
 * run or a Node script on an engineer's machine.
 *
 * `assertNoPublicGeminiKey()` exists so that if somebody ever adds the public
 * variant, the client refuses to run and says why, rather than quietly working
 * and shipping the key.
 *
 * ## 2. It is dev-gated exactly like fixtures
 *
 * `__DEV__` plus `isFixtureModeEnabled()` — the same gate `fixtures/index.ts`
 * uses. Both non-development EAS profiles force fixture mode off, so a release
 * binary cannot reach the network call at all. In a release build every method
 * returns `unavailable('not_supported', …)`.
 *
 * ## 3. It refuses real customer data, in code
 *
 * The chosen tier is the FREE tier, whose terms permit Google to use submitted
 * content to improve its products. Sending a real salon's customer data there
 * would be a privacy failure regardless of how carefully it was worded in a
 * comment, so the refusal is executable:
 *
 *   a. the request's `classification` must be `'fixture'`, and
 *   b. `request.input.payload` — the classified material itself — must actually
 *      contain the `[FIXTURE]` marker.
 *
 * (b) is what makes (a) more than a promise: mislabelling a real business's
 * data as `fixture` still fails, because real data does not carry the marker.
 *
 * (b) is checked against the PAYLOAD ONLY, never against the rendered prompt.
 * The instruction is written by us and carries no classification, so a marker
 * appearing there says nothing about the data. Checking the rendered prompt
 * would mean any instruction that happened to contain the marker — a prompt
 * that quotes this rule, for instance — waved a real business's payload
 * through. Do not "simplify" this back to the concatenated string.
 *
 * ## 4. Production needs a server-side proxy that does not exist
 *
 * Shipping AI generation to customers requires a Supabase edge function holding
 * the key server-side, on a paid tier whose terms allow customer data. That is
 * `lib/`/backend work and belongs to Sunny. Until it exists, `noAiProvider`
 * from `./contract` is what production gets, and it honestly reports that the
 * feature is not built.
 */

import { isFixtureModeEnabled } from '@/lib/env';
import { failed, ready, unavailable } from '@/lib/state/DataState';
import type { Result } from '@/lib/providers/types';
import {
  aiBlocked,
  AI_READY,
  FIXTURE_MARKER,
  type AiProvider,
  type AiReadiness,
  type AiTextRequest,
  type AiTextResult,
} from './contract';

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** The ONLY accepted variable name. Never prefix this with `EXPO_PUBLIC_`. */
export const GEMINI_KEY_VARIABLE = 'GEMINI_API_KEY';

/** The name that must never exist. Its presence is treated as an incident. */
export const FORBIDDEN_PUBLIC_KEY_VARIABLE = 'EXPO_PUBLIC_GEMINI_API_KEY';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Hard cap on what leaves the device, so a runaway prompt cannot be assembled. */
const MAX_PROMPT_CHARS = 8000;

/* -------------------------------------------------------------------------- */
/* Owner/engineer-facing refusal copy                                          */
/* -------------------------------------------------------------------------- */

export const REFUSAL_NOT_DEV =
  'On-device AI generation is a development tool only. It is switched off in this build.';

export const REFUSAL_FIXTURE_MODE_OFF =
  'On-device AI generation only runs against development fixture data, and fixture mode is off.';

export const REFUSAL_NOT_FIXTURE_DATA =
  'This request carries real business data. The free Gemini tier may use what is sent to it to ' +
  'improve Google’s products, so Shoogle will not send a customer’s data there. This needs the ' +
  'server-side proxy, which is not built yet.';

export const REFUSAL_MISSING_MARKER =
  `This request is labelled as fixture data but its data does not carry the ${FIXTURE_MARKER} ` +
  'marker, so it cannot be confirmed as safe to send. Refusing.';

export const REFUSAL_PUBLIC_KEY =
  `${FORBIDDEN_PUBLIC_KEY_VARIABLE} is defined. Anything with that prefix is compiled into the app ` +
  'and readable by anyone who downloads it. Remove the variable and rotate that key.';

export const REFUSAL_NO_KEY =
  `${GEMINI_KEY_VARIABLE} is not set in this environment, so there is nothing to call.`;

/* -------------------------------------------------------------------------- */
/* Injectable runtime                                                         */
/* -------------------------------------------------------------------------- */

/** Minimal shape of a fetch response, so no DOM lib types are required. */
export interface GeminiResponseLike {
  readonly status: number;
  text(): Promise<string>;
}

export type GeminiFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<GeminiResponseLike>;

/**
 * Every environmental dependency, injectable so tests can exercise each guard
 * in isolation. The defaults read live globals on each call — nothing is
 * captured at import time, so flipping `__DEV__` changes behaviour immediately.
 */
export interface GeminiRuntime {
  readonly isDev: () => boolean;
  readonly isFixtureMode: () => boolean;
  /** Reads the non-public key. Returns null when absent. */
  readonly readApiKey: () => string | null;
  /** True when someone added the forbidden public variable. */
  readonly hasPublicKey: () => boolean;
  readonly fetchImpl: GeminiFetch | null;
  readonly now: () => string;
  readonly model: string;
}

function readEnv(name: string): string | null {
  const source: Record<string, string | undefined> =
    typeof process !== 'undefined' && process.env !== undefined ? process.env : {};
  const value = source[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * True when the forbidden public variable exists.
 *
 * Exported so a diagnostics screen can surface it. It reports only presence —
 * it never returns, logs or renders the value.
 */
export function assertNoPublicGeminiKey(): boolean {
  return readEnv(FORBIDDEN_PUBLIC_KEY_VARIABLE) !== null;
}

export function defaultGeminiRuntime(): GeminiRuntime {
  return {
    isDev: () => __DEV__,
    isFixtureMode: () => isFixtureModeEnabled(),
    readApiKey: () => readEnv(GEMINI_KEY_VARIABLE),
    hasPublicKey: () => assertNoPublicGeminiKey(),
    fetchImpl: typeof fetch === 'function' ? (fetch as unknown as GeminiFetch) : null,
    now: () => new Date().toISOString(),
    model: DEFAULT_GEMINI_MODEL,
  };
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The exact string that will be sent to the model.
 *
 * FOR SENDING AND FOR MEASURING SIZE ONLY. No safety guard may be evaluated
 * against this string: it mixes our instruction (unclassified) with the
 * caller's payload (classified), so any check against it can be satisfied by
 * the half that carries no data. Classification guards read
 * `request.input` directly.
 */
function renderPrompt(request: AiTextRequest): string {
  return `${request.instruction}\n\n---\n\n${request.input.payload}`;
}

/**
 * Every reason this client may refuse, checked in order of severity, before any
 * network call and before the key is even read.
 *
 * Returned as a readiness rather than thrown, so a screen can render the
 * reason. Environment checks only — content checks happen per request.
 */
function environmentReadiness(runtime: GeminiRuntime): AiReadiness {
  if (!runtime.isDev()) return aiBlocked('not_supported', REFUSAL_NOT_DEV);
  if (runtime.hasPublicKey()) return aiBlocked('not_supported', REFUSAL_PUBLIC_KEY);
  if (!runtime.isFixtureMode()) return aiBlocked('not_supported', REFUSAL_FIXTURE_MODE_OFF);
  if (runtime.readApiKey() === null) return aiBlocked('not_connected', REFUSAL_NO_KEY);
  if (runtime.fetchImpl === null) {
    return aiBlocked('not_supported', 'No network client is available in this environment.');
  }
  return AI_READY;
}

/* -------------------------------------------------------------------------- */
/* Response parsing                                                           */
/* -------------------------------------------------------------------------- */

interface GeminiPart {
  readonly text?: unknown;
}
interface GeminiCandidate {
  readonly content?: { readonly parts?: readonly GeminiPart[] };
  readonly finishReason?: unknown;
}
interface GeminiPayload {
  readonly candidates?: readonly GeminiCandidate[];
  readonly promptFeedback?: { readonly blockReason?: unknown };
}

function firstText(payload: GeminiPayload): string | null {
  const candidate = payload.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const texts = parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter((value) => value.length > 0);
  const joined = texts.join('').trim();
  return joined.length > 0 ? joined : null;
}

/* -------------------------------------------------------------------------- */
/* The provider                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build the development client.
 *
 * Overrides exist for tests. In app code, call it with no arguments so the real
 * gates apply.
 */
export function createGeminiAiProvider(overrides: Partial<GeminiRuntime> = {}): AiProvider {
  const resolve = (): GeminiRuntime => ({ ...defaultGeminiRuntime(), ...overrides });

  return {
    id: 'gemini_free_dev',
    displayName: 'Gemini (development only)',

    readiness(): AiReadiness {
      return environmentReadiness(resolve());
    },

    async generateText(request: AiTextRequest): Result<AiTextResult> {
      const runtime = resolve();

      /* Guard 1-4: environment. Nothing is read or sent until these pass. */
      const readiness = environmentReadiness(runtime);
      if (readiness.status === 'blocked') {
        return unavailable(readiness.reason, readiness.message);
      }

      /* Guard 5: the request must declare itself as fixture data. */
      if (request.input.classification !== 'fixture') {
        return unavailable('not_supported', REFUSAL_NOT_FIXTURE_DATA);
      }

      /* Guard 6: and the DATA must actually look like fixture data. A
         declaration alone is a promise; this checks it.

         Checked against `request.input.payload` — the material the
         classification covers — and deliberately NOT against the rendered
         prompt. The instruction is ours and is not classified data, so a
         marker in it proves nothing; checking the concatenation would let any
         instruction carrying the marker escort a real business's payload to a
         free-tier endpoint. An empty payload also fails here, which is
         correct: nothing to confirm means nothing to send. */
      if (!request.input.payload.includes(FIXTURE_MARKER)) {
        return unavailable('not_supported', REFUSAL_MISSING_MARKER);
      }

      /* The size cap is measured on the rendered prompt because the rendered
         prompt is what actually leaves the device. */
      const prompt = renderPrompt(request);
      if (prompt.length > MAX_PROMPT_CHARS) {
        return unavailable(
          'not_supported',
          'That is too much text to send in one request. Split it up.',
        );
      }

      const apiKey = runtime.readApiKey();
      const fetchImpl = runtime.fetchImpl;
      if (apiKey === null || fetchImpl === null) {
        // environmentReadiness already covered this; re-checked so the types
        // narrow without a non-null assertion.
        return unavailable('not_connected', REFUSAL_NO_KEY);
      }

      const url = `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(runtime.model)}:generateContent`;
      const body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: Math.max(64, Math.ceil((request.maxOutputChars ?? 1200) / 3)),
        },
      });

      let response: GeminiResponseLike;
      let raw: string;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          // The key travels in a header, never in the URL, so it cannot end up
          // in a log line, a redirect or a crash report.
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body,
        });
        raw = await response.text();
      } catch {
        return unavailable('offline', 'Could not reach the model. Check your connection.');
      }

      if (response.status === 429) {
        return unavailable('rate_limited', 'The free tier limit was reached. Try again later.');
      }
      if (response.status === 401 || response.status === 403) {
        return failed('gemini_unauthorized', `${GEMINI_KEY_VARIABLE} was rejected.`, false);
      }
      if (response.status < 200 || response.status >= 300) {
        return failed('gemini_http_error', `The model returned status ${response.status}.`, true);
      }

      let payload: GeminiPayload;
      try {
        payload = JSON.parse(raw) as GeminiPayload;
      } catch {
        return failed('gemini_unparseable', 'The model returned something unreadable.', true);
      }

      if (payload.promptFeedback?.blockReason !== undefined) {
        return unavailable('not_supported', 'The model declined to answer this prompt.');
      }

      const text = firstText(payload);
      if (text === null) {
        // Not a success. Returning an empty string here would let a caller
        // render a blank result as if the model had produced one.
        return failed('gemini_empty_response', 'The model returned no text.', true);
      }

      const fetchedAt = runtime.now();
      // isFixture is true because the only input this client accepts is fixture
      // data, so anything derived from it is fixture data too.
      return ready<AiTextResult>(
        {
          task: request.task,
          text,
          model: runtime.model,
          provider: 'gemini_free_dev',
          derivedFromFixtureData: true,
        },
        fetchedAt,
        true,
      );
    },
  };
}

/**
 * The shared development instance.
 *
 * Safe to import from anywhere: constructing it performs no I/O and reads no
 * key, and every guard runs per call.
 */
export const geminiAiProvider: AiProvider = createGeminiAiProvider();
