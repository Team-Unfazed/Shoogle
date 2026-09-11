import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createDevProxyAiProvider,
  DEV_PROXY_URL_VARIABLE,
  REFUSAL_NO_PROXY_URL,
  type ProxyFetch,
} from '../index';

/**
 * KEY SAFETY.
 *
 * `GEMINI_API_KEY` has no `EXPO_PUBLIC_` prefix, so Expo does not inline it and
 * it cannot reach the bundle. That is one property holding up the whole
 * arrangement, and one property is not enough when the failure mode is a
 * published credential attached to a billing account — an APK is a zip anyone
 * can download and unzip.
 *
 * So it is asserted here, against the repository itself rather than against a
 * mock, and it fails the build rather than a review.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');

function tracked(pattern: string): string[] {
  try {
    // git grep searches TRACKED files only, which is the right scope: an
    // untracked .env.local is where the key is SUPPOSED to live.
    return execSync(`git grep -lIE ${JSON.stringify(pattern)} -- . ':!*__tests__*'`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((line) => line.trim() !== '');
  } catch {
    // git grep exits 1 when there are no matches. No matches is the pass.
    return [];
  }
}

describe('the Gemini key cannot reach the Expo bundle', () => {
  /**
   * THE LOAD-BEARING ASSERTION.
   *
   * Anything named `EXPO_PUBLIC_*` is compiled into the JavaScript bundle. A
   * generation key with that prefix is not a secret; it is a published
   * credential. Mentions of the forbidden name in a guard or a comment are
   * fine — an ASSIGNMENT is not.
   */
  it('never assigns EXPO_PUBLIC_GEMINI_API_KEY anywhere in tracked source', () => {
    const assignments = tracked('EXPO_PUBLIC_GEMINI_API_KEY[[:space:]]*=[[:space:]]*[^=]');
    expect(assignments).toEqual([]);
  });

  it('does not declare the forbidden variable in the env example', () => {
    const example = readFileSync(join(REPO_ROOT, '.env.local.example'), 'utf8');
    expect(example).not.toMatch(/^EXPO_PUBLIC_GEMINI/m);
    // The correct, unprefixed name is declared instead.
    expect(example).toMatch(/^GEMINI_API_KEY=/m);
  });

  it('keeps GEMINI_API_KEY out of lib/env, the only route to a public variable', () => {
    const env = readFileSync(join(REPO_ROOT, 'lib', 'env', 'index.ts'), 'utf8');
    expect(env).not.toMatch(/GEMINI/);
  });

  /**
   * The whole of `features/social` is written against `AiProvider` and holds no
   * credential. If this ever fails, a second door to a model has been opened
   * and the classification guards have been bypassed rather than reused.
   *
   * WHY THIS MATCHES A READ AND NOT THE NAME.
   *
   * The first version of this test searched for the string `GEMINI_API_KEY` and
   * failed the moment a comment said "this file does not read GEMINI_API_KEY" —
   * a doc promising the right thing was indistinguishable from code doing the
   * wrong thing. Naming the variable in prose is how the rule gets documented;
   * READING it is the violation. So the pattern is an environment access.
   */
  it('reads no API key anywhere in features/social', () => {
    const readers = tracked('(process\\.env|readEnv\\(|getenv)[^\\n]*GEMINI').filter((path) =>
      path.startsWith('features/social/'),
    );
    expect(readers).toEqual([]);
  });

  it('reads no environment variable at all in the generation layer', () => {
    // Stricter than the above and scoped to where generation lives: this layer
    // takes an `AiProvider` by injection and should touch no environment.
    // `devProxyProvider` is the one exception — it reads the public LAN URL.
    const readers = tracked('process\\.env')
      .filter((path) => path.startsWith('features/social/generation/'))
      .filter((path) => !path.endsWith('devProxyProvider.ts'));
    expect(readers).toEqual([]);
  });

  it('keeps the dev proxy out of the app, in tools/', () => {
    // Metro bundles from the project root but nothing imports tools/, so the
    // proxy never enters the bundle. Asserted, because "nothing imports it" is
    // exactly the kind of thing that stops being true quietly.
    const importers = tracked('from [\'"].*tools/dev-ai-proxy');
    expect(importers).toEqual([]);
  });

  it('git-ignores the file the key actually lives in', () => {
    const ignore = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(ignore).toMatch(/\.env\*?\.local|\.env\.local/);
  });
});

/* ========================================================================== */
/* The dev proxy provider                                                     */
/* ========================================================================== */

function proxyProvider(overrides: Parameters<typeof createDevProxyAiProvider>[0] = {}) {
  return createDevProxyAiProvider({
    isDev: () => true,
    isFixtureMode: () => true,
    readProxyUrl: () => 'http://192.168.1.20:8788',
    now: () => '2026-09-11T00:00:00.000Z',
    model: 'gemini-2.5-flash',
    ...overrides,
  });
}

const okFetch: ProxyFetch = async () => ({
  status: 200,
  text: async () => JSON.stringify({ text: 'Drafted copy.', model: 'gemini-2.5-flash' }),
});

const fixtureRequest = {
  task: 'social_caption' as const,
  instruction: 'Write a caption.',
  input: { classification: 'fixture' as const, payload: '[FIXTURE] quiet mornings' },
};

describe('the dev proxy provider holds no credential', () => {
  it('sends no authorization header of any kind', async () => {
    let sentHeaders: Record<string, string> = {};
    const provider = proxyProvider({
      fetchImpl: async (_url, init) => {
        sentHeaders = init.headers;
        return okFetch(_url, init);
      },
    });

    await provider.generateText(fixtureRequest);

    // The key lives in the Node process on the developer's machine. Nothing
    // resembling a credential leaves the device.
    expect(Object.keys(sentHeaders).map((k) => k.toLowerCase())).toEqual(['content-type']);
    expect(JSON.stringify(sentHeaders)).not.toMatch(/api[-_]?key|authorization|bearer|goog/i);
  });

  it('refuses customer-classified data before any request leaves', async () => {
    let called = false;
    const provider = proxyProvider({
      fetchImpl: async (u, i) => {
        called = true;
        return okFetch(u, i);
      },
    });

    const state = await provider.generateText({
      ...fixtureRequest,
      input: { classification: 'customer', payload: 'Real salon data' },
    });

    expect(state.status).toBe('unavailable');
    expect(called).toBe(false);
  });

  it('refuses data labelled fixture that does not carry the marker', async () => {
    let called = false;
    const provider = proxyProvider({
      fetchImpl: async (u, i) => {
        called = true;
        return okFetch(u, i);
      },
    });

    const state = await provider.generateText({
      ...fixtureRequest,
      // Mislabelled: real data does not carry the marker, so the declaration
      // alone does not get it through.
      input: { classification: 'fixture', payload: 'Real salon data' },
    });

    expect(state.status).toBe('unavailable');
    expect(called).toBe(false);
  });

  it('is blocked outside development', async () => {
    const provider = proxyProvider({ isDev: () => false, fetchImpl: okFetch });
    expect(provider.readiness().status).toBe('blocked');
  });

  it('is blocked when fixture mode is off', async () => {
    const provider = proxyProvider({ isFixtureMode: () => false, fetchImpl: okFetch });
    expect(provider.readiness().status).toBe('blocked');
  });

  it('reports honestly when no proxy URL is configured', async () => {
    const provider = proxyProvider({ readProxyUrl: () => null, fetchImpl: okFetch });
    const readiness = provider.readiness();
    expect(readiness.status).toBe('blocked');
    if (readiness.status === 'blocked') expect(readiness.message).toBe(REFUSAL_NO_PROXY_URL);
  });

  it('surfaces the proxy’s own refusal verbatim, because it is the authoritative guard', async () => {
    const provider = proxyProvider({
      fetchImpl: async () => ({
        status: 403,
        text: async () => JSON.stringify({ error: 'not_fixture_data', message: 'Proxy said no.' }),
      }),
    });

    const state = await provider.generateText(fixtureRequest);
    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') expect(state.message).toBe('Proxy said no.');
  });

  it('names a public variable for the proxy URL, which is a LAN address and not a secret', () => {
    expect(DEV_PROXY_URL_VARIABLE).toBe('EXPO_PUBLIC_DEV_AI_PROXY_URL');
  });
});
