/**
 * Captions. Owner: Yash.
 *
 * A caption is the only part of a post the owner reads word for word, so this
 * file is careful about two things:
 *
 * - **Counting.** Length is counted in Unicode code points via the shared
 *   `countCharacters`, not `String.length`. Devanagari and emoji are normal
 *   here (product rule 12 allows Hindi, Marathi and Hinglish business copy),
 *   and a UTF-16 length would tell an owner their Marathi caption is twice as
 *   long as it is.
 *
 * - **Provenance.** `origin` records whether a model wrote it. Generated copy
 *   is never presented as the owner's own words, and editing generated copy
 *   moves it to `generated_edited` rather than laundering it to `owner`.
 *
 * Platform length limits are NOT here. They live in `platforms.ts` and are all
 * unverified — this file enforces only rules Shoogle itself owns.
 */

import { countCharacters } from '@/components/ui';

import { checkCaptionLength, checkHashtagCount, type CheckResult } from './platforms';
import type { Caption, CaptionLanguage, Platform } from './types';

/* -------------------------------------------------------------------------- */
/* Construction                                                               */
/* -------------------------------------------------------------------------- */

export function ownerCaption(
  body: string,
  language: CaptionLanguage = 'en',
  hashtags: string[] = [],
): Caption {
  return { body, hashtags: normaliseHashtags(hashtags), language, origin: 'owner', generatedBy: null };
}

export function generatedCaption(
  body: string,
  language: CaptionLanguage,
  hashtags: string[],
  generatedBy: string,
): Caption {
  return {
    body,
    hashtags: normaliseHashtags(hashtags),
    language,
    origin: 'generated',
    generatedBy,
  };
}

/**
 * Record an owner's edit. Generated copy the owner has touched becomes
 * `generated_edited` and keeps `generatedBy`, so the trail survives; copy the
 * owner wrote stays theirs.
 */
export function editCaption(caption: Caption, patch: Partial<Omit<Caption, 'origin'>>): Caption {
  const next: Caption = {
    ...caption,
    ...patch,
    hashtags: patch.hashtags ? normaliseHashtags(patch.hashtags) : caption.hashtags,
    origin: caption.origin === 'owner' ? 'owner' : 'generated_edited',
  };
  return next;
}

/* -------------------------------------------------------------------------- */
/* Hashtags                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Strips leading '#', drops blanks and duplicates, preserves order and case.
 * Case is preserved because "#NaviMumbai" reads better than "#navimumbai" and
 * platforms match case-insensitively anyway.
 */
export function normaliseHashtags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const tag = entry.trim().replace(/^#+/, '').trim();
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * Hashtags written inline in the body, in the order they appear.
 *
 * `\p{M}` is in the class deliberately: Devanagari vowel signs are combining
 * marks, so without it "#नवीमुंबई" is truncated to "#नव" — which is what a
 * Marathi or Hindi caption would silently publish.
 */
export function extractInlineHashtags(body: string): string[] {
  const matches = body.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? [];
  return normaliseHashtags(matches);
}

/** The text as it will actually be sent: body, then any trailing hashtags. */
export function renderCaption(caption: Caption): string {
  const inline = new Set(extractInlineHashtags(caption.body).map((t) => t.toLowerCase()));
  const trailing = caption.hashtags.filter((tag) => !inline.has(tag.toLowerCase()));
  if (trailing.length === 0) return caption.body;
  const separator = caption.body.endsWith('\n') ? '' : '\n\n';
  return `${caption.body}${separator}${trailing.map((tag) => `#${tag}`).join(' ')}`;
}

/** Length of the rendered caption, counted in code points. */
export function captionLength(caption: Caption): number {
  return countCharacters(renderCaption(caption));
}

/** Every hashtag that will be sent, inline plus trailing. */
export function allHashtags(caption: Caption): string[] {
  return normaliseHashtags([...extractInlineHashtags(caption.body), ...caption.hashtags]);
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type CaptionProblem =
  /** Shoogle's own rule: an empty caption is not a post. */
  | 'empty'
  /** A platform limit was exceeded. */
  | 'too_long'
  | 'too_many_hashtags';

export interface CaptionIssue {
  problem: CaptionProblem;
  platform: Platform | null;
  message: string;
}

export interface CaptionReview {
  /** True when nothing is wrong AND nothing was left unchecked. */
  ok: boolean;
  issues: CaptionIssue[];
  /**
   * Platforms whose limits Shoogle could not check because they have not been
   * researched. The composer must show this, not hide it behind a green tick.
   */
  unchecked: Platform[];
}

/**
 * Review a caption for the platforms it is aimed at.
 *
 * `ok` is true only when there are no issues; `unchecked` being non-empty does
 * not make it false — the caption may well be fine — but the caller is
 * required to look at it. That distinction is the whole point of the
 * `unverified` outcome in `platforms.ts`.
 */
export function reviewCaption(caption: Caption, platforms: readonly Platform[]): CaptionReview {
  const issues: CaptionIssue[] = [];
  const unchecked = new Set<Platform>();

  if (renderCaption(caption).trim().length === 0) {
    issues.push({ problem: 'empty', platform: null, message: 'This post has no caption yet.' });
  }

  const length = captionLength(caption);
  const tagCount = allHashtags(caption).length;

  for (const platform of platforms) {
    const lengthCheck: CheckResult = checkCaptionLength(platform, length);
    if (lengthCheck.outcome === 'violation') {
      issues.push({ problem: 'too_long', platform, message: lengthCheck.message });
    } else if (lengthCheck.outcome === 'unverified') {
      unchecked.add(platform);
    }

    const tagCheck: CheckResult = checkHashtagCount(platform, tagCount);
    if (tagCheck.outcome === 'violation') {
      issues.push({ problem: 'too_many_hashtags', platform, message: tagCheck.message });
    } else if (tagCheck.outcome === 'unverified') {
      unchecked.add(platform);
    }
  }

  return { ok: issues.length === 0, issues, unchecked: [...unchecked] };
}
