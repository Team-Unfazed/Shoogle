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
/* Every other server-side secret                                             */
/* ========================================================================== */

/**
 * The Gemini key was the first secret this repository had to keep out of the
 * bundle, and the block above is the proof for that one name. Decision 7 adds
 * provider credentials — a Meta app secret, a Google OAuth client secret, the
 * Supabase service-role key, the Razorpay secret and the key that encrypts
 * provider tokens at rest — and every one of them fails the same way: an
 * `EXPO_PUBLIC_` prefix turns a secret into a published credential, because an
 * APK is a zip anyone can download and unzip.
 *
 * So the guard is generalised rather than repeated per name. Adding a secret
 * without adding it here is the mistake this table is meant to make obvious.
 *
 * NOTE ON WHAT IS ASSERTED. Naming a secret in prose is how the rule gets
 * documented; ASSIGNING a public variant or READING it from client code is the
 * violation. The Gemini block learned this the hard way — its first version
 * failed on a comment that promised the right thing. The patterns below match
 * assignment and environment access, never a mention.
 */
const SERVER_ONLY_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'PROVIDER_CREDENTIAL_ENCRYPTION_KEY',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'META_APP_SECRET',
  'RAZORPAY_KEY_SECRET',
  'GEMINI_API_KEY',
] as const;

/** Server-side, not strictly a credential, but still not for the client. */
const SERVER_ONLY_CONFIG = ['GOOGLE_OAUTH_CLIENT_ID_WEB'] as const;

/** Directories Metro bundles. Anything here ships to a device. */
const CLIENT_DIRECTORIES = ['app/', 'components/', 'features/', 'lib/', 'theme/'];

describe('no server-side secret can reach the Expo bundle', () => {
  it.each([...SERVER_ONLY_SECRETS, ...SERVER_ONLY_CONFIG])(
    'never assigns an EXPO_PUBLIC_ variant of %s',
    (name) => {
      expect(tracked(`EXPO_PUBLIC_${name}[[:space:]]*=[[:space:]]*[^=]`)).toEqual([]);
    },
  );

  /**
   * One file is allowed to name a secret in a `process.env` read, and it is
   * listed rather than pattern-excused so the exception stays visible.
   *
   * `features/seo/ai/gemini.ts` is a DEVELOPMENT-ONLY client whose own header
   * explains the arrangement: because `GEMINI_API_KEY` carries no
   * `EXPO_PUBLIC_` prefix, Expo does not inline it, so on a real device
   * `process.env.GEMINI_API_KEY` is `undefined` and the client reports
   * `not_connected`. It is additionally gated on `__DEV__` plus fixture mode,
   * and both non-development EAS profiles force fixture mode off. The read
   * therefore resolves only in Jest or a Node script, never in a shipped app.
   *
   * This is the same treatment `devProxyProvider.ts` gets above. A NEW client
   * file reading any secret still fails here, which is the point.
   */
  const ACKNOWLEDGED_CLIENT_ENV_READERS: Readonly<Record<string, readonly string[]>> = {
    GEMINI_API_KEY: ['features/seo/ai/gemini.ts'],
  };

  it.each([...SERVER_ONLY_SECRETS, ...SERVER_ONLY_CONFIG])(
    'never reads %s from client code',
    (name) => {
      const allowed = ACKNOWLEDGED_CLIENT_ENV_READERS[name] ?? [];
      const readers = tracked(`process\\.env[^\\n]*${name}`)
        .filter((path) => CLIENT_DIRECTORIES.some((dir) => path.startsWith(dir)))
        .filter((path) => !allowed.includes(path));
      expect(readers).toEqual([]);
    },
  );

  it('keeps the acknowledged exception list honest', () => {
    // An allowlist entry for a file that no longer reads the variable is a
    // permission nobody is using, and the next reader would assume it is load
    // bearing. Assert each entry still corresponds to a real read.
    for (const [name, paths] of Object.entries(ACKNOWLEDGED_CLIENT_ENV_READERS)) {
      const actual = tracked(`process\\.env[^\\n]*${name}`);
      for (const path of paths) expect(actual).toContain(path);
    }
  });

  it.each([...SERVER_ONLY_SECRETS, ...SERVER_ONLY_CONFIG])(
    'keeps %s out of lib/env, the only route to a public variable',
    (name) => {
      const env = readFileSync(join(REPO_ROOT, 'lib', 'env', 'index.ts'), 'utf8');
      expect(env).not.toMatch(new RegExp(name));
    },
  );

  it.each([...SERVER_ONLY_SECRETS, ...SERVER_ONLY_CONFIG])(
    'declares %s unprefixed in the env example, so its correct home is documented',
    (name) => {
      const example = readFileSync(join(REPO_ROOT, '.env.local.example'), 'utf8');
      expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
      expect(example).not.toMatch(new RegExp(`^EXPO_PUBLIC_${name}=`, 'm'));
    },
  );

  /**
   * `lib/env` is the ONLY module that reads `process.env`, and everything it
   * exports is publishable by design. Pinning the exported keys means a new
   * entry has to be added deliberately here as well — which is the moment
   * someone notices they are about to publish a secret.
   */
  it('exposes exactly the publishable values, and nothing else', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('@/lib/env') as { env: Record<string, unknown> };
    expect(Object.keys(env).sort()).toEqual(
      [
        'googleOAuthClientIdAndroid',
        'metaAppId',
        'razorpayKeyId',
        'supabaseAnonKey',
        'supabaseUrl',
      ].sort(),
    );
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
