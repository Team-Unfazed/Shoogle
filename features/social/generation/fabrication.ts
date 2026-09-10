/**
 * Anti-fabrication guard. Owner: Yash.
 *
 * ===================== THE MOST IMPORTANT FILE HERE =========================
 *
 * A weak caption costs a business nothing. A FABRICATED one costs it a customer
 * who arrives expecting a 20% discount that was never offered, or books a
 * service the shop does not provide, or turns up at 8pm because a model wrote
 * "open late" about a place that closes at six.
 *
 * The owner is not in the room when this happens. They find out from the
 * customer.
 *
 * So every claim in generated text must be traceable to `BusinessContext`, and
 * anything that is not is rejected before it reaches the owner — not flagged,
 * not lowered in confidence. Rejected.
 *
 * WHAT COUNTS AS A CLAIM
 * ----------------------
 *   - a NUMBER that is not in the context (prices, percentages, years,
 *     quantities, phone numbers)
 *   - a DISCOUNT or offer language when `context.offer` is null
 *   - a SERVICE the business does not list
 *   - a SUPERLATIVE or credential ("best in Mumbai", "award-winning",
 *     "certified") that nobody supplied
 *   - a GUARANTEE ("guaranteed results", "100% satisfaction")
 *
 * WHY IT ERRS TOWARDS REJECTING
 * -----------------------------
 * A false positive costs one regeneration, which the owner never sees. A false
 * negative publishes a lie in their name. These are not comparable, so the
 * checks are deliberately eager and the regeneration path is cheap.
 */

import { assertableFacts, hasOffer, type BusinessContext } from './context';
import { words } from './humanize';

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

export type FabricationCode =
  | 'unsourced_number'
  | 'unsourced_discount'
  | 'unsourced_service'
  | 'unsourced_superlative'
  | 'unsourced_guarantee'
  | 'unsourced_contact';

export interface FabricationFinding {
  readonly code: FabricationCode;
  readonly message: string;
  /** The text that could not be traced back to the context. */
  readonly evidence: string;
}

export interface FabricationReport {
  /** True when every claim traces to `BusinessContext`. */
  readonly ok: boolean;
  readonly findings: readonly FabricationFinding[];
}

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Words that assert a discount exists.
 *
 * `off` is deliberately NOT here as a bare word. "Putting off a haircut" and
 * "just off the main road" are ordinary English, and flagging them rejected
 * honest copy in testing. Discount senses of "off" are caught by
 * `DISCOUNT_PATTERNS` instead, which require a number or "flat" in front.
 *
 * That distinction is the difference between a guard and a nuisance: this file
 * errs towards rejecting, but rejecting valid prose on every draft would make
 * generation unusable rather than safe.
 */
const DISCOUNT_TERMS: readonly string[] = [
  'discount',
  'sale',
  'deal',
  'complimentary',
  'bogo',
  'voucher',
  'coupon',
  'cashback',
];

/** Discount phrasings that need context to be a claim rather than ordinary prose. */
const DISCOUNT_PATTERNS: readonly RegExp[] = [
  /\b(?:\d+\s?%?|flat|half|₹\s?\d[\d,]*)\s+off\b/i,
  /\boff\s+(?:all|any|every|your\s+(?:first|next))\b/i,
  /\bfree\s+(?:with|when|on\s+every|for\s+the\s+first)\b/i,
  /\b(?:special|introductory|festive|launch)\s+(?:price|offer|rate)\b/i,
  /\bbuy\s+\w+\s+get\b/i,
  /\bsave\s+(?:\d|₹|up\s+to)/i,
];

/** Claims of standing that nobody can verify from the context. */
const SUPERLATIVES: readonly string[] = [
  'best',
  'finest',
  'top-rated',
  'top rated',
  'number one',
  'no.1',
  'no. 1',
  '#1',
  'leading',
  'award-winning',
  'award winning',
  'premier',
  'renowned',
  'famous',
  'trusted by thousands',
  'voted',
  'certified',
  'accredited',
  'licensed',
];

const GUARANTEES: readonly string[] = [
  'guaranteed',
  'guarantee',
  '100% satisfaction',
  'money-back',
  'money back',
  'risk-free',
  'risk free',
  'no questions asked',
  'permanent results',
];

/**
 * Numbers a caption may carry without a source.
 *
 * Ordinary dates and times are not claims about the business — "see you on the
 * 5th" invents nothing. Bare small integers used as counts in ordinary prose
 * ("two chairs free") are also not the failure mode this guards; prices,
 * percentages and phone numbers are.
 */
const SAFE_NUMBER_PATTERN = /^(?:[0-2]?\d(?::[0-5]\d)?(?:\s?[ap]m)?|[12]\d{3}|\d{1,2}(?:st|nd|rd|th))$/i;

/* -------------------------------------------------------------------------- */
/* The check                                                                  */
/* -------------------------------------------------------------------------- */

export function reviewFabrication(text: string, context: BusinessContext): FabricationReport {
  const findings: FabricationFinding[] = [];
  const lower = text.toLowerCase();
  const factsLower = assertableFacts(context).map((fact) => fact.toLowerCase());
  const factsBlob = factsLower.join(' • ');

  const sourced = (candidate: string): boolean => factsBlob.includes(candidate.toLowerCase());

  /* -- 1. Discounts, when no offer exists -------------------------------- */
  if (!hasOffer(context)) {
    for (const term of DISCOUNT_TERMS) {
      if (containsWord(lower, term) && !sourced(term)) {
        findings.push({
          code: 'unsourced_discount',
          message: `This mentions "${term}", but no offer is recorded for this business. Shoogle will not advertise a discount nobody set.`,
          evidence: term,
        });
      }
    }
    for (const pattern of DISCOUNT_PATTERNS) {
      const match = pattern.exec(text);
      if (match !== null && !sourced(match[0])) {
        findings.push({
          code: 'unsourced_discount',
          message: `"${match[0].trim()}" advertises a discount, but no offer is recorded for this business.`,
          evidence: match[0].trim(),
        });
      }
    }
  }

  /* -- 2. Percentages and money ------------------------------------------ */
  for (const match of text.matchAll(/\d+\s?%/g)) {
    const value = match[0].replace(/\s+/g, '');
    if (!sourced(value) && !sourced(value.replace('%', ''))) {
      findings.push({
        code: 'unsourced_number',
        message: `"${value}" is not in this business's details. A percentage nobody supplied is an invented claim.`,
        evidence: value,
      });
    }
  }

  for (const match of text.matchAll(/(?:₹|rs\.?\s?|inr\s?)\s?\d[\d,]*/gi)) {
    const value = match[0].trim();
    if (!sourced(value) && !sourced(value.replace(/[^\d]/g, ''))) {
      findings.push({
        code: 'unsourced_number',
        message: `"${value}" is a price that is not in this business's details.`,
        evidence: value,
      });
    }
  }

  /* -- 3. Phone numbers -------------------------------------------------- */
  for (const match of text.matchAll(/\b\d{10}\b|\+\d{2}[\s-]?\d{10}\b/g)) {
    findings.push({
      code: 'unsourced_contact',
      message: `"${match[0]}" looks like a phone number. Shoogle does not put contact details it was not given into a post.`,
      evidence: match[0],
    });
  }

  /* -- 4. Other bare numbers --------------------------------------------- */
  for (const match of text.matchAll(/\b\d[\d,.]*\b/g)) {
    const raw = match[0];
    if (SAFE_NUMBER_PATTERN.test(raw)) continue;
    if (sourced(raw)) continue;
    // Already reported as a percentage, price or phone number.
    if (findings.some((finding) => finding.evidence.includes(raw))) continue;
    findings.push({
      code: 'unsourced_number',
      message: `"${raw}" is a number that does not appear in this business's details.`,
      evidence: raw,
    });
  }

  /* -- 5. Superlatives and credentials ----------------------------------- */
  for (const term of SUPERLATIVES) {
    if (lower.includes(term) && !sourced(term)) {
      findings.push({
        code: 'unsourced_superlative',
        message: `"${term}" is a claim about standing that nothing in this business's details supports.`,
        evidence: term,
      });
    }
  }

  /* -- 6. Guarantees ------------------------------------------------------ */
  for (const term of GUARANTEES) {
    if (lower.includes(term) && !sourced(term)) {
      findings.push({
        code: 'unsourced_guarantee',
        message: `"${term}" promises an outcome on the business's behalf. Shoogle does not make guarantees nobody authorised.`,
        evidence: term,
      });
    }
  }

  return { ok: findings.length === 0, findings };
}

/**
 * Whether a generated post names a service the business does not offer.
 *
 * Separate from `reviewFabrication` because it needs a vocabulary of what the
 * CATEGORY plausibly offers, which is caller-supplied: Shoogle cannot enumerate
 * every service a salon might list, so this checks a specific suspected service
 * rather than scanning for unknown ones.
 */
export function namesUnlistedService(
  text: string,
  context: BusinessContext,
  candidateServices: readonly string[],
): FabricationFinding[] {
  const lower = text.toLowerCase();
  const offered = context.services.map((service) => service.toLowerCase());

  return candidateServices
    .filter((service) => {
      const candidate = service.toLowerCase();
      return lower.includes(candidate) && !offered.some((own) => own.includes(candidate));
    })
    .map((service) => ({
      code: 'unsourced_service' as const,
      message: `This offers "${service}", which is not one of this business's listed services.`,
      evidence: service,
    }));
}

function containsWord(haystackLower: string, term: string): boolean {
  if (term.includes(' ')) return haystackLower.includes(term);
  return words(haystackLower).includes(term);
}
