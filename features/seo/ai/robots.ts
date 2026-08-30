/**
 * robots.txt parsing, and which AI-search crawlers a site permits.
 * Owner: Pranay.
 *
 * The distinction that matters and that almost everyone gets wrong:
 *
 *   OAI-SearchBot     governs whether ChatGPT's SEARCH feature may include you
 *   GPTBot            is OpenAI's TRAINING crawler — blocking it does not
 *                     remove you from ChatGPT search results
 *   Claude-SearchBot  Anthropic's search crawler
 *   PerplexityBot     Perplexity's crawler
 *   Googlebot         still the gate for everything Google, AI features included
 *
 * So "allow GPTBot so ChatGPT finds you" is wrong per OpenAI's own docs, and
 * Shoogle must not say it. See docs/research/ai-search-visibility.md §8.
 */

export type CrawlerAccess = 'allowed' | 'disallowed' | 'unknown';

export type AiCrawlerId =
  | 'OAI-SearchBot'
  | 'Claude-SearchBot'
  | 'PerplexityBot'
  | 'Googlebot'
  | 'Bingbot'
  | 'GPTBot';

export interface CrawlerDescription {
  readonly id: AiCrawlerId;
  readonly operator: string;
  /** What blocking this crawler actually costs the owner. */
  readonly effectOfBlocking: string;
  /**
   * Whether being blocked should raise a finding. `GPTBot` is training-only, so
   * blocking it is a legitimate choice and never a finding.
   */
  readonly gatesSearchInclusion: boolean;
}

export const AI_SEARCH_CRAWLERS: readonly CrawlerDescription[] = [
  {
    id: 'OAI-SearchBot',
    operator: 'OpenAI',
    effectOfBlocking: 'ChatGPT search cannot show your site.',
    gatesSearchInclusion: true,
  },
  {
    id: 'Claude-SearchBot',
    operator: 'Anthropic',
    effectOfBlocking: 'Claude cannot read your site when it searches the web.',
    gatesSearchInclusion: true,
  },
  {
    id: 'PerplexityBot',
    operator: 'Perplexity',
    effectOfBlocking: 'Perplexity cannot cite your site.',
    gatesSearchInclusion: true,
  },
  {
    id: 'Googlebot',
    operator: 'Google',
    effectOfBlocking: 'Google cannot index you at all, including in AI features.',
    gatesSearchInclusion: true,
  },
  {
    id: 'Bingbot',
    operator: 'Microsoft',
    effectOfBlocking: 'Bing cannot index your site.',
    gatesSearchInclusion: true,
  },
  {
    id: 'GPTBot',
    operator: 'OpenAI',
    effectOfBlocking:
      'Your pages are not used to train OpenAI models. This does NOT remove you from ChatGPT search.',
    gatesSearchInclusion: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

interface RobotsRule {
  readonly kind: 'allow' | 'disallow';
  readonly pattern: string;
}

interface RobotsGroup {
  readonly agents: string[];
  readonly rules: RobotsRule[];
}

export interface RobotsFile {
  readonly groups: readonly RobotsGroup[];
}

/**
 * Parse robots.txt into user-agent groups.
 *
 * Consecutive `User-agent` lines share one group; a rule line closes the agent
 * list, so the next `User-agent` starts a fresh group. Unknown directives
 * (`Sitemap`, `Crawl-delay`, vendor extensions) are ignored rather than treated
 * as rules.
 */
export function parseRobotsTxt(text: string): RobotsFile {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let acceptingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (line.length === 0) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (current === null || !acceptingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        acceptingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (field !== 'allow' && field !== 'disallow') continue;
    if (current === null) continue;
    acceptingAgents = false;
    // `Disallow:` with an empty value means "nothing is disallowed". Keeping it
    // out of the rule list is the same thing and avoids an empty pattern that
    // would match everything.
    if (field === 'disallow' && value.length === 0) continue;
    if (value.length === 0) continue;
    current.rules.push({ kind: field, pattern: value });
  }

  return { groups };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

/** Length of the matched prefix, used for longest-match precedence. */
function matchLength(pattern: string, path: string): number {
  return patternToRegExp(pattern).test(path) ? pattern.replace(/\$$/, '').length : -1;
}

function rulesForAgent(file: RobotsFile, agent: string): RobotsRule[] | null {
  const wanted = agent.toLowerCase();
  const exact = file.groups.filter((group) => group.agents.includes(wanted));
  if (exact.length > 0) return exact.flatMap((group) => group.rules);
  const wildcard = file.groups.filter((group) => group.agents.includes('*'));
  if (wildcard.length > 0) return wildcard.flatMap((group) => group.rules);
  return null;
}

/**
 * Whether `agent` may fetch `path`.
 *
 * Longest matching rule wins; `Allow` beats `Disallow` on an equal-length tie,
 * which is Google's documented behaviour. Returns `'unknown'` when the file
 * names no group that applies — absence of a rule is permission by the
 * standard, but reporting it as `allowed` when we never saw the file at all is
 * the failure mode this whole module exists to avoid, so the caller decides.
 */
export function crawlerAccess(file: RobotsFile, agent: string, path = '/'): CrawlerAccess {
  const rules = rulesForAgent(file, agent);
  if (rules === null) return 'allowed';

  let bestDisallow = -1;
  let bestAllow = -1;
  for (const rule of rules) {
    const length = matchLength(rule.pattern, path);
    if (length < 0) continue;
    if (rule.kind === 'allow') bestAllow = Math.max(bestAllow, length);
    else bestDisallow = Math.max(bestDisallow, length);
  }

  if (bestDisallow < 0) return 'allowed';
  return bestAllow >= bestDisallow ? 'allowed' : 'disallowed';
}

/**
 * Access for every crawler we care about.
 *
 * `robotsTxt === null` means we could not read the file, and every crawler is
 * reported `'unknown'` — not `'allowed'`. An unreadable robots.txt is missing
 * information, not a clean bill of health.
 */
export function aiCrawlerAccess(
  robotsTxt: string | null,
  path = '/',
): Record<AiCrawlerId, CrawlerAccess> {
  const result = {} as Record<AiCrawlerId, CrawlerAccess>;
  if (robotsTxt === null) {
    for (const crawler of AI_SEARCH_CRAWLERS) result[crawler.id] = 'unknown';
    return result;
  }
  const file = parseRobotsTxt(robotsTxt);
  for (const crawler of AI_SEARCH_CRAWLERS) {
    result[crawler.id] = crawlerAccess(file, crawler.id, path);
  }
  return result;
}

/** Crawlers that gate search inclusion and are currently blocked. */
export function blockedSearchCrawlers(access: Record<AiCrawlerId, CrawlerAccess>): CrawlerDescription[] {
  return AI_SEARCH_CRAWLERS.filter(
    (crawler) => crawler.gatesSearchInclusion && access[crawler.id] === 'disallowed',
  );
}
