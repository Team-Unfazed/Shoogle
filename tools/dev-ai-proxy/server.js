#!/usr/bin/env node
/**
 * Local development AI proxy. Owner: Yash.
 *
 * ============================ WHY THIS EXISTS ==============================
 *
 * `GEMINI_API_KEY` has no `EXPO_PUBLIC_` prefix, so Expo does not inline it and
 * `process.env.GEMINI_API_KEY` is `undefined` on a real phone. That is correct
 * and deliberate — a key in the bundle is a published credential — but it means
 * generation cannot be SEEN in Expo Go, only in Jest.
 *
 * This script closes that gap for development only. It runs on the engineer's
 * machine, holds the key in a Node process, and the phone calls it over the
 * LAN. The device receives a URL and never a credential.
 *
 * ============================ WHAT IT IS NOT ===============================
 *
 * NOT production infrastructure. It binds to a LAN address with no auth, so it
 * must never run anywhere but a developer machine on a trusted network, and it
 * must never be pointed at a paid tier or at real customer data. Production
 * generation needs the server-side function that belongs to Sunny.
 *
 * NOT part of the Expo bundle. It lives in `tools/`, which Metro does not
 * bundle, it is plain CommonJS with no imports from `features/` or `lib/`, and
 * nothing in the app imports it. Run it yourself:
 *
 *     node tools/dev-ai-proxy/server.js
 *
 * ==================== IT RE-ENFORCES THE GUARD ITSELF ======================
 *
 * The device-side classification guard is a guard against OUR OWN mistakes, and
 * anything running on a device can be bypassed. So this process refuses
 * independently: a request whose payload does not carry the [FIXTURE] marker is
 * rejected here, on the machine that actually holds the key.
 *
 * That redundancy is the whole security value of the proxy. Without it, moving
 * the key off the device would have made the data guard WEAKER, not stronger.
 */

'use strict';

const http = require('node:http');

const KEY_VARIABLE = 'GEMINI_API_KEY';
const FORBIDDEN_PUBLIC_VARIABLE = 'EXPO_PUBLIC_GEMINI_API_KEY';
const FIXTURE_MARKER = '[FIXTURE]';
/*
 * `gemini-2.5-flash` returns 404 for keys created after its cutoff: "This model
 * is no longer available to new users." Verified against the live API on
 * 2026-09-11, which is also how it was found — the model list still advertises
 * 2.5-flash as generateContent-capable, and only generateContent itself refuses.
 *
 * Listing a model is therefore NOT evidence that it can be called.
 */
const DEFAULT_MODEL = 'gemini-3.6-flash';
const ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_PROMPT_CHARS = 8000;
const PORT = Number(process.env.DEV_AI_PROXY_PORT ?? 8788);

/**
 * Tokens a reasoning model may spend on thinking before it writes anything.
 *
 * `maxOutputTokens` caps the WHOLE completion, and on a reasoning model the
 * thinking tokens come out of that same budget. The first live call asked for
 * roughly 467 tokens — ample for a 120-word caption — and came back cut off
 * mid-sentence, because most of the allowance had already been spent before
 * the caption started.
 *
 * So the budget is now the content estimate PLUS a separate reasoning
 * allowance, rather than the content estimate alone. This is a ceiling and not
 * a target: a model that finishes early is billed for what it used.
 */
const REASONING_HEADROOM_TOKENS = 2048;

/** ~3 characters per token is a rough but adequate English/Hinglish estimate. */
function outputTokenBudget(maxOutputChars) {
  const contentTokens = Math.max(64, Math.ceil(maxOutputChars / 3));
  return contentTokens + REASONING_HEADROOM_TOKENS;
}

/* -------------------------------------------------------------------------- */
/* Startup checks                                                             */
/* -------------------------------------------------------------------------- */

function startupProblem() {
  if (process.env[FORBIDDEN_PUBLIC_VARIABLE] !== undefined) {
    return (
      `${FORBIDDEN_PUBLIC_VARIABLE} is defined in this environment. Anything with that prefix is ` +
      'compiled into the app and readable by anyone who downloads it. Remove the variable and ' +
      'rotate that key before running this.'
    );
  }
  if (!process.env[KEY_VARIABLE] || process.env[KEY_VARIABLE].trim() === '') {
    return (
      `${KEY_VARIABLE} is not set in this shell, so there is nothing to call. Put it in ` +
      '.env.local and start this with:  node --env-file=.env.local tools/dev-ai-proxy/server.js'
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Request handling                                                           */
/* -------------------------------------------------------------------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // A runaway body is a bug or an attack; either way, stop reading.
      if (raw.length > 200_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleGenerate(req, res) {
  let parsed;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    send(res, 400, { error: 'unreadable_body', message: 'Body was not valid JSON.' });
    return;
  }

  const instruction = typeof parsed.instruction === 'string' ? parsed.instruction : '';
  const payload = typeof parsed.payload === 'string' ? parsed.payload : '';
  const classification = parsed.classification;
  const model = typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_MODEL;

  /* ---- The guard, re-enforced on the machine that holds the key --------- */

  if (classification !== 'fixture') {
    send(res, 403, {
      error: 'not_fixture_data',
      message:
        'This proxy only forwards development fixture data. The free Gemini tier may use what is ' +
        'sent to it to improve Google’s products, so customer data does not go through here.',
    });
    return;
  }

  if (!payload.includes(FIXTURE_MARKER)) {
    send(res, 403, {
      error: 'missing_fixture_marker',
      message:
        `The request is labelled as fixture data but its payload does not carry the ` +
        `${FIXTURE_MARKER} marker, so it cannot be confirmed as safe to send. Refusing.`,
    });
    return;
  }

  const prompt = `${instruction}\n\n---\n\n${payload}`;
  if (prompt.length > MAX_PROMPT_CHARS) {
    send(res, 413, { error: 'prompt_too_large', message: 'That is too much text for one request.' });
    return;
  }

  /* ---- Forward ---------------------------------------------------------- */

  let upstream;
  let raw;
  try {
    upstream = await fetch(`${ENDPOINT_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The key travels in a header and never in the URL, so it cannot land
        // in a log line, a redirect or a crash report.
        'x-goog-api-key': process.env[KEY_VARIABLE],
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: outputTokenBudget(Number(parsed.maxOutputChars) || 1200),
        },
      }),
    });
    raw = await upstream.text();
  } catch (error) {
    send(res, 502, { error: 'upstream_unreachable', message: String(error && error.message) });
    return;
  }

  if (upstream.status < 200 || upstream.status >= 300) {
    /*
     * The status is forwarded to the client, but never the body: an upstream
     * error body can echo request headers back, and ours carries the key.
     *
     * The reason IS logged here, on the developer's own machine, because a
     * proxy that hides why the model refused leaves the engineer guessing —
     * only `error.message` is taken, never the whole body.
     */
    let reason = '';
    try {
      const parsedError = JSON.parse(raw);
      reason = (parsedError && parsedError.error && parsedError.error.message) || '';
    } catch {
      reason = '';
    }
    console.error(
      `  upstream ${upstream.status} for model "${model}"${reason ? `: ${reason}` : ''}`,
    );

    send(res, upstream.status, {
      error: 'upstream_error',
      message: `The model returned status ${upstream.status}.`,
    });
    return;
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    send(res, 502, { error: 'unparseable', message: 'The model returned something unreadable.' });
    return;
  }

  const parts = (json.candidates && json.candidates[0]?.content?.parts) || [];
  const text = parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  if (!text) {
    send(res, 502, { error: 'empty_response', message: 'The model returned no text.' });
    return;
  }

  send(res, 200, { text, model });
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */

const problem = startupProblem();
if (problem !== null) {
  console.error(`\n  dev-ai-proxy refused to start.\n\n  ${problem}\n`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    send(res, 200, { ok: true, model: DEFAULT_MODEL });
    return;
  }
  if (req.method === 'POST' && req.url === '/generate') {
    handleGenerate(req, res).catch((error) => {
      send(res, 500, { error: 'proxy_error', message: String(error && error.message) });
    });
    return;
  }
  send(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(
    [
      '',
      '  Shoogle dev AI proxy — DEVELOPMENT ONLY, fixture data only.',
      `  Listening on http://0.0.0.0:${PORT}`,
      '',
      '  Point the app at it with your machine\'s LAN address, e.g.',
      `    EXPO_PUBLIC_DEV_AI_PROXY_URL=http://192.168.1.20:${PORT}`,
      '',
      '  That URL is a LAN address, not a secret. The API key stays in this',
      '  process and is never sent to the device.',
      '',
    ].join('\n'),
  );
});
