import {
  allHashtags,
  captionLength,
  editCaption,
  extractInlineHashtags,
  generatedCaption,
  getSocialContentGenerator,
  isGenerationAvailable,
  normaliseHashtags,
  ownerCaption,
  renderCaption,
  reviewCaption,
  setSocialContentGenerator,
  unconfiguredGenerator,
} from '../index';

describe('hashtags', () => {
  it('strips hashes, blanks and duplicates while keeping order and case', () => {
    expect(normaliseHashtags(['#NaviMumbai', 'salon', '  ', '#navimumbai', '##offer'])).toEqual([
      'NaviMumbai',
      'salon',
      'offer',
    ]);
  });

  it('finds hashtags written inline, including Devanagari', () => {
    expect(extractInlineHashtags('Monsoon offer #salon #नवीमुंबई')).toEqual(['salon', 'नवीमुंबई']);
  });

  it('does not repeat a tag that is already inline', () => {
    const caption = ownerCaption('Book now #salon', 'en', ['salon', 'offer']);
    expect(renderCaption(caption)).toBe('Book now #salon\n\n#offer');
    expect(allHashtags(caption)).toEqual(['salon', 'offer']);
  });

  it('returns the body untouched when there is nothing to append', () => {
    expect(renderCaption(ownerCaption('Just words'))).toBe('Just words');
  });
});

describe('length', () => {
  it('counts code points, so Devanagari and emoji are not double-counted', () => {
    // 'नमस्ते' is 6 code points; String.length agrees here, but an emoji does not.
    expect(captionLength(ownerCaption('नमस्ते'))).toBe(6);
    expect(captionLength(ownerCaption('👍'))).toBe(1);
    expect('👍'.length).toBe(2); // the trap this avoids
  });

  it('counts the rendered caption, hashtags included', () => {
    expect(captionLength(ownerCaption('Hi', 'en', ['a']))).toBe('Hi\n\n#a'.length);
  });
});

describe('provenance', () => {
  it('keeps the owner’s words theirs', () => {
    const caption = editCaption(ownerCaption('Mine'), { body: 'Still mine' });
    expect(caption.origin).toBe('owner');
    expect(caption.generatedBy).toBeNull();
  });

  it('does not launder generated copy into the owner’s own when edited', () => {
    const generated = generatedCaption('Model wrote this', 'hinglish', ['salon'], 'model-x');
    expect(generated.origin).toBe('generated');

    const edited = editCaption(generated, { body: 'Owner changed this' });
    expect(edited.origin).toBe('generated_edited');
    expect(edited.generatedBy).toBe('model-x');
  });
});

describe('review', () => {
  it('reports an empty caption as Shoogle’s own rule, not a platform’s', () => {
    const review = reviewCaption(ownerCaption('   '), ['instagram']);
    expect(review.ok).toBe(false);
    expect(review.issues[0]).toMatchObject({ problem: 'empty', platform: null });
  });

  /**
   * The key distinction: a caption with no problems is `ok`, but the platforms
   * whose limits could not be checked come back in `unchecked`. The composer
   * must show that rather than a bare green tick.
   */
  it('separates "nothing wrong" from "nothing checked"', () => {
    const review = reviewCaption(ownerCaption('A normal caption'), ['instagram', 'linkedin']);
    expect(review.ok).toBe(true);
    expect(review.issues).toEqual([]);
    expect(review.unchecked.sort()).toEqual(['instagram', 'linkedin']);
  });

  it('checks nothing, and claims nothing, when no platform is chosen', () => {
    const review = reviewCaption(ownerCaption('A normal caption'), []);
    expect(review.ok).toBe(true);
    expect(review.unchecked).toEqual([]);
  });
});

describe('the content generator seam', () => {
  afterEach(() => setSocialContentGenerator(null));

  it('is unconfigured by default and says so instead of returning text', async () => {
    expect(isGenerationAvailable()).toBe(false);
    const state = await getSocialContentGenerator().generateCaption({
      business: { businessId: 'b1', name: 'Example Salon', category: 'salon', locality: null },
      platforms: ['instagram'],
      language: 'en',
      brief: 'monsoon offer',
      rewriteOf: null,
    });
    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') expect(state.reason).toBe('not_connected');
  });

  it('reports the same for slide copy', async () => {
    const state = await unconfiguredGenerator.generateSlideCopy({
      business: { businessId: 'b1', name: 'Example Salon', category: 'salon', locality: null },
      language: 'en',
      brief: 'monsoon offer',
      slideCount: 3,
    });
    expect(state.status).toBe('unavailable');
  });

  it('lets a real generator be installed without touching any screen', async () => {
    setSocialContentGenerator({
      id: 'test',
      displayName: 'Test',
      isConfigured: () => true,
      generateCaption: async () => ({
        status: 'ready',
        value: {
          caption: generatedCaption('Written', 'en', [], 'test'),
          modelId: 'test',
          generatedAt: '2026-08-31T00:00:00.000Z',
        },
        fetchedAt: '2026-08-31T00:00:00.000Z',
      }),
      generateSlideCopy: async () => ({
        status: 'unavailable',
        reason: 'not_supported',
        message: 'This generator does not write slides.',
      }),
    });

    expect(isGenerationAvailable()).toBe(true);
    const state = await getSocialContentGenerator().generateCaption({
      business: { businessId: 'b1', name: 'Example Salon', category: 'salon', locality: null },
      platforms: ['instagram'],
      language: 'en',
      brief: 'monsoon offer',
      rewriteOf: null,
    });
    expect(state.status).toBe('ready');
  });
});
