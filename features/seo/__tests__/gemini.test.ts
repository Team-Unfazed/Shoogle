/**
 * The security guards on the development Gemini client.
 *
 * These are the tests that stop a privacy incident, so they assert not only the
 * returned state but also that NOTHING WAS SENT. A refusal that still made the
 * network call would have already leaked the data.
 */

import { fixtureInput, customerInput, FIXTURE_MARKER, type AiTextRequest } from '../ai/contract';
import {
  createGeminiAiProvider,
  geminiAiProvider,
  FORBIDDEN_PUBLIC_KEY_VARIABLE,
  GEMINI_KEY_VARIABLE,
  REFUSAL_FIXTURE_MODE_OFF,
  REFUSAL_MISSING_MARKER,
  REFUSAL_NOT_DEV,
  REFUSAL_NOT_FIXTURE_DATA,
  REFUSAL_PUBLIC_KEY,
  type GeminiRuntime,
} from '../ai/gemini';

/** Obviously not a credential. Never put a real key in a file. */
const PLACEHOLDER_KEY = 'placeholder-not-a-real-key';

const FIXTURE_PAYLOAD = `${FIXTURE_MARKER} Example Salon is an invented business.`;

function makeFetch(): jest.Mock {
  return jest.fn().mockResolvedValue({
    status: 200,
    text: async () =>
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'generated text' }] } }] }),
  });
}

function request(payload: string, real = false): AiTextRequest {
  return {
    task: 'business_description',
    instruction: 'Write one sentence.',
    input: real ? customerInput(payload) : fixtureInput(payload),
  };
}

function runtimeWith(fetchImpl: jest.Mock, overrides: Partial<GeminiRuntime> = {}) {
  return createGeminiAiProvider({
    isDev: () => true,
    isFixtureMode: () => true,
    readApiKey: () => PLACEHOLDER_KEY,
    hasPublicKey: () => false,
    fetchImpl: fetchImpl as unknown as GeminiRuntime['fetchImpl'],
    now: () => '2020-01-01T00:00:00.000Z',
    model: 'gemini-2.5-flash',
    ...overrides,
  });
}

describe('the key variable name', () => {
  it('is never the public one', () => {
    expect(GEMINI_KEY_VARIABLE).toBe('GEMINI_API_KEY');
    expect(GEMINI_KEY_VARIABLE.startsWith('EXPO_PUBLIC_')).toBe(false);
    expect(FORBIDDEN_PUBLIC_KEY_VARIABLE).toBe('EXPO_PUBLIC_GEMINI_API_KEY');
  });
});

describe('refusing outside development', () => {
  const originalDev = __DEV__;

  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
  });

  it('refuses with not_supported when __DEV__ is false, and sends nothing', async () => {
    const fetchImpl = makeFetch();
    const provider = runtimeWith(fetchImpl, { isDev: () => false });

    const state = await provider.generateText(request(FIXTURE_PAYLOAD));

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') {
      expect(state.reason).toBe('not_supported');
      expect(state.message).toBe(REFUSAL_NOT_DEV);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports blocked readiness before anything is attempted', () => {
    const provider = runtimeWith(makeFetch(), { isDev: () => false });
    const readiness = provider.readiness();
    expect(readiness.status).toBe('blocked');
    if (readiness.status === 'blocked') expect(readiness.reason).toBe('not_supported');
  });

  it('uses the real __DEV__ global, so a release build cannot reach the network', async () => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

    const state = await geminiAiProvider.generateText(request(FIXTURE_PAYLOAD));

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') {
      expect(state.reason).toBe('not_supported');
      expect(state.message).toBe(REFUSAL_NOT_DEV);
    }
  });
});

describe('refusing data that is not fixture data', () => {
  it('refuses a request classified as customer data, and sends nothing', async () => {
    const fetchImpl = makeFetch();
    const provider = runtimeWith(fetchImpl);

    const state = await provider.generateText(request(FIXTURE_PAYLOAD, true));

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') {
      expect(state.reason).toBe('not_supported');
      expect(state.message).toBe(REFUSAL_NOT_FIXTURE_DATA);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses real data mislabelled as fixture, because the marker is missing', async () => {
    const fetchImpl = makeFetch();
    const provider = runtimeWith(fetchImpl);

    // The classification says 'fixture'. The content is a real-looking business.
    const state = await provider.generateText(request('Sharma Hair Studio, Nerul West'));

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') {
      expect(state.reason).toBe('not_supported');
      expect(state.message).toBe(REFUSAL_MISSING_MARKER);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses when fixture mode is off, even in development', async () => {
    const fetchImpl = makeFetch();
    const provider = runtimeWith(fetchImpl, { isFixtureMode: () => false });

    const state = await provider.generateText(request(FIXTURE_PAYLOAD));

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') {
      expect(state.message).toBe(REFUSAL_FIXTURE_MODE_OFF);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses outright if the forbidden public key variable exists', async () => {
    const fetchImpl = makeFetch();
    const provider = runtimeWith(fetchImpl, { hasPublicKey: () => true });

    const state = await provider.generateText(request(FIXTURE_PAYLOAD));

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') {
      expect(state.message).toBe(REFUSAL_PUBLIC_KEY);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports not_connected when the non-public key is absent', async () => {
    const fetchImpl = makeFetch();
    const provider = runtimeWith(fetchImpl, { readApiKey: () => null });

    const state = await provider.generateText(request(FIXTURE_PAYLOAD));

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') expect(state.reason).toBe('not_connected');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('when every guard passes', () => {
  it('sends the key in a header, never in the URL', async () => {
    const fetchImpl = makeFetch();
    const provider = runtimeWith(fetchImpl);

    await provider.generateText(request(FIXTURE_PAYLOAD));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).not.toContain(PLACEHOLDER_KEY);
    expect(url).not.toMatch(/key=/);
    expect(init.headers['x-goog-api-key']).toBe(PLACEHOLDER_KEY);
  });

  it('marks the result as derived from fixture data', async () => {
    const provider = runtimeWith(makeFetch());

    const state = await provider.generateText(request(FIXTURE_PAYLOAD));

    expect(state.status).toBe('ready');
    if (state.status === 'ready') {
      expect(state.isFixture).toBe(true);
      expect(state.value.text).toBe('generated text');
      expect(state.value.derivedFromFixtureData).toBe(true);
      expect(state.value.model).toBe('gemini-2.5-flash');
    }
  });

  it('does not report success when the model returned no text', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [] } }] }),
    });
    const provider = runtimeWith(fetchImpl);

    const state = await provider.generateText(request(FIXTURE_PAYLOAD));

    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.code).toBe('gemini_empty_response');
  });

  it('reports rate limiting honestly rather than degrading silently', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ status: 429, text: async () => '{}' });
    const provider = runtimeWith(fetchImpl);

    const state = await provider.generateText(request(FIXTURE_PAYLOAD));

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') expect(state.reason).toBe('rate_limited');
  });
});
