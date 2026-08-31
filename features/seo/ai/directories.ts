/**
 * Directory-presence checklist for India. Owner: Pranay.
 *
 * ## Why this is a checklist and not a scanner
 *
 * Shoogle cannot read Justdial, Practo, Sulekha or Zomato listings: scraping
 * them is against their terms and Practo blocks non-browser clients outright.
 * There is no legitimate free source, so this feature asks the owner one tap
 * per row instead of pretending to detect anything.
 *
 * ## The honest claim
 *
 * These directories permit AI-search crawlers, so a complete listing there is
 * READABLE by an assistant. That is all we know. We do not claim that listing
 * anywhere gets a business cited, because nothing measures that.
 *
 * Every row therefore carries the evidence behind it. Where robots.txt could
 * not be read or the per-agent directives were ambiguous, the row says
 * `unverified` and the UI must show that rather than round it up to a yes.
 *
 * Source: docs/research/ai-search-visibility.md §2.5 and §7.4, observed
 * 2026-08-30.
 */

import type { BusinessCategory } from '@/types/domain';

export type DirectoryId =
  | 'google_business_profile'
  | 'justdial'
  | 'indiamart'
  | 'sulekha'
  | 'zomato'
  | 'swiggy'
  | 'practo'
  | 'bing_places';

export type CrawlerEvidence =
  /** We read the robots.txt and it named the AI search agents. */
  | 'observed'
  /** We could not read it, or the per-agent directives were ambiguous. */
  | 'unverified';

export interface DirectoryEntry {
  readonly id: DirectoryId;
  readonly name: string;
  readonly signupUrl: string;
  /** `'all'` or the verticals where this directory is actually used. */
  readonly relevantFor: 'all' | readonly BusinessCategory[];
  readonly crawlerEvidence: CrawlerEvidence;
  /** Exactly what we observed. Shown verbatim so the claim is auditable. */
  readonly evidenceNote: string;
  /** ISO date the observation was made. Evidence ages; say when. */
  readonly observedOn: string;
  /** Why an owner in this market would bother. One line. */
  readonly rationale: string;
}

const OBSERVED_ON = '2026-08-30';

export const INDIA_DIRECTORIES: readonly DirectoryEntry[] = [
  {
    id: 'google_business_profile',
    name: 'Google Business Profile',
    signupUrl: 'https://business.google.com/',
    relevantFor: 'all',
    crawlerEvidence: 'observed',
    evidenceNote: "Grounds Google's own AI features directly.",
    observedOn: OBSERVED_ON,
    rationale: 'The single listing every other local signal is checked against.',
  },
  {
    id: 'justdial',
    name: 'Justdial',
    signupUrl: 'https://www.justdial.com/freelisting',
    relevantFor: 'all',
    crawlerEvidence: 'observed',
    evidenceNote: 'robots.txt permits OAI-SearchBot, Claude-SearchBot, PerplexityBot, Google-Extended.',
    observedOn: OBSERVED_ON,
    rationale: 'The default Indian local directory, and assistants can read it.',
  },
  {
    id: 'indiamart',
    name: 'IndiaMART',
    signupUrl: 'https://seller.indiamart.com/',
    relevantFor: ['repair_shop', 'boutique', 'other'],
    crawlerEvidence: 'observed',
    evidenceNote: 'robots.txt permits OAI-SearchBot, GPTBot, Google-Extended.',
    observedOn: OBSERVED_ON,
    rationale: 'Where buyers look for suppliers and trade services.',
  },
  {
    id: 'sulekha',
    name: 'Sulekha',
    signupUrl: 'https://www.sulekha.com/business-listing',
    relevantFor: ['salon', 'gym', 'clinic', 'repair_shop', 'other'],
    crawlerEvidence: 'unverified',
    evidenceNote: 'robots.txt has crawler directives, but the per-agent values were not confirmed.',
    observedOn: OBSERVED_ON,
    rationale: 'Widely used for local services.',
  },
  {
    id: 'zomato',
    name: 'Zomato',
    signupUrl: 'https://www.zomato.com/partner_with_us/onboarding',
    relevantFor: ['restaurant', 'bakery'],
    crawlerEvidence: 'unverified',
    evidenceNote: 'Permissive to search crawlers; AI-agent specifics were not confirmed.',
    observedOn: OBSERVED_ON,
    rationale: 'Where people decide where to eat.',
  },
  {
    id: 'swiggy',
    name: 'Swiggy',
    signupUrl: 'https://partner.swiggy.com/',
    relevantFor: ['restaurant', 'bakery'],
    crawlerEvidence: 'unverified',
    evidenceNote: 'Permissive to search crawlers; AI-agent specifics were not confirmed.',
    observedOn: OBSERVED_ON,
    rationale: 'Delivery demand, and a second public record of your hours.',
  },
  {
    id: 'practo',
    name: 'Practo',
    signupUrl: 'https://www.practo.com/providers',
    relevantFor: ['clinic'],
    crawlerEvidence: 'unverified',
    evidenceNote: 'robots.txt was not retrievable (HTTP 403), so nothing about it is confirmed.',
    observedOn: OBSERVED_ON,
    rationale: 'Where patients search for clinics and doctors.',
  },
  {
    id: 'bing_places',
    name: 'Bing Places',
    signupUrl: 'https://www.bingplaces.com/',
    relevantFor: 'all',
    crawlerEvidence: 'unverified',
    evidenceNote:
      'Free to list. The common claim that it feeds ChatGPT or Copilot is UNVERIFIED — Shoogle does not assert it.',
    observedOn: OBSERVED_ON,
    rationale: 'Free, and a second index that is not Google.',
  },
];

export function directoriesFor(category: BusinessCategory): DirectoryEntry[] {
  return INDIA_DIRECTORIES.filter(
    (entry) => entry.relevantFor === 'all' || entry.relevantFor.includes(category),
  );
}

/* -------------------------------------------------------------------------- */
/* The checklist                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What the owner has told us. `'unknown'` is the starting state and stays until
 * the owner answers — it is never counted as `'not_listed'`, because "we have
 * not asked" and "you are not there" are different facts.
 */
export type DirectoryPresence = 'listed' | 'not_listed' | 'unknown';

export interface DirectoryChecklistRow {
  readonly entry: DirectoryEntry;
  readonly presence: DirectoryPresence;
}

export function directoryChecklist(
  category: BusinessCategory,
  answers: Readonly<Partial<Record<DirectoryId, DirectoryPresence>>>,
): DirectoryChecklistRow[] {
  return directoriesFor(category).map((entry) => ({
    entry,
    presence: answers[entry.id] ?? 'unknown',
  }));
}

/**
 * Counts, never a percentage.
 *
 * A "72% directory coverage" figure would imply we measured the world. We only
 * know what the owner told us, so we report three counts and let the UI say so.
 */
export interface DirectoryCoverage {
  readonly listed: number;
  readonly notListed: number;
  readonly unanswered: number;
  readonly total: number;
}

export function directoryCoverage(rows: readonly DirectoryChecklistRow[]): DirectoryCoverage {
  let listed = 0;
  let notListed = 0;
  let unanswered = 0;
  for (const row of rows) {
    if (row.presence === 'listed') listed += 1;
    else if (row.presence === 'not_listed') notListed += 1;
    else unanswered += 1;
  }
  return { listed, notListed, unanswered, total: rows.length };
}

/** One sentence for the card. Says what we know and what we do not. */
export function describeDirectoryCoverage(coverage: DirectoryCoverage): string {
  if (coverage.listed === 0 && coverage.notListed === 0) {
    return `${coverage.total} directories to check. We cannot read them, so this is your answer, not ours.`;
  }
  const parts = [`${coverage.listed} listed`, `${coverage.notListed} not listed`];
  if (coverage.unanswered > 0) parts.push(`${coverage.unanswered} not answered`);
  return parts.join(' · ');
}
