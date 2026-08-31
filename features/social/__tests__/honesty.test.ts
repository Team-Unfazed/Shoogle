import {
  assumesFormatAccepted,
  capabilitiesFor,
  checkCaptionLength,
  checkMediaFormat,
  checkSlideCount,
  hasResearchedCapabilities,
  isVerified,
  PLATFORM_CAPABILITIES,
  SOCIAL_PLATFORMS,
  verified,
} from '../index';
import { describeInsights, isConfirmedPublished, newTarget } from '../types';

/**
 * REGRESSION GUARDS.
 *
 * Each of these fails the moment someone re-introduces a claim this product
 * is not entitled to make. They are deliberately blunt.
 */
describe('platform capabilities are unverified until researched', () => {
  it('states no limit for any platform', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const caps = capabilitiesFor(platform);
      expect(caps.captionMaxCharacters.value).toBeNull();
      expect(caps.hashtagMaxCount.value).toBeNull();
      expect(caps.acceptedImageFormats.value).toBeNull();
      expect(caps.acceptedVideoFormats.value).toBeNull();
      expect(caps.carouselMinSlides.value).toBeNull();
      expect(caps.carouselMaxSlides.value).toBeNull();
      expect(caps.providerSideScheduling.value).toBeNull();
      expect(caps.requiresAppReview.value).toBeNull();
    }
  });

  it('never marks a limit verified without a first-party source', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const caps = PLATFORM_CAPABILITIES[platform];
      for (const limit of Object.values(caps)) {
        if (typeof limit === 'string') continue; // the `platform` field
        if (limit.verification === 'verified') expect(limit.source).not.toBeNull();
      }
    }
  });

  it('reports no researched capabilities yet', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      expect(hasResearchedCapabilities(platform)).toBe(false);
    }
  });

  /**
   * THE PNG/JPEG RULE. While the accepted-format list is unverified, no format
   * is "fine" — including JPEG. Answering 'ok' here would be the assumption the
   * engineering contract forbids.
   */
  it('does not assume any format is accepted, JPEG included', () => {
    expect(assumesFormatAccepted()).toBe(false);
    for (const platform of SOCIAL_PLATFORMS) {
      expect(checkMediaFormat(platform, 'jpeg').outcome).toBe('unverified');
      expect(checkMediaFormat(platform, 'png').outcome).toBe('unverified');
      expect(checkMediaFormat(platform, 'mp4').outcome).toBe('unverified');
    }
  });

  it('blocks a file whose format could not be read at all', () => {
    const result = checkMediaFormat('instagram', 'unknown');
    expect(result.outcome).toBe('violation');
    expect(result.message).toMatch(/format/i);
  });

  it('answers unverified — not ok — for length and slide-count checks', () => {
    expect(checkCaptionLength('instagram', 10).outcome).toBe('unverified');
    expect(checkCaptionLength('linkedin', 100_000).outcome).toBe('unverified');
    expect(checkSlideCount('instagram', 3).outcome).toBe('unverified');
  });

  it('enforces a limit once it is genuinely verified', () => {
    // Proves the machinery works, without asserting a real platform number.
    const limit = verified(100, 'https://example.invalid/docs');
    expect(isVerified(limit)).toBe(true);
    expect(limit.value).toBe(100);
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
