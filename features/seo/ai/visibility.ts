/**
 * The AI Visibility Check. Owner: Pranay.
 *
 * One question, answered from one fetch of the owner's homepage plus its
 * robots.txt: **can an AI assistant read and use this business at all?**
 *
 * Cost: zero. Credentials: none. Not blocked by the Google Business Profile
 * quota. No model is involved — every finding below is a fact about the bytes
 * that came back, which is precisely why it can be trusted.
 *
 * ## What this deliberately does not do
 *
 * - It does not produce an "AI visibility score". Nothing measures that, so a
 *   number would be fabricated (docs/research/ai-search-visibility.md §6.6, §8).
 * - It does not claim a business appears in AI Overviews. No API reports it.
 * - It does not say "your site is fine" when a check could not run. Anything we
 *   could not look at goes into `uncheckedAreas` and is named out loud.
 *
 * A check that did not run is never scored as a pass (which would fabricate
 * health) and never as a fail (which would fabricate a problem).
 */

import { failed, ready, unavailable } from '@/lib/state/DataState';
import type { Result } from '@/lib/providers/types';
import type { SeoFinding } from '../types';
import {
  containsPhoneText,
  extractVisibleText,
  hasTelLink,
  headerRobotsDirectives,
  jsonLdBlocks,
  looksLikeEmptyAppShell,
  metaRobotsDirectives,
  normaliseHeaders,
  pageTitle,
  scriptContentLength,
  type PageSnapshot,
} from './html';
import { aiCrawlerAccess, blockedSearchCrawlers } from './robots';
import { inspectJsonLd } from './schema';

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

export interface AiVisibilityReport {
  readonly url: string;
  readonly fetchedAt: string;
  readonly findings: readonly SeoFinding[];
  /**
   * Everything we could not check, in owner-facing words. Never empty in
   * practice — we cannot see Google's index or an assistant's answer.
   */
  readonly uncheckedAreas: readonly string[];
  /**
   * How many checks actually ran, and how many of those passed. Counts, not a
   * score: they describe our coverage, not the site's quality.
   */
  readonly checksRun: number;
  readonly checksPassed: number;
  readonly pageTitle: string | null;
}

export const NO_WEBSITE_MESSAGE =
  'You do not have a website yet, so there is nothing for an assistant to read.';

/** Always unchecked, whatever the page says. Stated rather than quietly omitted. */
const PERMANENTLY_UNCHECKABLE: readonly string[] = [
  'Whether Google has actually indexed your site (needs Search Console)',
  'Whether you appear in Google AI Overviews (no API reports this)',
  'Where you rank in local results (no API reports this)',
];

/* -------------------------------------------------------------------------- */
/* The check                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Run every check that the snapshot supports.
 *
 * Pure and synchronous. The fetch is separate (`fetchPageSnapshot`) so this can
 * be tested against fixed bytes and so `features/audit` can reuse it against a
 * snapshot it fetched itself.
 */
export function checkAiVisibility(snapshot: PageSnapshot): AiVisibilityReport {
  const findings: SeoFinding[] = [];
  const unchecked: string[] = [...PERMANENTLY_UNCHECKABLE];
  let checksRun = 0;
  let checksPassed = 0;

  const pass = (): void => {
    checksRun += 1;
    checksPassed += 1;
  };
  const fail = (finding: SeoFinding): void => {
    checksRun += 1;
    findings.push(finding);
  };

  const headers = normaliseHeaders(snapshot.headers);
  const text = extractVisibleText(snapshot.html);

  /* Reachability ----------------------------------------------------------- */

  if (snapshot.httpStatus < 200 || snapshot.httpStatus >= 400) {
    fail({
      id: 'ai-visibility-unreachable',
      checkId: 'ai.page.reachable',
      title: 'Your website did not load',
      detail:
        `The page answered with status ${snapshot.httpStatus}. Nothing else can be checked until ` +
        'it loads, and an assistant sees exactly what we saw.',
      severity: 'critical',
      fixHref: null,
      observation: `GET ${snapshot.requestedUrl} returned HTTP ${snapshot.httpStatus}.`,
      evidenceBasis: 'confirmed',
    });
    return {
      url: snapshot.finalUrl,
      fetchedAt: snapshot.fetchedAt,
      findings,
      uncheckedAreas: [
        ...unchecked,
        'Everything about the page itself — it did not load.',
      ],
      checksRun,
      checksPassed,
      pageTitle: null,
    };
  }
  pass();

  /* robots.txt ------------------------------------------------------------- */

  if (snapshot.robotsTxt === null) {
    unchecked.push('Which crawlers your site allows (we could not read your robots.txt)');
  } else {
    const access = aiCrawlerAccess(snapshot.robotsTxt, '/');
    const blocked = blockedSearchCrawlers(access);
    if (blocked.length > 0) {
      fail({
        id: 'ai-visibility-crawlers-blocked',
        checkId: 'ai.robots.search_crawlers',
        title: 'AI search assistants are blocked from your site',
        detail:
          `Your robots.txt tells ${blocked.map((crawler) => crawler.id).join(', ')} to stay out. ` +
          `${blocked.map((crawler) => crawler.effectOfBlocking).join(' ')} ` +
          'Blocking a training crawler such as GPTBot is a separate choice and does not do this.',
        severity: 'critical',
        fixHref: null,
        observation: `robots.txt disallows: ${blocked.map((crawler) => crawler.id).join(', ')}.`,
        evidenceBasis: 'confirmed',
      });
    } else {
      pass();
    }
  }

  /* Indexing and snippets --------------------------------------------------- */

  const directives = [...metaRobotsDirectives(snapshot.html), ...headerRobotsDirectives(headers)];

  if (directives.includes('noindex') || directives.includes('none')) {
    fail({
      id: 'ai-visibility-noindex',
      checkId: 'ai.page.indexable',
      title: 'Your page tells Google not to index it',
      detail:
        'A page has to be in Google’s index before it can appear in any Google feature, ' +
        'including AI ones. This page asks to be left out.',
      severity: 'critical',
      fixHref: null,
      observation: 'Found a "noindex" robots directive on the page or in its headers.',
      evidenceBasis: 'confirmed',
    });
  } else {
    pass();
  }

  const suppressesSnippet =
    directives.includes('nosnippet') || directives.some((value) => /^max-snippet:\s*0$/.test(value));
  if (suppressesSnippet) {
    fail({
      id: 'ai-visibility-nosnippet',
      checkId: 'ai.page.snippet_eligible',
      title: 'Your page blocks its own text from being quoted',
      detail:
        'Google will only use text from a page that is snippet-eligible. This page switches that ' +
        'off, so an assistant summarising your business has nothing it is allowed to quote.',
      severity: 'critical',
      fixHref: null,
      observation: 'Found "nosnippet" or "max-snippet:0" on the page or in its headers.',
      evidenceBasis: 'confirmed',
    });
  } else {
    pass();
  }

  /* JavaScript dependence --------------------------------------------------- */

  const scriptBytes = scriptContentLength(snapshot.html);
  const textBytes = text.length;
  const emptyShell = looksLikeEmptyAppShell(snapshot.html);
  if (emptyShell || (textBytes < 300 && scriptBytes > textBytes * 10)) {
    fail({
      id: 'ai-visibility-js-only',
      checkId: 'ai.page.no_js_content',
      title: 'Your content only appears after JavaScript runs',
      detail:
        `The page arrived with ${textBytes} characters of text and ${scriptBytes} characters of ` +
        'script. An analysis of over 500 million AI-crawler fetches found those crawlers did not ' +
        'run JavaScript at all (Vercel/MERJ study — not Google documentation). If that holds, they ' +
        'see an empty page.',
      severity: 'important',
      fixHref: null,
      observation: emptyShell
        ? 'The page body is an empty app shell before JavaScript runs.'
        : `Raw HTML text ${textBytes} chars vs script ${scriptBytes} chars.`,
      evidenceBasis: 'study',
    });
  } else {
    pass();
  }

  /* Structured data --------------------------------------------------------- */

  const inspection = inspectJsonLd(jsonLdBlocks(snapshot.html));
  unchecked.push(...inspection.unchecked);
  if (inspection.verdict === 'present' && inspection.failed.length === 0) {
    pass();
  } else if (inspection.verdict === 'present') {
    fail({
      id: 'ai-visibility-schema-incomplete',
      checkId: 'ai.schema.local_business',
      title: 'Your business details are only partly machine-readable',
      detail:
        `Your site describes itself as ${inspection.type ?? 'a business'}, but these parts are ` +
        `missing or malformed: ${inspection.failed.join(', ')}. Assistants read these fields ` +
        'literally, so a gap here becomes a guess there.',
      severity: 'important',
      fixHref: null,
      observation: `LocalBusiness JSON-LD present; failed checks: ${inspection.failed.join(', ')}.`,
      evidenceBasis: 'confirmed',
    });
  } else if (inspection.verdict === 'unparseable') {
    fail({
      id: 'ai-visibility-schema-broken',
      checkId: 'ai.schema.local_business',
      title: 'The machine-readable block on your site is broken',
      detail:
        'Your site has a structured-data block, but it is not valid JSON, so nothing can read it. ' +
        'A broken block is treated as no block.',
      severity: 'important',
      fixHref: null,
      observation: 'Found application/ld+json that failed to parse.',
      evidenceBasis: 'confirmed',
    });
  } else {
    fail({
      id: 'ai-visibility-schema-missing',
      checkId: 'ai.schema.local_business',
      title: 'Your business details are not machine-readable',
      detail:
        'Your site has no LocalBusiness markup. Google says this is not required to appear in AI ' +
        'answers, but it is how search engines and assistants read your hours, address and ' +
        'services without guessing.',
      severity: 'important',
      fixHref: null,
      observation:
        inspection.verdict === 'absent'
          ? 'No application/ld+json block on the page.'
          : 'Structured data found, but none of it describes a local business.',
      evidenceBasis: 'confirmed',
    });
  }

  /* Phone ------------------------------------------------------------------- */

  const tel = hasTelLink(snapshot.html);
  const phoneInText = containsPhoneText(text);
  if (tel || phoneInText) {
    pass();
  } else {
    fail({
      id: 'ai-visibility-no-phone',
      checkId: 'ai.page.phone_present',
      title: 'Your phone number is not on the page as text',
      detail:
        'We found no tel: link and no phone number in the page text. If your number is only in an ' +
        'image, a customer arriving from an AI answer cannot call you and an assistant cannot ' +
        'repeat it.',
      severity: 'important',
      fixHref: null,
      observation: 'No tel: anchor and no phone-shaped string in the visible text.',
      evidenceBasis: 'industry',
    });
  }

  /* Freshness --------------------------------------------------------------- */

  const lastModified = headers['last-modified'];
  if (typeof lastModified !== 'string') {
    unchecked.push('When your site last changed (your server did not say)');
  } else {
    const modifiedAt = Date.parse(lastModified);
    const fetchedAt = Date.parse(snapshot.fetchedAt);
    if (Number.isNaN(modifiedAt) || Number.isNaN(fetchedAt)) {
      unchecked.push('When your site last changed (the date could not be read)');
    } else {
      const sixMonthsMs = 182 * 24 * 60 * 60 * 1000;
      if (fetchedAt - modifiedAt > sixMonthsMs) {
        fail({
          id: 'ai-visibility-stale',
          checkId: 'ai.page.freshness',
          title: 'Your site has not changed in over six months',
          detail:
            'One published study associates fresher pages with more citations (SE Ranking). That is ' +
            'a study, not a Google statement, so treat it as a nudge rather than a rule.',
          severity: 'minor',
          fixHref: null,
          observation: `Last-Modified: ${lastModified}.`,
          evidenceBasis: 'study',
        });
      } else {
        pass();
      }
    }
  }

  return {
    url: snapshot.finalUrl,
    fetchedAt: snapshot.fetchedAt,
    findings,
    uncheckedAreas: unchecked,
    checksRun,
    checksPassed,
    pageTitle: pageTitle(snapshot.html),
  };
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The slice of `Response` this module uses. Declared structurally so the module
 * does not depend on DOM lib types and so tests can pass a plain object.
 */
export interface MinimalResponse {
  readonly status: number;
  readonly url?: string;
  readonly headers: { forEach(callback: (value: string, name: string) => void): void };
  text(): Promise<string>;
}

export type FetchLike = (url: string) => Promise<MinimalResponse>;

function collectHeaders(response: MinimalResponse): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    response.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
  } catch {
    // A response without an iterable header bag costs us the header-based
    // checks, which then report as unchecked rather than as passes.
  }
  return headers;
}

function robotsUrlFor(pageUrl: string): string | null {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(pageUrl.trim());
  const origin = match?.[1];
  return origin === undefined ? null : `${origin}/robots.txt`;
}

/**
 * Fetch a page and its robots.txt.
 *
 * A robots.txt that could not be read is recorded as `null`, which is not the
 * same as an empty one — the check that depends on it reports "not checked"
 * rather than "allowed".
 */
export async function fetchPageSnapshot(
  url: string,
  fetchImpl: FetchLike,
  now: () => string = () => new Date().toISOString(),
): Result<PageSnapshot> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return unavailable('not_supported', 'That does not look like a web address starting with http.');
  }

  let response: MinimalResponse;
  let html: string;
  try {
    response = await fetchImpl(trimmed);
    html = await response.text();
  } catch {
    return unavailable(
      'offline',
      'We could not reach your website. If you are offline this will work when you reconnect.',
    );
  }

  let robotsTxt: string | null = null;
  const robotsUrl = robotsUrlFor(response.url ?? trimmed);
  if (robotsUrl !== null) {
    try {
      const robotsResponse = await fetchImpl(robotsUrl);
      robotsTxt =
        robotsResponse.status >= 200 && robotsResponse.status < 300
          ? await robotsResponse.text()
          : null;
    } catch {
      robotsTxt = null;
    }
  }

  const fetchedAt = now();
  return ready<PageSnapshot>(
    {
      requestedUrl: trimmed,
      finalUrl: response.url ?? trimmed,
      httpStatus: response.status,
      headers: collectHeaders(response),
      html,
      robotsTxt,
      fetchedAt,
    },
    fetchedAt,
  );
}

/** Fetch, then check. Returns the snapshot's non-ready state untouched. */
export async function runAiVisibilityCheck(
  url: string,
  fetchImpl: FetchLike,
  now: () => string = () => new Date().toISOString(),
): Result<AiVisibilityReport> {
  const snapshot = await fetchPageSnapshot(url, fetchImpl, now);
  if (snapshot.status !== 'ready') return snapshot;
  try {
    return ready(checkAiVisibility(snapshot.value), snapshot.fetchedAt, snapshot.isFixture === true);
  } catch {
    return failed(
      'ai_visibility_check_failed',
      'Something went wrong reading your website. Try again.',
      true,
    );
  }
}
