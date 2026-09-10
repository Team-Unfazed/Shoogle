/**
 * An `AiProvider` that talks to the local development proxy. Owner: Yash.
 *
 * ====================== WHY THIS IS NOT A SECOND CLIENT ====================
 *
 * It implements Pranay's `AiProvider` interface and nothing else. It holds no
 * key, knows no Google endpoint, and duplicates none of the Gemini client's
 * logic — it posts a prompt to `http://<lan-address>/generate` and returns what
 * comes back. The model call itself happens in `tools/dev-ai-proxy/server.js`,
 * in a Node process on the engineer's machine.
 *
 * So there is still exactly one place a key is read, and it is not in the app.
 *
 * ========================== THE GUARDS RUN TWICE ===========================
 *
 * This provider enforces the fixture-only classification, AND the proxy
 * enforces it again on the machine that holds the key. That is not belt and
 * braces for its own sake: a check running on a device is a check an attacker
 * — or a future refactor — can skip, so the authoritative one has to be the
 * one next to the credential. If these ever disagree, the proxy wins.
 *
 * ============================ DEV-GATED, HARD ==============================
 *
 * `__DEV__` plus fixture mode, exactly like the Gemini client. Both
 * non-development EAS profiles force fixture mode off, so a release build
 * cannot reach the network call. The proxy URL itself is `EXPO_PUBLIC_` because
 * a LAN address is not a credential — but an unset one simply means no proxy,
 * not a fallback to anything.
 */

import { isFixtureModeEnabled } from '@/lib/env';
import { failed, ready, unavailable } from '@/lib/state/DataState';
import type { Result } from '@/lib/providers/types';
import {
  AI_READY,
  aiBlocked,
  FIXTURE_MARKER,
  type AiProvider,
  type AiReadiness,
  type AiTextRequest,
  type AiTextResult,
} from '@/features/seo/ai';

/** A LAN address, not a secret — hence the public prefix is correct here. */
export const DEV_PROXY_URL_VARIABLE = 'EXPO_PUBLIC_DEV_AI_PROXY_URL';

export const REFUSAL_NOT_DEV =
  'The development AI proxy is a development tool only. It is switched off in this build.';

export const REFUSAL_FIXTURE_MODE_OFF =
  'The development AI proxy only runs against fixture data, and fixture mode is off.';

export const REFUSAL_NO_PROXY_URL =
  `${DEV_PROXY_URL_VARIABLE} is not set, so there is no development proxy to call. Start ` +
  'tools/dev-ai-proxy/server.js and set that variable to your machine’s LAN address.';

export const REFUSAL_NOT_FIXTURE_DATA =
  'This request carries real business data. The development proxy forwards fixture data only.';

export const REFUSAL_MISSING_MARKER =
  `This request is labelled as fixture data but its data does not carry the ${FIXTURE_MARKER} ` +
  'marker, so it cannot be confirmed as safe to send. Refusing.';

interface ProxyResponseLike {
  readonly status: number;
  text(): Promise<string>;
}

export type ProxyFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<ProxyResponseLike>;

export interface DevProxyRuntime {
  readonly isDev: () => boolean;
  readonly isFixtureMode: () => boolean;
  /** The LAN URL, or null when unset. Never a credential. */
  readonly readProxyUrl: () => string | null;
  readonly fetchImpl: ProxyFetch | null;
  readonly now: () => string;
  readonly model: string;
}

function readPublicEnv(name: string): string | null {
  const source: Record<string, string | undefined> =
    typeof process !== 'undefined' && process.env !== undefined ? process.env : {};
  const value = source[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function defaultDevProxyRuntime(): DevProxyRuntime {
  return {
    isDev: () => __DEV__,
    isFixtureMode: () => isFixtureModeEnabled(),
    readProxyUrl: () => readPublicEnv(DEV_PROXY_URL_VARIABLE),
    fetchImpl: typeof fetch === 'function' ? (fetch as unknown as ProxyFetch) : null,
    now: () => new Date().toISOString(),
    model: 'gemini-2.5-flash',
  };
}

function environmentReadiness(runtime: DevProxyRuntime): AiReadiness {
  if (!runtime.isDev()) return aiBlocked('not_supported', REFUSAL_NOT_DEV);
  if (!runtime.isFixtureMode()) return aiBlocked('not_supported', REFUSAL_FIXTURE_MODE_OFF);
  if (runtime.readProxyUrl() === null) return aiBlocked('not_connected', REFUSAL_NO_PROXY_URL);
  if (runtime.fetchImpl === null) {
    return aiBlocked('not_supported', 'No network client is available in this environment.');
  }
  return AI_READY;
}

export function createDevProxyAiProvider(overrides: Partial<DevProxyRuntime> = {}): AiProvider {
  const resolve = (): DevProxyRuntime => ({ ...defaultDevProxyRuntime(), ...overrides });

  return {
    id: 'gemini_free_dev',
    displayName: 'Gemini via local dev proxy (development only)',

    readiness(): AiReadiness {
      return environmentReadiness(resolve());
    },

    async generateText(request: AiTextRequest): Result<AiTextResult> {
      const runtime = resolve();

      const readiness = environmentReadiness(runtime);
      if (readiness.status === 'blocked') {
        return unavailable(readiness.reason, readiness.message);
      }

      if (request.input.classification !== 'fixture') {
        return unavailable('not_supported', REFUSAL_NOT_FIXTURE_DATA);
      }
      /*
       * Checked against the PAYLOAD only, never the rendered prompt — the same
       * rule as the Gemini client, for the same reason: our instruction text is
       * unclassified, so a marker in it proves nothing about the caller's data.
       */
      if (!request.input.payload.includes(FIXTURE_MARKER)) {
        return unavailable('not_supported', REFUSAL_MISSING_MARKER);
      }

      const url = runtime.readProxyUrl();
      const fetchImpl = runtime.fetchImpl;
      if (url === null || fetchImpl === null) {
        return unavailable('not_connected', REFUSAL_NO_PROXY_URL);
      }

      let response: ProxyResponseLike;
      let raw: string;
      try {
        response = await fetchImpl(`${url.replace(/\/+$/, '')}/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            instruction: request.instruction,
            payload: request.input.payload,
            classification: request.input.classification,
            model: runtime.model,
            maxOutputChars: request.maxOutputChars ?? 1200,
          }),
        });
        raw = await response.text();
      } catch {
        return unavailable(
          'offline',
          'Could not reach the development proxy. Is tools/dev-ai-proxy/server.js running, and is the phone on the same network?',
        );
      }

      if (response.status === 403) {
        // The proxy refused on its own account. Surfaced verbatim, because it
        // is the authoritative guard and its reason is the real one.
        return unavailable('not_supported', proxyMessage(raw) ?? REFUSAL_NOT_FIXTURE_DATA);
      }
      if (response.status === 429) {
        return unavailable('rate_limited', 'The free tier limit was reached. Try again later.');
      }
      if (response.status < 200 || response.status >= 300) {
        return failed('dev_proxy_error', proxyMessage(raw) ?? `Proxy returned ${response.status}.`, true);
      }

      let payload: { text?: unknown; model?: unknown };
      try {
        payload = JSON.parse(raw) as { text?: unknown; model?: unknown };
      } catch {
        return failed('dev_proxy_unparseable', 'The proxy returned something unreadable.', true);
      }

      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (text.length === 0) {
        return failed('dev_proxy_empty', 'The model returned no text.', true);
      }

      return ready<AiTextResult>(
        {
          task: request.task,
          text,
          model: typeof payload.model === 'string' ? payload.model : runtime.model,
          provider: 'gemini_free_dev',
          derivedFromFixtureData: true,
        },
        runtime.now(),
        true,
      );
    },
  };
}

function proxyMessage(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    return typeof parsed.message === 'string' ? parsed.message : null;
  } catch {
    return null;
  }
}
