import { request as httpRequest } from 'node:http';

import { isReady, unwrapOrNull } from '@/lib/state/DataState';

import {
  createDevProxyAiProvider,
  createSocialGenerator,
  instagramContent,
  judgeDraft,
  reviewInstagramContent,
  type BusinessContext,
  type ContentObjective,
  type MediaAsset,
} from '../index';

/**
 * THE ONE LIVE TEST.
 *
 * Every other test in this feature runs against an injected fake provider. This
 * one makes a real network call, so it is SKIPPED unless explicitly enabled:
 *
 *     RUN_LIVE_AI=1 npx jest features/social/__tests__/live-gemini.test.ts
 *
 * and it needs `tools/dev-ai-proxy/server.js` running, holding the key.
 *
 * It is gated rather than deleted because "does the whole path work" is a
 * question worth being able to re-ask after any change to the generator, the
 * guards or the proxy — and because a path nobody can re-verify is one that
 * quietly rots.
 *
 * WHAT IS AND IS NOT OVERRIDDEN
 * -----------------------------
 * `isDev` and `isFixtureMode` are forced true. Those two gates exist to stop a
 * RELEASE BINARY reaching the network; a test runner is neither a release
 * binary nor a phone, and leaving them to whatever the runner happens to report
 * would make this test flaky rather than safe.
 *
 * The guards that actually protect data are NOT touched: the classification
 * check and the `[FIXTURE]` marker check run untouched on the device side, and
 * again inside the proxy, on the machine that holds the key.
 *
 * ALL DATA BELOW IS INVENTED. "Tilak Road Hair Studio" does not exist.
 */

const LIVE = process.env['RUN_LIVE_AI'] === '1';
const PROXY_URL = process.env['LIVE_AI_PROXY_URL'] ?? 'http://127.0.0.1:8788';

/** Invented business. Every string carries the marker; none of it is real. */
const FIXTURE_BUSINESS: BusinessContext = {
  businessId: 'fixture-business-live-1',
  name: '[FIXTURE] Tilak Road Hair Studio',
  category: 'salon',
  locality: '[FIXTURE] Vashi',
  city: '[FIXTURE] Navi Mumbai',
  services: ['[FIXTURE] haircut', '[FIXTURE] hair colour'],
  keywords: ['[FIXTURE] haircut'],
  audience: null,
  offer: null, // No offer: the model may not mention a discount.
  hours: null, // No hours: the model may not claim they are open late.
};

const FIXTURE_OBJECTIVE: ContentObjective = {
  kind: 'promote_service',
  // This string is the PAYLOAD — the thing both marker checks read.
  brief: '[FIXTURE] weekday mornings are quiet, a good time for a colour appointment',
  language: 'en',
  platforms: ['instagram'],
};

/**
 * A real HTTP client, over a real socket.
 *
 * jest-expo installs React Native's `fetch` polyfill, which is built on
 * XMLHttpRequest and cannot open a socket in this environment. `ProxyFetch` is
 * an injection point on the provider for exactly this reason, so the test
 * supplies a Node-backed client rather than the provider growing an escape
 * hatch.
 *
 * NOTE what this therefore does NOT cover: React Native's own fetch. Everything
 * from the proxy outwards is real; the last hop from a phone is verified by
 * running the app, not by this test.
 */
const nodeFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) =>
  new Promise<{ status: number; text(): Promise<string> }>((resolve, reject) => {
    const target = new URL(url);
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: init.method,
        headers: { ...init.headers, 'content-length': Buffer.byteLength(init.body) },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          raw += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: async () => raw }));
      },
    );
    req.on('error', reject);
    req.write(init.body);
    req.end();
  });

function fixtureImage(): MediaAsset {
  return {
    id: 'fixture-live-image',
    kind: 'image',
    format: 'jpeg',
    uri: 'https://example.invalid/fixture.jpg',
    width: 1080,
    height: 1350,
    byteSize: 400_000,
    durationSeconds: null,
    altText: '[FIXTURE] placeholder image.',
  };
}

(LIVE ? describe : describe.skip)('live: the whole generation path', () => {
  it(
    'generates Instagram copy through provider → proxy → Gemini → guards → content',
    async () => {
      /* 1. The provider. Real fetch, real proxy, real model behind it. */
      const ai = createDevProxyAiProvider({
        isDev: () => true,
        isFixtureMode: () => true,
        readProxyUrl: () => PROXY_URL,
        fetchImpl: nodeFetch,
      });

      expect(ai.readiness().status).toBe('ready');

      /* 2. The generator — the same one the composer will use. */
      const generator = createSocialGenerator({ ai, maxAttempts: 3 });

      const state = await generator.draftFor('instagram', FIXTURE_BUSINESS, FIXTURE_OBJECTIVE);

      if (!isReady(state)) {
        throw new Error(
          `Generation did not succeed: ${state.status} — ${
            'message' in state ? state.message : ''
          }`,
        );
      }

      const draft = unwrapOrNull(state);
      expect(draft).not.toBeNull();
      if (draft === null) return;

      /* 3. Provenance survived the round trip. */
      expect(draft.caption.origin).toBe('generated');
      expect(draft.caption.generatedBy).toBeTruthy();
      expect(draft.caption.body.trim().length).toBeGreaterThan(0);

      /* 4. The guards ran on the real output and accepted it. `draftFor` only
            returns ready when they do, so re-running them here proves the
            returned text is the text that passed. */
      const verdict = judgeDraft(draft.caption.body, FIXTURE_BUSINESS);
      expect(verdict.fabrication).toEqual([]);
      expect(verdict.accepted).toBe(true);

      /* 5. The end of the path: a real InstagramContent that passes platform
            validation, which is what the publisher would be handed. */
      const content = instagramContent(draft.caption, {
        kind: 'single_image',
        image: fixtureImage(),
        altText: '[FIXTURE] placeholder image.',
      });
      const review = reviewInstagramContent(content);
      expect(review.issues).toEqual([]);
      expect(review.ok).toBe(true);

      /* 6. Report. Model output is fixture-derived and safe to show. */
      // eslint-disable-next-line no-console
      console.log(
        [
          '',
          '--- LIVE RESULT -------------------------------------------------',
          `model:        ${draft.modelId}`,
          `origin:       ${draft.caption.origin}`,
          `hashtags:     ${draft.caption.hashtags.join(', ') || '(none)'}`,
          `advisories:   ${draft.advisories.map((a) => a.code).join(', ') || '(none)'}`,
          `fixture-derived: ${state.isFixture === true}`,
          '--- caption -----------------------------------------------------',
          draft.caption.body,
          '-----------------------------------------------------------------',
          '',
        ].join('\n'),
      );
    },
    60_000,
  );
});
