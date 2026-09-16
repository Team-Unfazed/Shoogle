import { ready, unwrapOrNull } from '@/lib/state/DataState';
import type { AiProvider, AiTextResult } from '@/features/seo/ai';

import {
  createSocialGenerator,
  judgeDraft,
  MAX_TRAILING_FRAGMENT_WORDS,
  MAX_UNPUNCTUATED_WORDS,
  reviewCompleteness,
  type BusinessContext,
  type ContentObjective,
} from '../index';

/**
 * THE COMPLETENESS GUARD.
 *
 * Added after the first live Gemini call returned this, which every other
 * guard accepted:
 *
 *   "The studio is completely quiet on a Tuesday morning. No rushing between
 *    clients, just enough time"
 *
 * It invents nothing and it reads like a person. It is also cut off. That is
 * the dangerous shape — it looks finished until the last three words, and an
 * owner skimming a draft on a phone publishes it.
 *
 * The hard half of this guard is NOT catching truncation; it is catching
 * truncation without rejecting captions that are simply short. "Walk in any
 * time" is a finished sentence with no full stop, and a punctuation rule would
 * cost the owner a good caption on every draft.
 */

const SALON: BusinessContext = {
  businessId: 'b1',
  name: 'Sharma Hair Studio',
  category: 'salon',
  locality: 'Vashi',
  city: 'Navi Mumbai',
  services: ['haircut', 'hair colour'],
  keywords: [],
  audience: null,
  offer: null,
  hours: null,
};

const OBJECTIVE: ContentObjective = {
  kind: 'promote_service',
  brief: '[FIXTURE] quiet weekday mornings',
  language: 'en',
  platforms: ['instagram'],
};

const codes = (text: string) => reviewCompleteness(text).findings.map((f) => f.code);

/* ========================================================================== */
/* Rejected: truncated                                                        */
/* ========================================================================== */

describe('a truncated caption is rejected', () => {
  /** The exact text the live model returned. This is the regression test. */
  it('rejects the caption that started this guard', () => {
    const live =
      'The studio is completely quiet on a Tuesday morning. No rushing between clients, ' +
      'just enough time';
    const report = reviewCompleteness(live);

    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain('unfinished_final_sentence');
  });

  it('rejects a caption ending on a word that cannot finish a sentence', () => {
    expect(codes('Come in on a weekday morning and')).toContain('dangling_word');
    expect(codes('Book a colour appointment with')).toContain('dangling_word');
    expect(codes('The quietest time to visit is the')).toContain('dangling_word');
  });

  it('rejects a caption ending on punctuation that promises more', () => {
    expect(codes('Weekday mornings are quiet,')).toContain('dangling_punctuation');
    expect(codes('Here is what we offer:')).toContain('dangling_punctuation');
    expect(codes('Two things to know —')).toContain('dangling_punctuation');
  });

  it('rejects a caption that leaves a bracket or quote open', () => {
    expect(codes('Weekday mornings are quiet (before eleven.')).toContain('unclosed_delimiter');
    expect(codes('She said "the mornings are best.')).toContain('unclosed_delimiter');
  });

  it('rejects a long fragment trailing an otherwise complete sentence', () => {
    const text = 'Mornings are quiet here. That is the best time to come in for a longer';
    expect(codes(text)).toContain('unfinished_final_sentence');
  });

  it('rejects copy that runs on with no sentence ending at all', () => {
    const runOn = 'we are open on weekday mornings and there is usually a chair free for a colour';
    expect(runOn.split(/\s+/).length).toBeGreaterThan(MAX_UNPUNCTUATED_WORDS);
    expect(codes(runOn)).toContain('runs_on_unpunctuated');
  });

  it('rejects an empty response rather than treating it as a short one', () => {
    expect(codes('')).toContain('empty');
    expect(codes('   \n  ')).toContain('empty');
    // Hashtags alone are not a caption.
    expect(codes('#vashi #haircut')).toContain('empty');
  });
});

/* ========================================================================== */
/* Accepted: complete                                                         */
/* ========================================================================== */

describe('a complete caption is accepted', () => {
  it('accepts a normal single-sentence caption', () => {
    expect(reviewCompleteness('Weekday mornings are the quietest time to come in.').ok).toBe(true);
  });

  it('accepts a multi-sentence caption', () => {
    const text =
      'Weekday mornings are the quietest time here. If a colour has been on your list for a ' +
      'while, that is when there is room to talk it through properly. Vashi, Tuesday to Sunday.';
    expect(reviewCompleteness(text).ok).toBe(true);
  });

  it('accepts a caption ending in a question or an exclamation', () => {
    expect(reviewCompleteness('Fancy a change before the weekend?').ok).toBe(true);
    expect(reviewCompleteness('The chairs are free all morning!').ok).toBe(true);
  });

  /**
   * THE FALSE-POSITIVE TEST. These are finished sentences with no full stop,
   * which is how a great many real captions are written.
   */
  it('does not falsely reject a legitimately short, unpunctuated caption', () => {
    for (const short of [
      'Walk in any time',
      'Open today',
      'Fresh cuts this weekend',
      'Quiet mornings, free chairs',
      'Colour appointments available',
    ]) {
      expect(reviewCompleteness(short).ok).toBe(true);
    }
  });

  it('allows a short sign-off after the final sentence', () => {
    // A place tag is not an unfinished sentence. "Vashi, Navi Mumbai" is
    // exactly three words, which is why the threshold is three and not two.
    const text = 'Mornings are the quietest time to come in. Vashi, Navi Mumbai';
    expect(reviewCompleteness(text).findings.map((f) => f.code)).not.toContain(
      'unfinished_final_sentence',
    );
    expect(MAX_TRAILING_FRAGMENT_WORDS).toBe(3);
  });

  it('accepts a sentence ending on a phrasal verb, because the full stop settles it', () => {
    // "in" is in the dangling-word list, but "come in." is finished. A writer
    // who typed the full stop meant to stop.
    expect(reviewCompleteness('The quietest time to come in is before eleven.').ok).toBe(true);
    expect(reviewCompleteness('Weekday mornings are the quietest time to come in.').ok).toBe(true);
  });

  it('ignores a trailing hashtag block, which is not a sentence', () => {
    const text = 'Weekday mornings are the quietest time here.\n\n#vashi #haircut #salon';
    expect(reviewCompleteness(text).ok).toBe(true);
  });

  it('ignores trailing emoji and closing quotes', () => {
    expect(reviewCompleteness('The mornings are the best time. 💇').ok).toBe(true);
    expect(reviewCompleteness('She said "the mornings are best."').ok).toBe(true);
  });

  it('accepts an apostrophe without calling it an unclosed quote', () => {
    // "don't" and "owner's" make an odd count of ' in perfectly finished text.
    expect(reviewCompleteness("Don't leave a colour to the weekend rush.").ok).toBe(true);
  });

  it('accepts Hindi and Marathi, which end sentences with a danda', () => {
    expect(reviewCompleteness('सकाळी गर्दी कमी असते. रंगकामासाठी हीच वेळ चांगली आहे।').ok).toBe(true);
  });
});

/* ========================================================================== */
/* The generator loop                                                         */
/* ========================================================================== */

function scriptedAi(replies: string[]): { ai: AiProvider; calls: () => number } {
  let index = 0;
  const ai: AiProvider = {
    id: 'gemini_free_dev',
    displayName: 'scripted',
    readiness: () => ({ status: 'ready' }),
    generateText: async () => {
      const text = replies[Math.min(index, replies.length - 1)] ?? '';
      index += 1;
      return ready<AiTextResult>(
        {
          task: 'social_caption',
          text,
          model: 'fake-model-1',
          provider: 'gemini_free_dev',
          derivedFromFixtureData: true,
        },
        '2026-09-11T00:00:00.000Z',
        true,
      );
    },
  };
  return { ai, calls: () => index };
}

const TRUNCATED = 'The studio is quiet on a Tuesday morning. No rushing between clients, just enough';
const COMPLETE =
  'Weekday mornings are the quietest time here. There is room to talk a colour through ' +
  'properly before we start.';

describe('the generator retries a truncated draft', () => {
  it('rejects the first incomplete attempt and returns the complete second one', async () => {
    const { ai, calls } = scriptedAi([TRUNCATED, COMPLETE]);
    const generator = createSocialGenerator({ ai, maxAttempts: 3 });

    const state = await generator.draftFor('instagram', SALON, OBJECTIVE);
    const draft = unwrapOrNull(state);

    expect(calls()).toBe(2);
    expect(draft).not.toBeNull();
    expect(draft?.caption.body).toContain('room to talk a colour through');
    expect(draft?.caption.body).not.toContain('just enough');
  });

  /**
   * The refusal is the feature. Handing over the least-bad draft would be the
   * comfortable option: a warning beside a caption that LOOKS finished gets
   * dismissed, and half a sentence goes out in the owner's name.
   */
  it('returns NO draft when every attempt is incomplete', async () => {
    const { ai, calls } = scriptedAi([
      'Mornings are quiet and',
      'The best time to come in is,',
      'Weekday mornings are the quietest time to come in for a colour appointment with',
    ]);
    const generator = createSocialGenerator({ ai, maxAttempts: 3 });

    const state = await generator.draftFor('instagram', SALON, OBJECTIVE);

    expect(calls()).toBe(3);
    expect(state.status).toBe('error');
    expect(unwrapOrNull(state)).toBeNull();
    if (state.status === 'error') {
      expect(state.code).toBe('generation_refused');
      expect(state.message).toMatch(/stopped halfway through/i);
      // The log tail names which guard fired, so a failure is diagnosable.
      expect(state.message).toMatch(/dangling_word|dangling_punctuation|unfinished_final_sentence/);
    }
  });

  it('never returns the least-bad truncated draft as a fallback', async () => {
    // Three attempts, the last one only slightly better than the first.
    const { ai } = scriptedAi(['Mornings are and', 'Mornings are quiet and', 'Mornings are very quiet and']);
    const state = await createSocialGenerator({ ai, maxAttempts: 3 }).draftFor(
      'instagram',
      SALON,
      OBJECTIVE,
    );

    expect(unwrapOrNull(state)).toBeNull();
  });

  it('tells the model its answer was cut off, and to write shorter', async () => {
    const instructions: string[] = [];
    const ai: AiProvider = {
      id: 'gemini_free_dev',
      displayName: 'spy',
      readiness: () => ({ status: 'ready' }),
      generateText: async (request) => {
        instructions.push(request.instruction);
        return ready<AiTextResult>(
          {
            task: request.task,
            text: instructions.length === 1 ? TRUNCATED : COMPLETE,
            model: 'm',
            provider: 'gemini_free_dev',
            derivedFromFixtureData: true,
          },
          'now',
          true,
        );
      },
    };

    await createSocialGenerator({ ai, maxAttempts: 3 }).draftFor('instagram', SALON, OBJECTIVE);

    expect(instructions).toHaveLength(2);
    // A truncated attempt is a LENGTH problem: told only to "fix it", a model
    // rewrites at the same length and is cut off in the same place.
    expect(instructions[1]).toMatch(/cut off/i);
    expect(instructions[1]).toMatch(/SHORTER/);
  });
});

describe('completeness sits alongside the other guards, not instead of them', () => {
  it('still rejects fabrication in otherwise complete copy', () => {
    const verdict = judgeDraft('Get 30% off every colour this week.', SALON);
    expect(verdict.accepted).toBe(false);
    expect(verdict.fabrication.length).toBeGreaterThan(0);
    expect(verdict.completeness).toEqual([]);
  });

  it('still rejects machine-sounding copy that is complete', () => {
    const verdict = judgeDraft('Look no further for your next haircut.', SALON);
    expect(verdict.accepted).toBe(false);
    expect(verdict.humanness.some((f) => f.blocking)).toBe(true);
    expect(verdict.completeness).toEqual([]);
  });

  it('accepts copy that passes all three', () => {
    const verdict = judgeDraft(COMPLETE, SALON);
    expect(verdict.accepted).toBe(true);
    expect(verdict.completeness).toEqual([]);
    expect(verdict.fabrication).toEqual([]);
  });
});
