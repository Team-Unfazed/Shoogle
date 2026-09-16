import {
  capabilitiesFor,
  checkCaptionLength,
  checkHashtagCount,
  checkMediaFormat,
  checkSlideCount,
  hasResearchedCapabilities,
  isEnforceable,
  isVerified,
  PLATFORM_CAPABILITIES,
  SOCIAL_PLATFORMS,
  unsourcedLimits,
  verified,
} from '../index';
import { describeInsights, isConfirmedPublished, newTarget } from '../types';

/**
 * REGRESSION GUARDS.
 *
 * Each of these fails the moment someone re-introduces a claim this product is
 * not entitled to make. They are deliberately blunt.
 *
 * WHAT CHANGED ON 2026-09-08, AND WHY
 * -----------------------------------
 * Day 1 asserted that EVERY limit was null. That was correct while
 * `docs/research/` held no Meta report — but it was a guard against *being
 * unresearched*, not against *lying*, and it expired the moment the research
 * landed. Keeping it would have meant deleting Meta's own documented numbers to
 * keep a test green, which inverts the point of the test.
 *
 * These suites now assert the claim that must hold forever instead:
 *
 *   1. A limit is verified ONLY with a first-party source (`unsourcedLimits`).
 *   2. A verified limit really enforces — PNG on Instagram is a VIOLATION now,
 *      not a shrug.
 *   3. An UNVERIFIED limit still answers 'unverified', never 'ok'. The GBP
 *      caption limit is the live example: Google documents no `summary` limit,
 *      so Shoogle refuses to claim one.
 */

describe('a limit may only be claimed with a source', () => {
  it('has no verified limit lacking a first-party source', () => {
    expect(unsourcedLimits()).toEqual([]);
  });

  it('gives every verified limit an https documentation URL', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const caps = PLATFORM_CAPABILITIES[platform];
      for (const [field, limit] of Object.entries(caps)) {
        if (field === 'platform') continue;
        if (limit.verification !== 'verified') continue;
        expect(`${platform}.${field}: ${limit.source}`).toMatch(/: https:\/\//);
      }
    }
  });

  it('never marks a limit verified while leaving its value null', () => {
    const contradictions: string[] = [];
    for (const platform of SOCIAL_PLATFORMS) {
      for (const [field, limit] of Object.entries(PLATFORM_CAPABILITIES[platform])) {
        if (field === 'platform') continue;
        if (limit.verification === 'verified' && limit.value === null) {
          contradictions.push(`${platform}.${field}`);
        }
      }
    }
    expect(contradictions).toEqual([]);
  });

  it('enforces a limit once it is genuinely verified', () => {
    const limit = verified(100, 'https://example.invalid/docs');
    expect(isVerified(limit)).toBe(true);
    expect(limit.value).toBe(100);
  });
});

/**
 * The scope decision, asserted rather than described. LinkedIn left publishing
 * scope on 2026-09-01 and was removed from the product altogether on
 * 2026-09-16, so it is no longer a `ProviderId` at all. Facebook was briefly
 * removed too, on a misreading that Meta was only an Instagram authentication
 * detail; it was restored on 2026-09-09 as a first-class target with its own
 * content shape. The test holds that line.
 */
describe('publishing scope', () => {
  it('targets Instagram, Facebook and Google Business Profile, and nothing else', () => {
    expect([...SOCIAL_PLATFORMS]).toEqual(['instagram', 'facebook', 'google_business']);
  });
});

/**
 * THE PNG/JPEG RULE — inverted from Day 1.
 *
 * Meta: "JPEG is the only image format supported." So PNG is no longer an
 * unknown, it is a documented rejection, and Shoogle must say so BEFORE the
 * post goes out rather than relaying a 400 afterwards.
 */
describe('Instagram limits are verified and enforced', () => {
  it('accepts JPEG and rejects PNG', () => {
    expect(checkMediaFormat('instagram', 'jpeg').outcome).toBe('ok');

    const png = checkMediaFormat('instagram', 'png');
    expect(png.outcome).toBe('violation');
    expect(png.message).toMatch(/PNG/);
  });

  it('rejects the other image formats an Android picker can hand us', () => {
    expect(checkMediaFormat('instagram', 'webp').outcome).toBe('violation');
    expect(checkMediaFormat('instagram', 'heic').outcome).toBe('violation');
  });

  it('accepts MP4 and MOV video', () => {
    expect(checkMediaFormat('instagram', 'mp4').outcome).toBe('ok');
    expect(checkMediaFormat('instagram', 'mov').outcome).toBe('ok');
  });

  it('holds the caption ceiling at 2200 characters', () => {
    expect(capabilitiesFor('instagram').captionMaxCharacters.value).toBe(2200);
    expect(checkCaptionLength('instagram', 2200).outcome).toBe('ok');

    const over = checkCaptionLength('instagram', 2201);
    expect(over.outcome).toBe('violation');
    expect(over.message).toMatch(/1 characters too long/);
  });

  it('holds the hashtag ceiling at 30', () => {
    expect(checkHashtagCount('instagram', 30).outcome).toBe('ok');
    expect(checkHashtagCount('instagram', 31).outcome).toBe('violation');
  });

  it('knows the carousel maximum is 10 but refuses to state a minimum', () => {
    const caps = capabilitiesFor('instagram');
    expect(caps.carouselMaxSlides.value).toBe(10);
    // Meta documents no minimum, so the pair is incomplete and the CHECK must
    // stay honest even though half of it is known.
    expect(caps.carouselMinSlides.value).toBeNull();
    expect(checkSlideCount('instagram', 4).outcome).toBe('unverified');
    expect(checkSlideCount('instagram', 11).outcome).toBe('unverified');
  });

  it('records that publishing for real customers is review-gated', () => {
    expect(capabilitiesFor('instagram').requiresAppReview.value).toBe(true);
  });

  it('still refuses to claim Instagram schedules for us', () => {
    expect(capabilitiesFor('instagram').providerSideScheduling.value).toBeNull();
  });

  it('reports Instagram as researched', () => {
    expect(hasResearchedCapabilities('instagram')).toBe(true);
  });
});

/**
 * Facebook is the proof that "both are Meta" explains nothing. On the two rules
 * that decide whether a post can be built at all — image format and native
 * scheduling — Facebook is the opposite of Instagram, and a shared media
 * pipeline would be wrong for one of them.
 */
describe('Facebook is not Instagram', () => {
  it('accepts PNG, which Instagram rejects', () => {
    expect(checkMediaFormat('facebook', 'png').outcome).toBe('ok');
    expect(checkMediaFormat('instagram', 'png').outcome).toBe('violation');
  });

  it('accepts JPEG on both, so the difference is genuinely PNG and not format checking', () => {
    expect(checkMediaFormat('facebook', 'jpeg').outcome).toBe('ok');
    expect(checkMediaFormat('instagram', 'jpeg').outcome).toBe('ok');
  });

  it('rejects the formats Facebook does not document', () => {
    expect(checkMediaFormat('facebook', 'webp').outcome).toBe('violation');
    expect(checkMediaFormat('facebook', 'heic').outcome).toBe('violation');
  });

  it('does not claim to know Page video formats', () => {
    // The upload-session file-type list is not a Page video specification.
    expect(checkMediaFormat('facebook', 'mp4').outcome).toBe('unverified');
  });

  it('schedules natively, where Instagram does not', () => {
    expect(capabilitiesFor('facebook').providerSideScheduling.value).toBe(true);
    expect(capabilitiesFor('instagram').providerSideScheduling.value).toBeNull();
  });

  it('refuses to invent a message length limit', () => {
    expect(capabilitiesFor('facebook').captionMaxCharacters.value).toBeNull();
    expect(checkCaptionLength('facebook', 100_000).outcome).toBe('unverified');
  });
});

/**
 * THE CONFLICT. Meta documents Facebook's scheduling horizon as 30 days on one
 * page and 75 on another. This is neither verified nor unknown, and flattening
 * it into either would be a lie in one direction or the other.
 */
describe('a limit whose own documentation contradicts itself', () => {
  const horizon = capabilitiesFor('facebook').scheduleMaxHorizonDays;

  it('is not presented as a settled fact', () => {
    expect(horizon.verification).toBe('conflicted');
    expect(isVerified(horizon)).toBe(false);
  });

  it('still binds, at the conservative end', () => {
    expect(isEnforceable(horizon)).toBe(true);
    expect(horizon.value).toBe(30);
  });

  it('shows its work — both pages, and what they disagree about', () => {
    expect(horizon.sources?.length).toBeGreaterThanOrEqual(2);
    expect(horizon.conflict).toMatch(/30 days/);
    expect(horizon.conflict).toMatch(/75 days/);
  });

  it('does not let a conflict masquerade as researched-and-done', () => {
    // `hasResearchedCapabilities` asks whether anything is VERIFIED. Facebook
    // qualifies on other fields, so this must not be read as "the horizon is
    // known" — which is what the two assertions above exist to pin down.
    expect(hasResearchedCapabilities('facebook')).toBe(true);
  });
});

/**
 * GBP is the live proof that "researched" and "fully known" are different
 * things. Google documents `scheduledTime` but NOT a `summary` character limit,
 * and Shoogle records exactly that split.
 */
describe('Google Business Profile records only what Google documents', () => {
  it('knows local posts are natively scheduled', () => {
    expect(capabilitiesFor('google_business').providerSideScheduling.value).toBe(true);
  });

  it('refuses to invent a summary character limit', () => {
    expect(capabilitiesFor('google_business').captionMaxCharacters.value).toBeNull();
    expect(checkCaptionLength('google_business', 100_000).outcome).toBe('unverified');
  });

  it('does not claim to know which image formats Google accepts', () => {
    // §8 of the GBP research gives a minimum photo SIZE, not a format list.
    // A size floor is not a format list.
    expect(checkMediaFormat('google_business', 'jpeg').outcome).toBe('unverified');
    expect(checkMediaFormat('google_business', 'png').outcome).toBe('unverified');
  });
});

describe('an unreadable file is blocked on every platform', () => {
  it('never lets an unknown format through, verified list or not', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const result = checkMediaFormat(platform, 'unknown');
      expect(result.outcome).toBe('violation');
      expect(result.message).toMatch(/format/i);
    }
  });
});

describe('publish confirmation', () => {
  it('starts every target unattempted, with no permalink', () => {
    const target = newTarget('instagram');
    expect(target.status).toBe('not_attempted');
    expect(target.permalink).toBeNull();
    expect(target.remoteId).toBeNull();
    expect(target.publishedAt).toBeNull();
  });

  it('does not count a "succeeded" target without a remote id as published', () => {
    const target = { ...newTarget('instagram'), status: 'succeeded' as const };
    expect(isConfirmedPublished(target)).toBe(false);
    expect(isConfirmedPublished({ ...target, remoteId: 'abc' })).toBe(true);
  });
});

describe('insights are never fabricated', () => {
  it('says nothing when no provider has reported', () => {
    expect(describeInsights(null)).toBeNull();
    expect(describeInsights({ reach: null, saves: null, reportedAt: null })).toBeNull();
    // Numbers with no report timestamp are not trustworthy either.
    expect(describeInsights({ reach: 10, saves: 2, reportedAt: null })).toBeNull();
  });

  it('reports only the fields the provider actually gave', () => {
    expect(
      describeInsights({ reach: 2412, saves: 84, reportedAt: '2026-08-30T00:00:00.000Z' }),
    ).toBe('2,412 reached · 84 saves');
    expect(describeInsights({ reach: 2412, saves: null, reportedAt: '2026-08-30T00:00:00.000Z' })).toBe(
      '2,412 reached',
    );
  });

  it('reports a genuine zero as zero, which is different from unknown', () => {
    expect(describeInsights({ reach: 0, saves: 0, reportedAt: '2026-08-30T00:00:00.000Z' })).toBe(
      '0 reached · 0 saves',
    );
  });
});
