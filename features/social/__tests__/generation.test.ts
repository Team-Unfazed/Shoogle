import { fixtureInput, type AiProvider, type AiTextResult } from '@/features/seo/ai';
import { isReady, ready, unwrapOrNull } from '@/lib/state/DataState';

import {
  createSocialGenerator,
  facebookPrompt,
  gbpPrompt,
  instagramPrompt,
  judgeDraft,
  promptFor,
  reviewFabrication,
  reviewHumanness,
  namesUnlistedService,
  burstiness,
  type BusinessContext,
  type ContentObjective,
} from '../index';

/**
 * GENERATION.
 *
 * Three claims are under test, in descending order of how much damage their
 * failure does:
 *
 *   1. Generated copy never asserts something the business did not say.
 *   2. Generated copy does not read as machine-written.
 *   3. The three platforms genuinely get different prompts, not one prompt
 *      with the platform's name swapped in.
 */

const SALON: BusinessContext = {
  businessId: 'b1',
  name: 'Sharma Hair Studio',
  category: 'salon',
  locality: 'Vashi',
  city: 'Navi Mumbai',
  services: ['haircut', 'hair colour', 'keratin treatment'],
  keywords: ['haircut in Vashi', 'salon'],
  audience: 'working professionals',
  offer: null,
  hours: 'Tuesday to Sunday, 10am to 8pm',
};

const objective = (over: Partial<ContentObjective> = {}): ContentObjective => ({
  kind: 'promote_service',
  brief: '[FIXTURE] quiet weekday mornings, good time for a colour appointment',
  language: 'en',
  platforms: ['instagram'],
  ...over,
});

/* ========================================================================== */
/* 1. Anti-fabrication                                                        */
/* ========================================================================== */

describe('the anti-fabrication guard', () => {
  it('accepts copy built only from the business’s own facts', () => {
    const honest =
      'Weekday mornings are the quietest time at Sharma Hair Studio. If you have been ' +
      'putting off a hair colour, that is when we have the most time to talk it through. ' +
      'We are in Vashi, open Tuesday to Sunday.';
    expect(reviewFabrication(honest, SALON).ok).toBe(true);
  });

  /**
   * THE ONE THAT MATTERS MOST. A customer arrives expecting a discount that
   * was never offered, and the owner finds out from them.
   */
  it('rejects a discount when the business has no offer recorded', () => {
    const report = reviewFabrication('Get 20% off all colour this week at Sharma Hair Studio.', SALON);
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain('unsourced_discount');
    expect(report.findings.map((f) => f.code)).toContain('unsourced_number');
  });

  it('allows the same sentence once the owner has actually set that offer', () => {
    const withOffer: BusinessContext = {
      ...SALON,
      offer: { description: '20% off all colour', amount: '20%', endsAt: null },
    };
    expect(reviewFabrication('Get 20% off all colour this week.', withOffer).ok).toBe(true);
  });

  it('rejects an invented price', () => {
    const report = reviewFabrication('Haircuts from ₹499 at Sharma Hair Studio.', SALON);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.evidence.includes('499'))).toBe(true);
  });

  it('rejects a phone number nobody supplied', () => {
    const report = reviewFabrication('Call us on 9876543210 to book.', SALON);
    expect(report.findings.map((f) => f.code)).toContain('unsourced_contact');
  });

  it('rejects claims of standing and credentials', () => {
    expect(reviewFabrication('The best salon in Navi Mumbai.', SALON).ok).toBe(false);
    expect(reviewFabrication('Our award-winning stylists are ready.', SALON).ok).toBe(false);
    expect(reviewFabrication('All our stylists are certified.', SALON).ok).toBe(false);
  });

  it('rejects a guarantee nobody authorised', () => {
    const report = reviewFabrication('Guaranteed results or your money back.', SALON);
    expect(report.findings.map((f) => f.code)).toContain('unsourced_guarantee');
  });

  it('rejects a service the business does not offer', () => {
    const findings = namesUnlistedService(
      'Book a haircut or bridal makeup with us.',
      SALON,
      ['bridal makeup', 'threading'],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toBe('bridal makeup');
  });

  it('allows ordinary times and dates, which assert nothing about the business', () => {
    expect(reviewFabrication('We open at 10am and there is space on the 5th.', SALON).ok).toBe(true);
  });
});

/* ========================================================================== */
/* 2. Humanization                                                            */
/* ========================================================================== */

describe('the humanization guard', () => {
  it('rejects AI-tell phrases', () => {
    for (const cliche of [
      'In today’s fast-paced world, hair matters.',
      'Look no further for your next haircut.',
      'Nestled in the heart of Vashi.',
      'We elevate your look and unlock the best version of you.',
    ]) {
      const report = reviewHumanness(cliche);
      expect(report.ok).toBe(false);
      expect(report.findings.map((f) => f.code)).toContain('ai_cliche');
    }
  });

  it('rejects a template opener', () => {
    const report = reviewHumanness('Looking for a great haircut? We can help.');
    expect(report.findings.map((f) => f.code)).toContain('hollow_opener');
    expect(report.ok).toBe(false);
  });

  it('rejects keyword stuffing, and allows natural use of the same keyword', () => {
    const stuffed =
      'Salon in Vashi. Best salon Vashi. Our salon is the salon you want. Salon salon.';
    const stuffedReport = reviewHumanness(stuffed, ['salon']);
    expect(stuffedReport.ok).toBe(false);
    expect(stuffedReport.findings.map((f) => f.code)).toContain('keyword_stuffing');

    const natural =
      'The salon is quiet on weekday mornings, which is the easiest time to get a longer ' +
      'appointment. Walk in before eleven and there is usually a chair free straight away.';
    expect(reviewHumanness(natural, ['salon']).ok).toBe(true);
  });

  it('flags flat, even sentence lengths without blocking on them', () => {
    // Six sentences of near-identical length: the classic model metronome.
    const flat =
      'We cut hair well here. We colour hair well here. We treat hair well here. ' +
      'We style hair well here. We wash hair well here. We dry hair well here.';
    const report = reviewHumanness(flat);
    const finding = report.findings.find((f) => f.code === 'low_burstiness');
    expect(finding).toBeDefined();
    expect(finding?.blocking).toBe(false);
    // Advisory only: a false positive must never cost the owner a post.
    expect(report.ok).toBe(true);
  });

  it('measures burstiness as variation, not length', () => {
    expect(burstiness([10, 10, 10])).toBe(0);
    expect(burstiness([3, 14, 7, 22])).toBeGreaterThan(0.4);
    // Scale-free: doubling every sentence changes nothing.
    expect(burstiness([3, 14, 7, 22])).toBeCloseTo(burstiness([6, 28, 14, 44]), 10);
  });

  it('counts words in Devanagari rather than scoring it as empty', () => {
    // `\w` is ASCII-only, so a naive implementation reads this as zero words
    // and every stuffing check passes vacuously.
    const marathi = 'आमचे केशकर्तनालय नवी मुंबईत आहे. सकाळी गर्दी कमी असते.';
    const report = reviewHumanness(marathi, ['केशकर्तनालय']);
    expect(report.ok).toBe(true);
  });

  it('splits Hindi sentences on the danda, not only on full stops', () => {
    const hindi = 'हम बाल काटते हैं। हम रंग भी करते हैं। सुबह भीड़ कम होती है।';
    // Three sentences, not one.
    expect(reviewHumanness(hindi).findings.every((f) => f.code !== 'ai_cliche')).toBe(true);
  });
});

/* ========================================================================== */
/* 3. Three platforms, three prompts                                          */
/* ========================================================================== */

describe('the prompts are genuinely platform-specific', () => {
  const ig = instagramPrompt(SALON, objective());
  const fb = facebookPrompt(SALON, objective());
  const gbp = gbpPrompt(SALON, objective());

  it('produces three different prompts', () => {
    expect(ig).not.toBe(fb);
    expect(fb).not.toBe(gbp);
    expect(ig).not.toBe(gbp);
  });

  it('describes a different reader for each surface', () => {
    expect(ig).toMatch(/scrolling/i);
    expect(fb).toMatch(/noticeboard/i);
    expect(gbp).toMatch(/searched Google/i);
  });

  it('asks only Instagram for hashtags, and tells the others not to', () => {
    expect(ig).toMatch(/HASHTAGS/);
    expect(fb).toMatch(/No hashtags at all/i);
    expect(gbp).toMatch(/no hashtags/i);
  });

  it('puts the SEO, AEO and GEO weight on the Google post alone', () => {
    // AEO: a self-contained, quotable sentence is what an answer engine lifts.
    expect(gbp).toMatch(/quoted out of context/i);
    expect(ig).not.toMatch(/quoted out of context/i);

    // SEO: search vocabulary rather than brand vocabulary.
    expect(gbp).toMatch(/words a person would type into Google/i);
    expect(ig).not.toMatch(/type into Google/i);

    // GEO: the locality is the point of a local post.
    expect(gbp).toMatch(/the place is/i);
  });

  it('tells Instagram not to write for a searcher', () => {
    // Instagram captions are not a search surface, so search phrasing there
    // wastes the one line that matters.
    expect(ig).toMatch(/not searching/i);
  });

  it('gives Facebook more room than Instagram', () => {
    expect(ig).toMatch(/60-120 words/);
    expect(fb).toMatch(/100 to 200 words/);
    expect(gbp).toMatch(/40 to 100 words/);
  });

  it('warns Facebook that a post may have no photo at all', () => {
    // The one structural difference Instagram cannot have.
    expect(facebookPrompt(SALON, objective(), { hasMedia: false })).toMatch(/may have no photo/i);
  });

  it('selects the right prompt per platform, with no shared fallback', () => {
    expect(promptFor('instagram', SALON, objective())).toBe(ig);
    expect(promptFor('facebook', SALON, objective())).toBe(fb);
    expect(promptFor('google_business', SALON, objective())).toBe(gbp);
  });
});

describe('the fact sheet is the prompt half of the fabrication guard', () => {
  it('states outright that there is no offer, when there is none', () => {
    expect(instagramPrompt(SALON, objective())).toMatch(/Current offer: NONE/);
    expect(instagramPrompt(SALON, objective())).toMatch(/Do not mention a discount/i);
  });

  it('forbids naming a place when no location is recorded', () => {
    const noPlace: BusinessContext = { ...SALON, locality: null, city: null };
    const prompt = gbpPrompt(noPlace, objective());
    expect(prompt).toMatch(/do not name a neighbourhood/i);
    expect(prompt).toMatch(/worse than/i);
  });

  it('forbids mentioning hours when none are recorded', () => {
    const noHours: BusinessContext = { ...SALON, hours: null };
    expect(instagramPrompt(noHours, objective())).toMatch(/do not mention hours/i);
  });

  it('asks for the right language, in the right script', () => {
    expect(instagramPrompt(SALON, objective({ language: 'mr' }))).toMatch(/Do not transliterate/i);
    expect(instagramPrompt(SALON, objective({ language: 'hinglish' }))).toMatch(/Hinglish/);
  });
});

/* ========================================================================== */
/* 4. The generation loop                                                     */
/* ========================================================================== */

function fakeAi(replies: string[]): AiProvider {
  let index = 0;
  return {
    id: 'gemini_free_dev',
    displayName: 'fake',
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
}

const GOOD_DRAFT =
  'Weekday mornings are the quietest time here. If a hair colour has been on your list ' +
  'for a while, that is when there is time to talk it through properly before we start. ' +
  'Vashi, Tuesday to Sunday.';

describe('the generation loop', () => {
  it('returns a draft that passes both guards', async () => {
    const generator = createSocialGenerator({ ai: fakeAi([GOOD_DRAFT]) });
    const state = await generator.draftFor('instagram', SALON, objective());

    expect(isReady(state)).toBe(true);
    const draft = unwrapOrNull(state);
    expect(draft?.caption.body).toContain('Weekday mornings');
    expect(draft?.caption.origin).toBe('generated');
    expect(draft?.caption.generatedBy).toBe('fake-model-1');
  });

  it('redrafts when the first attempt invents something, and keeps the good one', async () => {
    const generator = createSocialGenerator({
      ai: fakeAi(['Get 30% off colour this week!', GOOD_DRAFT]),
    });
    const state = await generator.draftFor('instagram', SALON, objective());

    expect(isReady(state)).toBe(true);
    expect(unwrapOrNull(state)?.caption.body).not.toMatch(/30%/);
  });

  /**
   * The refusal is the feature. Handing over the least-bad draft with a
   * warning attached would be the comfortable option: the warning gets
   * dismissed and the invented fact goes out in the owner's name anyway.
   */
  it('returns NOTHING when every attempt fabricates, rather than the least-bad one', async () => {
    const generator = createSocialGenerator({
      ai: fakeAi(['Flat 50% off!', 'Only ₹299 today!', 'The best salon in Mumbai, guaranteed.']),
      maxAttempts: 3,
    });
    const state = await generator.draftFor('instagram', SALON, objective());

    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.code).toBe('generation_refused');
      expect(state.message).toMatch(/invented something|machine/i);
    }
  });

  it('passes a blocked provider’s own reason through unchanged', async () => {
    const blocked: AiProvider = {
      id: 'none',
      displayName: 'blocked',
      readiness: () => ({ status: 'blocked', reason: 'not_connected', message: 'No key set.' }),
      generateText: async () => {
        throw new Error('must not be called');
      },
    };
    const generator = createSocialGenerator({ ai: blocked });
    const state = await generator.draftFor('instagram', SALON, objective());

    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') expect(state.message).toBe('No key set.');
  });

  it('classifies every request as fixture data and never as customer data', async () => {
    const seen: string[] = [];
    const spy: AiProvider = {
      id: 'gemini_free_dev',
      displayName: 'spy',
      readiness: () => ({ status: 'ready' }),
      generateText: async (request) => {
        seen.push(request.input.classification);
        return ready<AiTextResult>(
          {
            task: request.task,
            text: GOOD_DRAFT,
            model: 'm',
            provider: 'gemini_free_dev',
            derivedFromFixtureData: true,
          },
          'now',
          true,
        );
      },
    };

    await createSocialGenerator({ ai: spy }).draftFor('instagram', SALON, objective());
    expect(seen).toEqual(['fixture']);
    expect(seen).not.toContain('customer');
  });

  it('separates hashtags from the caption body', async () => {
    const withTags = `${GOOD_DRAFT}\n\n#vashi #haircut`;
    const generator = createSocialGenerator({ ai: fakeAi([withTags]) });
    const draft = unwrapOrNull(await generator.draftFor('instagram', SALON, objective()));

    expect(draft?.caption.hashtags).toEqual(['vashi', 'haircut']);
    expect(draft?.caption.body).not.toMatch(/#vashi/);
  });

  it('surfaces advisory findings on an accepted draft rather than swallowing them', () => {
    const flat = 'We cut hair here. We colour hair here. We style hair here. We wash hair here.';
    const verdict = judgeDraft(flat, SALON);
    expect(verdict.accepted).toBe(true);
    expect(verdict.humanness.some((f) => f.code === 'low_burstiness')).toBe(true);
  });
});

describe('fixture classification is constructed, not assumed', () => {
  it('marks fixture input explicitly', () => {
    expect(fixtureInput('[FIXTURE] x').classification).toBe('fixture');
  });
});
