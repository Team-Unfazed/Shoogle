import {
  facebookContent,
  gbpContent,
  instagramAltText,
  instagramContent,
  instagramMedia,
  missingContentFor,
  platformsWithContent,
  primaryText,
  publishablePlatforms,
  reviewFacebookContent,
  reviewGbpContent,
  reviewInstagramContent,
  reviewPostContent,
  type Caption,
  type MediaAsset,
  type PostContent,
} from '../index';

/**
 * PER-PLATFORM CONTENT.
 *
 * The claim under test is that these are three genuinely different objects,
 * not one post wearing three labels. The strongest evidence is what each type
 * CANNOT express: Instagram has no text-only post, Facebook has no hashtag
 * limit, Google has no post without a topic.
 */

const words = (body: string, hashtags: string[] = []): Caption => ({
  body,
  hashtags,
  language: 'en',
  origin: 'owner',
  generatedBy: null,
});

function image(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'm1',
    kind: 'image',
    format: 'jpeg',
    uri: 'https://example.invalid/m1.jpg',
    width: 1080,
    height: 1350, // 0.8 — exactly Instagram's 4:5 floor
    byteSize: 400_000,
    durationSeconds: null,
    altText: null,
    ...over,
  };
}

function video(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'v1',
    kind: 'video',
    format: 'mp4',
    uri: 'https://example.invalid/v1.mp4',
    width: 1080,
    height: 1920,
    byteSize: 8_000_000,
    durationSeconds: 22,
    altText: null,
    ...over,
  };
}

const codes = (review: { issues: { code: string }[] }) => review.issues.map((issue) => issue.code);

/* ========================================================================== */
/* Instagram                                                                  */
/* ========================================================================== */

describe('Instagram content', () => {
  it('accepts a valid single image post', () => {
    const review = reviewInstagramContent(
      instagramContent(words('Fresh cuts this weekend.', ['NaviMumbai']), {
        kind: 'single_image',
        image: image(),
        altText: 'A barber finishing a fade.',
      }),
    );
    expect(review.ok).toBe(true);
    expect(review.issues).toEqual([]);
  });

  it('refuses a post with no media, because Instagram cannot publish words alone', () => {
    // There is no text-only member of InstagramFormat, so the closest a caller
    // can get is an empty carousel — and that is refused too.
    const review = reviewInstagramContent(
      instagramContent(words('Just words.'), { kind: 'carousel', items: [] }),
    );
    expect(review.ok).toBe(false);
    expect(codes(review)).toContain('media_missing');
  });

  it('enforces Meta’s documented caption and hashtag ceilings', () => {
    const tooLong = reviewInstagramContent(
      instagramContent(words('x'.repeat(2201)), { kind: 'single_image', image: image(), altText: null }),
    );
    expect(codes(tooLong)).toContain('caption_too_long');

    const tooManyTags = reviewInstagramContent(
      instagramContent(words('Hi', Array.from({ length: 31 }, (_, i) => `tag${i}`)), {
        kind: 'single_image',
        image: image(),
        altText: null,
      }),
    );
    expect(codes(tooManyTags)).toContain('too_many_hashtags');
  });

  it('rejects PNG, which Facebook accepts', () => {
    const review = reviewInstagramContent(
      instagramContent(words('Hi'), { kind: 'single_image', image: image({ format: 'png' }), altText: null }),
    );
    expect(review.ok).toBe(false);
    expect(codes(review)).toContain('media_format');
  });

  it('rejects an image outside 4:5 to 1.91:1', () => {
    const tooTall = reviewInstagramContent(
      instagramContent(words('Hi'), {
        kind: 'single_image',
        image: image({ width: 1000, height: 2000 }), // 0.5
        altText: null,
      }),
    );
    expect(codes(tooTall)).toContain('media_spec');
    expect(tooTall.issues.find((i) => i.code === 'media_spec')?.message).toMatch(/4:5/);
  });

  it('rejects an image wider than 1440px, and one over 8MB', () => {
    const tooWide = reviewInstagramContent(
      instagramContent(words('Hi'), {
        kind: 'single_image',
        image: image({ width: 2000, height: 2000 }),
        altText: null,
      }),
    );
    expect(codes(tooWide)).toContain('media_spec');

    const tooBig = reviewInstagramContent(
      instagramContent(words('Hi'), {
        kind: 'single_image',
        image: image({ byteSize: 9 * 1024 * 1024 }),
        altText: null,
      }),
    );
    expect(codes(tooBig)).toContain('media_spec');
  });

  it('holds the carousel between Shoogle’s minimum and Meta’s maximum', () => {
    const one = reviewInstagramContent(
      instagramContent(words('Hi'), {
        kind: 'carousel',
        items: [{ kind: 'image', image: image(), altText: null }],
      }),
    );
    expect(codes(one)).toContain('carousel_too_small');
    // Attributed to Shoogle, because Meta documents no minimum.
    expect(one.issues.find((i) => i.code === 'carousel_too_small')?.message).not.toMatch(/Instagram/);

    const eleven = reviewInstagramContent(
      instagramContent(words('Hi'), {
        kind: 'carousel',
        items: Array.from({ length: 11 }, () => ({ kind: 'image' as const, image: image(), altText: null })),
      }),
    );
    expect(codes(eleven)).toContain('carousel_too_large');
    expect(eleven.issues.find((i) => i.code === 'carousel_too_large')?.message).toMatch(/Instagram/);
  });

  it('holds a Story to 60 seconds, not the 15-minute feed limit', () => {
    const longStory = reviewInstagramContent(
      instagramContent(words('Hi'), { kind: 'story', media: video({ durationSeconds: 90 }) }),
    );
    expect(codes(longStory)).toContain('story_too_long');

    // The same 90-second video is fine as a Reel.
    const reel = reviewInstagramContent(
      instagramContent(words('Hi'), { kind: 'reel', video: video({ durationSeconds: 90 }) }),
    );
    expect(codes(reel)).not.toContain('story_too_long');
  });

  it('surfaces alt text only where Instagram accepts it', () => {
    const withAlt = instagramContent(words('Hi'), {
      kind: 'single_image',
      image: image(),
      altText: 'A description.',
    });
    expect(instagramAltText(withAlt.format)).toEqual(['A description.']);

    // Reels and Stories do not support alt_text, so there is nowhere to put it
    // — which is why the type has no field for it on those members.
    const reel = instagramContent(words('Hi'), { kind: 'reel', video: video() });
    expect(instagramAltText(reel.format)).toEqual([]);
  });

  it('lists carousel media in publication order', () => {
    const content = instagramContent(words('Hi'), {
      kind: 'carousel',
      items: [
        { kind: 'image', image: image({ id: 'a' }), altText: null },
        { kind: 'video', video: video({ id: 'b' }) },
      ],
    });
    expect(instagramMedia(content.format).map((m) => m.id)).toEqual(['a', 'b']);
  });
});

/* ========================================================================== */
/* Facebook                                                                   */
/* ========================================================================== */

describe('Facebook content', () => {
  it('publishes words alone — the thing Instagram structurally cannot do', () => {
    const review = reviewFacebookContent(
      facebookContent(words('We are open until 9 tonight.'), { kind: 'text' }),
    );
    expect(review.ok).toBe(true);
  });

  it('refuses a text post with nothing to say', () => {
    const review = reviewFacebookContent(facebookContent(words('   '), { kind: 'text' }));
    expect(review.ok).toBe(false);
    expect(codes(review)).toContain('message_empty');
  });

  it('accepts PNG, which Instagram rejects', () => {
    const review = reviewFacebookContent(
      facebookContent(words('Hi'), { kind: 'photo', photo: image({ format: 'png' }) }),
    );
    expect(review.ok).toBe(true);
  });

  it('applies no hashtag limit, because Meta documents none for a Page post', () => {
    const review = reviewFacebookContent(
      facebookContent(words('Hi', Array.from({ length: 50 }, (_, i) => `tag${i}`)), { kind: 'text' }),
    );
    // 50 hashtags would break Instagram. Borrowing Instagram's 30 here would
    // be inventing a Facebook rule.
    expect(review.ok).toBe(true);
    expect(codes(review)).not.toContain('too_many_hashtags');
  });

  it('applies no message length limit, and says the limit is unchecked', () => {
    const review = reviewFacebookContent(facebookContent(words('x'.repeat(5000)), { kind: 'text' }));
    expect(review.ok).toBe(true);
    expect(review.unchecked.join(' ')).toMatch(/caption limit|Facebook/i);
  });

  it('applies no aspect-ratio rule, because Facebook resizes server-side', () => {
    // The same 1000x2000 image Instagram rejected.
    const review = reviewFacebookContent(
      facebookContent(words('Hi'), { kind: 'photo', photo: image({ width: 1000, height: 2000 }) }),
    );
    expect(review.ok).toBe(true);
  });

  it('takes images up to 10MB, where Instagram stops at 8', () => {
    const nineMb = image({ byteSize: 9 * 1024 * 1024 });
    expect(reviewFacebookContent(facebookContent(words('Hi'), { kind: 'photo', photo: nineMb })).ok).toBe(true);
    expect(
      reviewInstagramContent(
        instagramContent(words('Hi'), { kind: 'single_image', image: nineMb, altText: null }),
      ).ok,
    ).toBe(false);
  });

  it('rejects a link that is not a web address', () => {
    const review = reviewFacebookContent(
      facebookContent(words('Book here'), { kind: 'link', url: 'book us please' }),
    );
    expect(codes(review)).toContain('link_invalid');
  });
});

/* ========================================================================== */
/* Google Business Profile                                                    */
/* ========================================================================== */

describe('Google Business Profile content', () => {
  const soon = '2026-10-01T04:00:00.000Z';
  const later = '2026-10-02T04:00:00.000Z';

  it('accepts a STANDARD post', () => {
    const review = reviewGbpContent(gbpContent(words('New winter hours from Monday.'), { kind: 'STANDARD' }));
    expect(review.ok).toBe(true);
  });

  it('requires an event title and a valid window on an EVENT post', () => {
    const noTitle = reviewGbpContent(
      gbpContent(words('Come along'), {
        kind: 'EVENT',
        event: { title: '  ', startsAt: soon, endsAt: later },
      }),
    );
    expect(codes(noTitle)).toContain('event_title_missing');

    const backwards = reviewGbpContent(
      gbpContent(words('Come along'), {
        kind: 'EVENT',
        event: { title: 'Diwali sale', startsAt: later, endsAt: soon },
      }),
    );
    expect(codes(backwards)).toContain('event_ends_before_start');
  });

  it('carries offer fields that no Meta platform has', () => {
    const review = reviewGbpContent(
      gbpContent(words('20% off colour this month'), {
        kind: 'OFFER',
        event: { title: 'October colour offer', startsAt: soon, endsAt: later },
        offer: { couponCode: 'COLOUR20', redeemOnlineUrl: 'https://example.invalid/book', termsConditions: 'One per customer.' },
      }),
    );
    expect(review.ok).toBe(true);
  });

  it('rejects an offer redemption link that is not a web address', () => {
    const review = reviewGbpContent(
      gbpContent(words('Offer'), {
        kind: 'OFFER',
        event: { title: 'Offer', startsAt: soon, endsAt: null },
        offer: { couponCode: null, redeemOnlineUrl: 'call us', termsConditions: null },
      }),
    );
    expect(codes(review)).toContain('offer_url_invalid');
  });

  it('lets CALL carry no URL while every other CTA needs one', () => {
    const call = reviewGbpContent(
      gbpContent(words('Ring us'), { kind: 'STANDARD' }, { callToAction: { type: 'CALL' } }),
    );
    expect(call.ok).toBe(true);

    const badBook = reviewGbpContent(
      gbpContent(words('Book'), { kind: 'STANDARD' }, { callToAction: { type: 'BOOK', url: 'nope' } }),
    );
    expect(codes(badBook)).toContain('cta_url_invalid');
  });

  it('refuses to claim a summary length limit Google does not document', () => {
    const review = reviewGbpContent(gbpContent(words('x'.repeat(5000)), { kind: 'STANDARD' }));
    expect(review.ok).toBe(true);
    expect(review.unchecked.length).toBeGreaterThan(0);
  });

  it('enforces Google’s 250px short-edge rule, which is not a width rule', () => {
    // 300 wide by 200 tall: wide enough for a width rule, too short for
    // Google's short-edge rule. Modelling the two as one field would miss this.
    const review = reviewGbpContent(
      gbpContent(words('Hi'), { kind: 'STANDARD' }, { media: [image({ width: 300, height: 200 })] }),
    );
    expect(codes(review)).toContain('media_spec');
    expect(review.issues.find((i) => i.code === 'media_spec')?.message).toMatch(/shortest edge/);
  });

  it('does not claim to know which image formats Google accepts', () => {
    const review = reviewGbpContent(
      gbpContent(words('Hi'), { kind: 'STANDARD' }, { media: [image({ format: 'png' })] }),
    );
    // PNG is neither accepted nor rejected here: Google documents no list.
    expect(codes(review)).not.toContain('media_format');
    expect(review.unchecked.join(' ')).toMatch(/image formats/i);
  });
});

/* ========================================================================== */
/* The composite — and product rule 13                                        */
/* ========================================================================== */

describe('a post’s content across platforms', () => {
  const valid: PostContent = {
    instagram: instagramContent(words('IG words'), {
      kind: 'single_image',
      image: image(),
      altText: null,
    }),
    facebook: facebookContent(words('FB words'), { kind: 'text' }),
    google_business: gbpContent(words('GBP words'), { kind: 'STANDARD' }),
  };

  it('carries a platform only when the post speaks to it', () => {
    expect(platformsWithContent(valid)).toEqual(['instagram', 'facebook', 'google_business']);
    expect(platformsWithContent({ instagram: valid.instagram })).toEqual(['instagram']);
    expect(platformsWithContent({})).toEqual([]);
  });

  it('names the platforms a targeted post has not been written for', () => {
    expect(missingContentFor({ instagram: valid.instagram }, ['instagram', 'facebook'])).toEqual([
      'facebook',
    ]);
  });

  it('takes one line of text from a real platform rather than inventing one', () => {
    expect(primaryText(valid)).toBe('IG words');
    expect(primaryText({ facebook: valid.facebook })).toBe('FB words');
    expect(primaryText({})).toBe('');
  });

  /**
   * PRODUCT RULE 13 AT THE CONTENT LAYER.
   *
   * The same enforcement as `availabilityFor`: each review reads only its own
   * platform's content, so one platform's invalid post cannot make another's
   * invalid — or valid.
   */
  it('leaves every other platform’s review untouched when one is invalid', () => {
    const brokenFacebook: PostContent = {
      ...valid,
      facebook: facebookContent(words('  '), { kind: 'text' }),
    };
    const reviews = reviewPostContent(brokenFacebook);

    expect(reviews.facebook?.ok).toBe(false);
    expect(reviews.instagram?.ok).toBe(true);
    expect(reviews.google_business?.ok).toBe(true);
  });

  it('never lets one platform’s issue appear on another platform’s review', () => {
    const brokenInstagram: PostContent = {
      ...valid,
      instagram: instagramContent(words('Hi'), {
        kind: 'single_image',
        image: image({ format: 'png' }),
        altText: null,
      }),
    };
    const reviews = reviewPostContent(brokenInstagram);

    for (const [platform, review] of Object.entries(reviews)) {
      for (const issue of review.issues) {
        expect(issue.platform).toBe(platform);
      }
    }
  });

  it('publishes the platforms whose content is ready, and only those', () => {
    const partly: PostContent = {
      ...valid,
      facebook: facebookContent(words('  '), { kind: 'text' }),
    };
    expect(publishablePlatforms(partly)).toEqual(['instagram', 'google_business']);
  });

  it('reviews nothing for a platform the post does not target', () => {
    const reviews = reviewPostContent({ instagram: valid.instagram });
    expect(reviews.facebook).toBeUndefined();
    expect(reviews.google_business).toBeUndefined();
  });
});
