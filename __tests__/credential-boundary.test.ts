/**
 * THE CLIENT / CREDENTIAL BOUNDARY.
 *
 * Decision 7 settled that provider access tokens, refresh tokens and Facebook
 * Page tokens live server-side only, encrypted, in `private.provider_credentials`
 * — a schema that is deliberately absent from `[api] schemas`. The mobile client
 * reads connection METADATA and never a credential.
 *
 * None of that exists yet. What exists today are the three client-facing
 * connection types and the device-storage call sites, and both are places where
 * a credential could be introduced later without anyone noticing. So the
 * boundary is asserted against the repository itself, the way `keySafety.test.ts`
 * asserts the Gemini key cannot reach the bundle: it fails the build rather than
 * a review.
 *
 * WHAT THIS DOES NOT TEST. There is no server, no encryption, no token exchange
 * and no `provider_connections` table. Nothing here pretends otherwise — every
 * assertion is about code that exists today.
 *
 * WHY IT MATCHES DECLARATIONS AND NOT MENTIONS. `keySafety.test.ts` learned this
 * the hard way: its first version failed on a comment that promised the right
 * thing, because a doc saying "never store a token here" was indistinguishable
 * from code doing it. Describing the rule in prose is how it gets documented;
 * declaring the FIELD is the violation. So the patterns below match a property
 * declaration.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');

const read = (...segments: string[]): string =>
  readFileSync(join(REPO_ROOT, ...segments), 'utf8');

function tracked(pattern: string): string[] {
  try {
    return execSync(`git grep -lIE ${JSON.stringify(pattern)} -- . ':!*__tests__*'`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((line) => line.trim() !== '');
  } catch {
    // git grep exits 1 when nothing matches. No matches is the pass.
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Client-facing connection types carry no credential                         */
/* -------------------------------------------------------------------------- */

/**
 * Every property name that would mean a secret had reached a type the client
 * can read. `keyId` and `ciphertext` are here too: they belong to the encrypted
 * record, and their presence would mean the credential row had been modelled in
 * the wrong place.
 */
const CREDENTIAL_FIELDS = [
  'accessToken',
  'refreshToken',
  'pageToken',
  'idToken',
  'clientSecret',
  'appSecret',
  'ciphertext',
  'keyId',
  'encryptionKey',
];

/** A TypeScript property declaration, optional or readonly, not a mention. */
const declaresField = (source: string, field: string): boolean =>
  new RegExp(`^\\s*(readonly\\s+)?${field}\\??\\s*:`, 'm').test(source);

describe('connection types the client can read carry no credential', () => {
  const clientFacing: ReadonlyArray<readonly [string, string]> = [
    ['ConnectionInfo', join('lib', 'providers', 'types.ts')],
    ['ProviderConnection', join('types', 'domain.ts')],
    ['PlatformConnection', join('features', 'social', 'availability.ts')],
  ];

  it.each(clientFacing)('%s declares no credential field', (_name, relativePath) => {
    const source = read(relativePath);
    for (const field of CREDENTIAL_FIELDS) {
      expect(declaresField(source, field)).toBe(false);
    }
  });

  it('keeps the three connection vocabularies free of secrets as a set', () => {
    // Asserted together as well as individually: the likely mistake is adding a
    // token to whichever type is nearest to hand when a connect flow is built.
    const combined = clientFacing.map(([, path]) => read(path)).join('\n');
    for (const field of CREDENTIAL_FIELDS) {
      expect(declaresField(combined, field)).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Device storage holds no provider credential                                */
/* -------------------------------------------------------------------------- */

/**
 * Device storage is not encrypted and is readable on a rooted phone, so a
 * provider token written here would outlive the request and the process.
 *
 * The guard is an allowlist of files permitted to touch it at all. Adding a
 * fourth is then a deliberate edit to this list, which is the moment someone
 * asks what is being stored.
 */
const STORAGE_CALLERS_ALLOWED = [
  // Shoogle's OWN Supabase session — a Shoogle JWT and refresh token, not a
  // provider credential. Supabase's React Native setup requires this, and the
  // Decision 7 rule "provider tokens never go into AsyncStorage" does not
  // forbid it. Whether Shoogle's own refresh token should move to
  // expo-secure-store is a separate, still-open question.
  'lib/supabase/client.ts',
  // A local UI preference: whether the GBP agent is paused.
  'features/gbp/components/agent/pausePreference.ts',
  // A review link and a local request count, both owner-entered.
  'app/seo/get-reviews.tsx',
];

describe('nothing writes a provider credential to device storage', () => {
  it('limits device storage to the files that are known to hold no credential', () => {
    const callers = tracked(
      "from ['\"]@react-native-async-storage/async-storage|from ['\"]expo-secure-store",
    ).filter((path) => path !== 'jest.setup.ts');
    expect(callers.sort()).toEqual([...STORAGE_CALLERS_ALLOWED].sort());
  });

  it('never persists a GBP access token', () => {
    // `GbpSession.accessToken` is ephemeral and is the recorded migration
    // blocker for the relay design. Nothing may write it anywhere durable.
    expect(tracked('(setItem|setItemAsync)[^\\n]*(accessToken|access_token)')).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* The private schema stays unexposed                                         */
/* -------------------------------------------------------------------------- */

describe('the private schema is not reachable through the API', () => {
  /**
   * Read tolerantly, assert strictly.
   *
   * `supabase/config.toml` is not tracked yet, so a fresh clone and CI do not
   * have it. A test that simply failed there would be reporting a checkout
   * state as a security violation, and would be deleted by the first person it
   * blocked. When the file IS present the assertion is exact.
   */
  const config = ((): string | null => {
    try {
      return read('supabase', 'config.toml');
    } catch {
      return null;
    }
  })();

  it('exposes only public and graphql_public', () => {
    if (config === null) {
      expect(existsSync(join(REPO_ROOT, 'supabase', 'config.toml'))).toBe(false);
      return;
    }
    // This is the primary barrier for provider credentials, not RLS: the anon
    // key ships inside the APK, so anything PostgREST exposes is readable by
    // anyone who downloads the app.
    const schemas = /^schemas = (\[.*\])$/m.exec(config)?.[1];
    expect(schemas).toBe('["public", "graphql_public"]');
    expect(schemas).not.toMatch(/private/);
  });
});
