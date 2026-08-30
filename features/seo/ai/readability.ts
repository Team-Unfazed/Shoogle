/**
 * Readability observations for AI assistants. Owner: Pranay.
 *
 * ## No score, on purpose
 *
 * Nothing published validates a "readability for AI" score against citation
 * outcomes, so a number here would be invented. This module returns
 * OBSERVATIONS — each one a thing that was literally measured on the page,
 * paired with the reason it might matter and an explicit evidence basis.
 *
 * The passage-length band (roughly 135-170 words) comes from an SE Ranking
 * study via claude-seo. It is a STUDY, not Google documentation, and the copy
 * says so. See docs/research/ai-search-visibility.md §6.6 and §7.7 — §6.6 is
 * why this ships as observations or not at all.
 */

import {
  countWords,
  extractVisibleText,
  hasListOrTable,
  headings,
  paragraphTexts,
  type Heading,
} from './html';
import type { EvidenceBasis } from '../types';

/** Lower and upper bound of the passage length the study associates with citation. */
export const CITED_PASSAGE_WORD_BAND = { min: 135, max: 170 } as const;

export interface ReadabilityObservation {
  readonly id: string;
  /** What was measured. A fact about this page, phrased without judgement. */
  readonly observation: string;
  /** Why it might matter, with the source named in the sentence. */
  readonly reason: string;
  readonly evidenceBasis: EvidenceBasis;
}

export interface ReadabilityResult {
  readonly observations: readonly ReadabilityObservation[];
  /**
   * What could not be looked at on this page, so the absence of an observation
   * is never read as a pass.
   */
  readonly notObserved: readonly string[];
  /** Longest paragraph in words, or null when the page had no paragraphs. */
  readonly longestPassageWords: number | null;
}

export interface ReadabilityInput {
  /** Raw HTML of one page. */
  readonly html: string;
  /** Owner-facing name of the page, e.g. 'Services'. */
  readonly pageLabel: string;
}

function describeHeadingHierarchy(list: readonly Heading[]): string | null {
  let previous = 0;
  for (const heading of list) {
    if (previous !== 0 && heading.level > previous + 1) {
      return `a heading jumps from H${previous} straight to H${heading.level}`;
    }
    previous = heading.level;
  }
  return null;
}

/**
 * Observe one page.
 *
 * Pure and synchronous: it takes HTML the caller already fetched. No model is
 * involved and none is needed — every statement here is a count.
 */
export function observeReadability(input: ReadabilityInput): ReadabilityResult {
  const observations: ReadabilityObservation[] = [];
  const notObserved: string[] = [];

  const allHeadings = headings(input.html);
  const h1s = allHeadings.filter((heading) => heading.level === 1);
  const paragraphs = paragraphTexts(input.html);
  const bodyText = extractVisibleText(input.html);

  if (bodyText.length === 0) {
    return {
      observations: [],
      notObserved: [
        `${input.pageLabel}: the page returned no readable text, so nothing could be observed.`,
      ],
      longestPassageWords: null,
    };
  }

  /* Headings --------------------------------------------------------------- */

  if (h1s.length === 0) {
    observations.push({
      id: 'readability.h1.missing',
      observation: `Your ${input.pageLabel} page has no H1 heading.`,
      reason:
        'A heading is the clearest statement of what a page is about, and it is the first thing a ' +
        'machine reads to decide what the page answers.',
      evidenceBasis: 'industry',
    });
  } else if (h1s.length > 1) {
    observations.push({
      id: 'readability.h1.multiple',
      observation: `Your ${input.pageLabel} page has ${h1s.length} H1 headings.`,
      reason:
        'More than one top-level heading leaves the main subject of the page ambiguous to a reader ' +
        'that is skimming structure rather than design.',
      evidenceBasis: 'industry',
    });
  }

  const hierarchyProblem = describeHeadingHierarchy(allHeadings);
  if (hierarchyProblem !== null) {
    observations.push({
      id: 'readability.headings.hierarchy',
      observation: `On your ${input.pageLabel} page, ${hierarchyProblem}.`,
      reason:
        'Heading levels are how a machine works out which text belongs to which section. Skipped ' +
        'levels make the grouping a guess.',
      evidenceBasis: 'industry',
    });
  }

  if (allHeadings.length === 0) {
    notObserved.push(`${input.pageLabel}: heading structure (the page has no headings at all).`);
  }

  /* Passage length --------------------------------------------------------- */

  let longestPassageWords: number | null = null;
  if (paragraphs.length === 0) {
    notObserved.push(
      `${input.pageLabel}: passage length — the page has no <p> blocks, so paragraphs could not be measured.`,
    );
  } else {
    const wordCounts = paragraphs.map(countWords);
    longestPassageWords = wordCounts.reduce((max, value) => (value > max ? value : max), 0);
    if (longestPassageWords > CITED_PASSAGE_WORD_BAND.max * 2) {
      observations.push({
        id: 'readability.passage.long',
        observation: `Your ${input.pageLabel} page has a single ${longestPassageWords}-word block of text.`,
        reason:
          `Studies of AI citations suggest self-contained passages of roughly ` +
          `${CITED_PASSAGE_WORD_BAND.min}-${CITED_PASSAGE_WORD_BAND.max} words get quoted more often ` +
          '(SE Ranking, via claude-seo). We have not verified this against Google documentation.',
        evidenceBasis: 'study',
      });
    }
  }

  /* Answering the heading -------------------------------------------------- */

  const firstHeading = allHeadings[0];
  const firstParagraph = paragraphs[0];
  if (firstHeading !== undefined && firstParagraph !== undefined) {
    const openingWords = countWords(firstParagraph);
    if (openingWords < 20) {
      observations.push({
        id: 'readability.opening.thin',
        observation:
          `Your ${input.pageLabel} page opens with ${openingWords} words under the heading ` +
          `"${firstHeading.text}".`,
        reason:
          'An assistant quoting your page usually takes the text closest to the heading. A short ' +
          'opening gives it very little to quote.',
        evidenceBasis: 'industry',
      });
    }
  } else {
    notObserved.push(`${input.pageLabel}: whether the opening text answers the heading.`);
  }

  /* Structure -------------------------------------------------------------- */

  if (!hasListOrTable(input.html)) {
    observations.push({
      id: 'readability.structure.no_list',
      observation: `Your ${input.pageLabel} page has no list or table.`,
      reason:
        'Services, prices and hours in a list or table are easier to lift accurately than the same ' +
        'facts inside a paragraph.',
      evidenceBasis: 'industry',
    });
  }

  return { observations, notObserved, longestPassageWords };
}
