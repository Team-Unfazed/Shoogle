/**
 * Humanization guards. Owner: Yash.
 *
 * ================= WHY THESE ARE CODE AND NOT PROMPT TEXT ==================
 *
 * "Write naturally, avoid clichés, do not stuff keywords" in a prompt is a
 * request. A model honours it most of the time, which is the worst failure mode
 * available: the bad output is rare enough that nobody checks, and it goes out
 * in a real business's name.
 *
 * So the rules are executable and run on what the model ACTUALLY returned.
 * Output that trips them is rejected and regenerated, not published and hoped
 * about.
 *
 * WHAT "HUMAN" MEANS HERE, CONCRETELY
 * -----------------------------------
 *   1. No AI-tell phrases. The blocklist below is the specific vocabulary that
 *      makes a caption read as machine-written to anyone who has seen a few.
 *   2. No keyword stuffing. A keyword repeated past a natural rate reads as
 *      spam to a reader AND is what search engines penalise, so this is not
 *      merely a taste rule.
 *   3. Burstiness. Human writing varies sentence length; models default to a
 *      metronome of similar-length clauses. Low variance is the most reliable
 *      machine tell that survives a good prompt.
 *   4. No hollow openers. "Looking for X? Look no further" is a template, not
 *      a sentence a shop owner writes.
 *
 * These are advisory-to-blocking by severity, because a false positive that
 * blocks a good caption costs the owner a post. Clichés and stuffing block;
 * burstiness advises.
 */

/* -------------------------------------------------------------------------- */
/* The blocklist                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Phrases that mark text as machine-written.
 *
 * Matched case-insensitively on word boundaries. Kept explicit rather than
 * clever: every entry here is a phrase someone can argue with, and an
 * argument about a listed phrase is a better conversation than an argument
 * about a regex.
 */
export const AI_CLICHES: readonly string[] = [
  'in today’s fast-paced world',
  "in today's fast-paced world",
  'in the ever-evolving',
  'look no further',
  'nestled in the heart of',
  'a testament to',
  'elevate your',
  'unlock the',
  'unleash the',
  'delve into',
  'embark on a journey',
  'game-changer',
  'game changer',
  'take it to the next level',
  'the perfect blend of',
  'when it comes to',
  'rest assured',
  'we’ve got you covered',
  "we've got you covered",
  'at the end of the day',
  'more than just a',
  'redefine',
  'transformative',
  'seamless experience',
  'cutting-edge',
  'state-of-the-art',
  'unparalleled',
  'bespoke',
  'curated selection',
  'dive into',
];

/**
 * Openers that are templates rather than sentences.
 * Checked against the first sentence only, where they do their damage.
 */
export const HOLLOW_OPENERS: readonly string[] = [
  'are you looking for',
  'looking for',
  'do you want',
  'imagine a',
  'picture this',
  'ever wondered',
];

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

export type HumanizeCode =
  | 'ai_cliche'
  | 'keyword_stuffing'
  | 'hollow_opener'
  | 'low_burstiness'
  | 'repeated_sentence_opener';

export interface HumanizeFinding {
  readonly code: HumanizeCode;
  /** Engineer-facing. Shown to the owner only when they ask why a redraft happened. */
  readonly message: string;
  /**
   * Blocking findings reject the draft and regenerate. Advisory ones are
   * recorded and shown, because a false positive must not cost a post.
   */
  readonly blocking: boolean;
  /** The offending text, where quoting it helps. */
  readonly evidence: string | null;
}

export interface HumanizeReport {
  /** True when nothing BLOCKING was found. Advisory findings may still exist. */
  readonly ok: boolean;
  readonly findings: readonly HumanizeFinding[];
}

/* -------------------------------------------------------------------------- */
/* Text utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Split into sentences.
 *
 * Deliberately simple. It has to work on Hinglish and on Devanagari (product
 * rule 12), where a clever English-centric tokeniser does worse than a plain
 * one. `।` is the Devanagari danda, which ends a sentence in Hindi and
 * Marathi and which a naive `[.!?]` split would miss entirely.
 */
export function sentences(text: string): string[] {
  return text
    .split(/[.!?।]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Word count in a way that survives Devanagari.
 *
 * `\p{L}\p{M}\p{N}` rather than `\w`: `\w` is ASCII-only, so it counts a
 * Marathi caption as zero words and every stuffing check would pass
 * vacuously. The `\p{M}` is the same combining-mark fix the hashtag regex
 * needed on Day 1.
 */
export function words(text: string): string[] {
  return text.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

/* -------------------------------------------------------------------------- */
/* The checks                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How often one keyword may appear before it reads as stuffing.
 *
 * Expressed as a share of total words plus an absolute floor, because a
 * percentage alone punishes short captions: "Vashi salon" in a six-word caption
 * is 33% and completely natural. The floor lets short text breathe.
 */
export const MAX_KEYWORD_SHARE = 0.06;
export const KEYWORD_FREE_USES = 2;

/** Below this, sentence lengths are too uniform to read as a person. */
export const MIN_BURSTINESS = 0.25;

export function reviewHumanness(
  text: string,
  keywords: readonly string[] = [],
): HumanizeReport {
  const findings: HumanizeFinding[] = [];
  const lower = text.toLowerCase();

  /* -- 1. Clichés -------------------------------------------------------- */
  for (const cliche of AI_CLICHES) {
    if (lower.includes(cliche.toLowerCase())) {
      findings.push({
        code: 'ai_cliche',
        message: `"${cliche}" reads as machine-written. Rewrite that line.`,
        blocking: true,
        evidence: cliche,
      });
    }
  }

  /* -- 2. Hollow openers ------------------------------------------------- */
  const [opener] = sentences(text);
  if (opener !== undefined) {
    const openerLower = opener.toLowerCase();
    for (const hollow of HOLLOW_OPENERS) {
      if (openerLower.startsWith(hollow)) {
        findings.push({
          code: 'hollow_opener',
          message: `Opening with "${hollow}" is a template, not a sentence. Start with something real.`,
          blocking: true,
          evidence: opener,
        });
        break;
      }
    }
  }

  /* -- 3. Keyword stuffing ----------------------------------------------- */
  const allWords = words(lower);
  const total = allWords.length;
  if (total > 0) {
    for (const keyword of keywords) {
      const keywordWords = words(keyword.toLowerCase());
      if (keywordWords.length === 0) continue;
      const occurrences = countPhrase(allWords, keywordWords);
      const allowance = Math.max(KEYWORD_FREE_USES, Math.floor(total * MAX_KEYWORD_SHARE));
      if (occurrences > allowance) {
        findings.push({
          code: 'keyword_stuffing',
          message: `"${keyword}" appears ${occurrences} times in ${total} words. That reads as stuffing, and search engines treat it that way too.`,
          blocking: true,
          evidence: keyword,
        });
      }
    }
  }

  /* -- 4. Burstiness ----------------------------------------------------- */
  const lengths = sentences(text).map((sentence) => words(sentence).length);
  if (lengths.length >= 3) {
    const score = burstiness(lengths);
    if (score < MIN_BURSTINESS) {
      findings.push({
        code: 'low_burstiness',
        // Advisory: uniform sentence length is a strong tell but not proof, and
        // blocking on it would reject genuinely tidy writing.
        message: `Every sentence is about the same length (burstiness ${score.toFixed(2)}). People vary more than this.`,
        blocking: false,
        evidence: null,
      });
    }
  }

  /* -- 5. Repeated sentence openers -------------------------------------- */
  const openers = sentences(text)
    .map((sentence) => words(sentence)[0]?.toLowerCase())
    .filter((word): word is string => word !== undefined);
  const repeated = firstRepeat(openers);
  if (repeated !== null) {
    findings.push({
      code: 'repeated_sentence_opener',
      message: `More than one sentence starts with "${repeated}".`,
      blocking: false,
      evidence: repeated,
    });
  }

  return { ok: !findings.some((finding) => finding.blocking), findings };
}

/** Occurrences of a multi-word phrase in a word list. */
function countPhrase(haystack: readonly string[], needle: readonly string[]): number {
  if (needle.length === 0) return 0;
  let count = 0;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) count += 1;
  }
  return count;
}

/**
 * Coefficient of variation of sentence length: standard deviation over mean.
 *
 * Scale-free on purpose, so a caption of long sentences and one of short
 * sentences are judged on how much they VARY rather than on how long they are.
 */
export function burstiness(lengths: readonly number[]): number {
  if (lengths.length < 2) return 1;
  const mean = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  if (mean === 0) return 0;
  const variance = lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

function firstRepeat(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    // Two-letter and shorter words repeat naturally ("a", "we", "it").
    if (value.length <= 2) continue;
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}
