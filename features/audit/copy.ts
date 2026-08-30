/**
 * Owner-facing wording for the audit. Owner: Pranay.
 *
 * Every string here is read by a salon owner in Nerul on a 390pt screen between
 * two customers. Rules, from docs/research/local-seo-methodology.md §5.4:
 *
 *  - English UI (product rule 12), but plain English. No "NAP", no "schema",
 *    no "citations", no "SoLV", no "Improve SEO".
 *  - Say what was seen, then what to do. Never say what Google "will" do — we
 *    do not know that, and a practitioner heuristic is not a Google fact (§1.3).
 *  - Never turn an unknown into a number.
 */

import { UNAVAILABLE_COPY, type UnavailableReason } from '@/lib/state/DataState';

import type { NotCheckedReason } from './types';

type ExtraReason = 'provider_error' | 'still_loading' | 'check_error';

const EXTRA_REASON_LABEL: Record<ExtraReason, string> = {
  // An error is not an empty profile. "Google didn't respond" is the phrasing
  // §3.4 uses, and it is the truth: we asked and got nothing back.
  provider_error: "Google didn't respond",
  still_loading: 'still loading',
  // Deliberately not blamed on Google. If our own check threw, saying "Google
  // didn't respond" would be a false statement about the owner's listing.
  check_error: "Shoogle couldn't finish this check",
};

const UNAVAILABLE_REASON_LABEL: Record<UnavailableReason, string> = {
  not_connected: 'not connected',
  auth_expired: 'needs reconnecting',
  not_supported: 'Google does not share this',
  no_data_yet: 'nothing there yet',
  insufficient_data: 'not enough to judge',
  offline: 'you were offline',
  rate_limited: 'Google was limiting us',
  requires_upgrade: 'not on your plan',
};

function isUnavailableReason(reason: NotCheckedReason): reason is UnavailableReason {
  return reason !== 'provider_error' && reason !== 'still_loading' && reason !== 'check_error';
}

/** Short suffix for an `uncheckedAreas` line, e.g. "Reviews — not connected". */
export function notCheckedReasonLabel(reason: NotCheckedReason): string {
  return isUnavailableReason(reason)
    ? UNAVAILABLE_REASON_LABEL[reason]
    : EXTRA_REASON_LABEL[reason];
}

/**
 * Longer copy, for a detail screen. Reuses `UNAVAILABLE_COPY` where it applies
 * so the audit and the rest of the app say the same thing about the same state.
 */
export function notCheckedReasonBody(reason: NotCheckedReason): string {
  if (isUnavailableReason(reason)) return UNAVAILABLE_COPY[reason].body;
  if (reason === 'provider_error') {
    return 'We asked Google for this and did not get an answer. Nothing is wrong with your listing — we just could not read it this time.';
  }
  if (reason === 'check_error') {
    return 'This is a fault on our side, not a problem with your listing. It will be checked again on the next run.';
  }
  return 'We were still fetching this when the audit ran.';
}

/** "Shoogle checked 6 of 33 things." — the caveat that must never be optional. */
export function coverageSentence(ran: number, applicable: number): string {
  const thing = applicable === 1 ? 'thing' : 'things';
  return `Shoogle checked ${ran} of ${applicable} ${thing}.`;
}

/**
 * The message attached to `unavailable('insufficient_data', ...)` when the score
 * gates fail. Findings are still returned alongside it (§3.3) — this explains a
 * missing NUMBER, it never explains away a real problem.
 */
export function insufficientDataMessage(ran: number, applicable: number): string {
  return (
    `${coverageSentence(ran, applicable)} That isn't enough to score your profile ` +
    `honestly — here's what we could and couldn't see.`
  );
}

/** "2 reviews" / "1 review". Small, but the alternative reads like a robot. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}
