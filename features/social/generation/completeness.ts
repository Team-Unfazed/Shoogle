/**
 * Completeness guard. Owner: Yash.
 *
 * ==================== WHY THIS GUARD HAD TO BE ADDED ========================
 *
 * The first real Gemini call returned this, and every other guard accepted it:
 *
 *     "The studio is completely quiet on a Tuesday morning. No rushing
 *      between clients, just enough time"
 *
 * It invents nothing, so `fabrication.ts` passed it. It reads like a person, so
 * `humanize.ts` passed it. It is also cut off mid-sentence, and it would have
 * been handed to the composer looking finished.
 *
 * That is the dangerous shape: a truncated caption is not obviously broken the
 * way an empty one is. It reads fine until the last three words, and an owner
 * skimming a draft on a phone will publish it.
 *
 * ===================== WHY NOT "MUST END WITH A FULL STOP" ==================
 *
 * Because people genuinely write captions without one. "Walk in any time" and
 * "Open today" are finished sentences and a punctuation rule would reject both,
 * costing the owner a perfectly good caption on every draft.
 *
 * So this looks for POSITIVE EVIDENCE of truncation rather than for the absence
 * of a full stop:
 *
 *   - it ends on a word that cannot end a sentence ("…and", "…to", "…the")
 *   - it ends on punctuation that promises more ("…clients,")
 *   - it leaves a bracket or quotation mark open
 *   - it trails a long unfinished fragment after an otherwise complete sentence
 *   - it runs on far past the length anyone writes without any punctuation
 *
 * Short unpunctuated copy trips none of those, which is the point.
 *
 * ===================== WHY IT IS HERE AND NOT IN THE PROVIDER ===============
 *
 * The authoritative signal is the provider's own `finishReason: MAX_TOKENS`,
 * but `AiTextResult` has no field for it — that is Pranay's contract, and one
 * additive edit to his file was authorised, not an open account. More
 * importantly, a model can stop mid-sentence WITHOUT hitting the token ceiling,
 * so a finishReason check alone would not have caught every case.
 *
 * Judging the text also means truncation flows through `judgeDraft`, so the
 * generator RETRIES it like any other rejected draft rather than aborting.
 */

import { sentences, words } from './humanize';

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

export type CompletenessCode =
  | 'empty'
  | 'dangling_word'
  | 'dangling_punctuation'
  | 'unclosed_delimiter'
  | 'unfinished_final_sentence'
  | 'runs_on_unpunctuated';

export interface CompletenessFinding {
  readonly code: CompletenessCode;
  readonly message: string;
  /** The tail of the text that gave it away. */
  readonly evidence: string;
}

export interface CompletenessReport {
  /** True when nothing suggests the text was cut off. */
  readonly ok: boolean;
  readonly findings: readonly CompletenessFinding[];
}

/* -------------------------------------------------------------------------- */
/* Vocabulary and thresholds                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Words that cannot end a finished sentence. Ending on one of these is the
 * clearest text-level evidence that a response was cut off.
 */
const DANGLING_WORDS: ReadonlySet<string> = new Set([
  'and', 'or', 'but', 'so', 'because', 'if', 'when', 'while', 'after', 'before',
  'with', 'without', 'for', 'to', 'from', 'of', 'in', 'on', 'at', 'by', 'as',
  'into', 'about', 'over', 'under', 'than', 'then', 'that', 'which', 'who',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must',
  'our', 'your', 'their', 'its', 'this', 'these', 'those', 'every', 'each',
  'very', 'more', 'most', 'just', 'also', 'plus',
]);

/** Terminal marks, including the Devanagari danda and an ellipsis. */
const TERMINAL_MARKS = /[.!?।…]/u;

/** Punctuation that promises another clause. */
const CONTINUING_PUNCTUATION = /[,;:\-–—]$/u;

/**
 * How many words may trail after the last complete sentence.
 *
 * Three, because a real sign-off runs to about that: "Vashi, Navi Mumbai" is
 * exactly three and is a shape local businesses genuinely write. Two rejected
 * it, which is a false positive on a good caption.
 *
 * The trade-off, stated plainly: a truncation that happens to stop within three
 * words of a full stop slips past this particular check. The fragment that
 * prompted the guard was seven words, and the dangling-word and
 * dangling-punctuation checks catch most short ones. Erring the other way costs
 * the owner a caption on every draft that ends with a place name.
 */
export const MAX_TRAILING_FRAGMENT_WORDS = 3;

/**
 * How long text may run with no terminal punctuation at all before it reads as
 * cut off rather than terse.
 *
 * Twelve is generous on purpose. "Walk in any time" is four; a caption that
 * reaches a dozen words without a single mark is not a stylistic choice.
 */
export const MAX_UNPUNCTUATED_WORDS = 12;

/* -------------------------------------------------------------------------- */
/* The check                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Strip trailing hashtag-only lines.
 *
 * Instagram hashtags live on their own line at the end, and they are not
 * sentences — judging completeness against "#vashi #haircut" would reject every
 * correctly formatted Instagram caption.
 */
export function bodyWithoutTrailingHashtags(text: string): string {
  const lines = text.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1] ?? '';
    if (last.trim() === '' || /^\s*(?:#[\p{L}\p{M}\p{N}_]+\s*)+$/u.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n').trim();
}

/** Trailing decoration that does not affect whether a sentence finished. */
function stripTrailingDecoration(value: string): string {
  return value
    .replace(/[\s"'”’)\]}»]+$/u, '')
    .replace(/[\p{Extended_Pictographic}️‍]+$/gu, '')
    .trim();
}

export function reviewCompleteness(rawText: string): CompletenessReport {
  const findings: CompletenessFinding[] = [];
  const text = bodyWithoutTrailingHashtags(rawText);

  if (text.trim() === '') {
    return {
      ok: false,
      findings: [
        { code: 'empty', message: 'The model returned no usable text.', evidence: '' },
      ],
    };
  }

  const trimmed = stripTrailingDecoration(text);
  const tailSample = trimmed.slice(-60);

  /* -- 1. Punctuation that promises more --------------------------------- */
  if (CONTINUING_PUNCTUATION.test(trimmed)) {
    findings.push({
      code: 'dangling_punctuation',
      message: 'The text stops on punctuation that expects another clause, so it was cut off.',
      evidence: tailSample,
    });
  }

  /* -- 2. A word that cannot end a sentence ------------------------------ */
  /*
   * Only when the text does NOT end on a terminal mark.
   *
   * "…the quietest time to come in." ends on "in", which is in the list, and is
   * a finished sentence — "come in" is a phrasal verb and the full stop settles
   * it. Checking the last word regardless of punctuation rejected that caption,
   * which is a common and perfectly good shape.
   *
   * A writer who typed the full stop meant to stop.
   */
  const allWords = words(trimmed);
  const endsOnTerminal = TERMINAL_MARKS.test(trimmed.slice(-1));
  const lastWord = allWords[allWords.length - 1]?.toLowerCase();
  if (!endsOnTerminal && lastWord !== undefined && DANGLING_WORDS.has(lastWord)) {
    findings.push({
      code: 'dangling_word',
      message: `The text ends on "${lastWord}", which cannot finish a sentence.`,
      evidence: tailSample,
    });
  }

  /* -- 3. Something left open -------------------------------------------- */
  const unclosed = unclosedDelimiter(text);
  if (unclosed !== null) {
    findings.push({
      code: 'unclosed_delimiter',
      message: `The text leaves ${unclosed} open, so it did not finish.`,
      evidence: tailSample,
    });
  }

  /* -- 4. A fragment trailing a complete sentence ------------------------ */
  const lastTerminal = lastIndexOfTerminal(trimmed);
  if (lastTerminal >= 0) {
    const tail = stripTrailingDecoration(trimmed.slice(lastTerminal + 1));
    const tailWords = words(tail).length;
    if (tailWords > MAX_TRAILING_FRAGMENT_WORDS) {
      findings.push({
        code: 'unfinished_final_sentence',
        message: `The last sentence is unfinished — ${tailWords} words trail after the final full stop.`,
        evidence: tail,
      });
    }
  } else if (allWords.length > MAX_UNPUNCTUATED_WORDS) {
    /* -- 5. Runs on with no punctuation at all --------------------------- */
    findings.push({
      code: 'runs_on_unpunctuated',
      message: `${allWords.length} words with no sentence ending at all reads as cut off, not as terse.`,
      evidence: tailSample,
    });
  }

  return { ok: findings.length === 0, findings };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function lastIndexOfTerminal(text: string): number {
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const char = text[i];
    if (char !== undefined && TERMINAL_MARKS.test(char)) return i;
  }
  return -1;
}

/**
 * An unclosed bracket or double quote, or null.
 *
 * Apostrophes are deliberately NOT counted: "don't" and "owner's" make an odd
 * count of `'` in perfectly finished text, so checking them would reject good
 * copy constantly. Double quotes and brackets carry no such ambiguity.
 */
function unclosedDelimiter(text: string): string | null {
  const pairs: [string, string, string][] = [
    ['(', ')', 'a bracket'],
    ['[', ']', 'a bracket'],
    ['{', '}', 'a brace'],
  ];
  for (const [open, close, label] of pairs) {
    const opens = countChar(text, open);
    const closes = countChar(text, close);
    if (opens > closes) return label;
  }
  if (countChar(text, '"') % 2 !== 0) return 'a quotation mark';
  if (countChar(text, '“') > countChar(text, '”')) return 'a quotation mark';
  return null;
}

function countChar(text: string, char: string): number {
  let count = 0;
  for (const c of text) if (c === char) count += 1;
  return count;
}

/** Exposed for tests and for a future "why was this redrafted" surface. */
export function finalSentence(text: string): string {
  const parts = sentences(bodyWithoutTrailingHashtags(text));
  return parts[parts.length - 1] ?? '';
}
