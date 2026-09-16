import { isError, isReady, unwrapOrNull } from '@/lib/state/DataState';

import {
  centredCrop,
  createExpoMediaPreparer,
  planPreparation,
  QUALITY_LADDER,
  saveableFormat,
  validateForPlatform,
  type ImageManipulatorModule,
  type ManipulationRequest,
  type MediaAsset,
  type MeasureBytes,
  type PreparedMedia,
} from '../index';

/**
 * THE PREPARER.
 *
 * `prepare.ts` decides what must change; this is the half that carries it out.
 * The failure mode worth testing for is a preparer that claims more than the
 * library did — an unmeasured byte size, an upscale dressed up as a resize, or
 * an over-ceiling file handed over because the compression ladder ran out.
 *
 * No native module is loaded: the preparer takes an `ImageManipulatorModule`
 * and a `measureBytes`, and every test below supplies both.
 */

const MB = 1024 * 1024;

/** A photo Instagram is happy with as-is: JPEG, inside every bound. */
const FITS_INSTAGRAM: MediaAsset = {
  id: 'a-1',
  kind: 'image',
  format: 'jpeg',
  uri: 'file:///storage/photo.jpg',
  width: 1080,
  height: 1350,
  byteSize: 2 * MB,
  durationSeconds: null,
  altText: null,
};

/** Records every request, and reports whatever geometry it was asked for. */
function fakeManipulator(
  dimensionsFor?: (request: ManipulationRequest) => { width: number; height: number },
): { manipulator: ImageManipulatorModule; requests: ManipulationRequest[] } {
  const requests: ManipulationRequest[] = [];
  return {
    requests,
    manipulator: {
      manipulate: async (request) => {
        requests.push(request);
        const size =
          dimensionsFor?.(request) ??
          request.crop ??
          request.resize ?? { width: 1080, height: 1350 };
        return {
          uri: `file:///cache/prepared-${requests.length}.jpg`,
          width: size.width,
          height: size.height,
        };
      },
    },
  };
}

/** A measurer that returns a fixed size, or a scripted sequence. */
function measuring(...sizes: (number | null)[]): MeasureBytes {
  let call = 0;
  return async () => {
    const value = sizes[Math.min(call, sizes.length - 1)] ?? null;
    call += 1;
    return value;
  };
}

function preparerWith(
  manipulator: ImageManipulatorModule,
  measureBytes: MeasureBytes,
  quality?: readonly number[],
) {
  return createExpoMediaPreparer(
    quality === undefined
      ? { manipulator, measureBytes }
      : { manipulator, measureBytes, quality },
  );
}

async function prepared(state: Awaited<ReturnType<ReturnType<typeof preparerWith>['prepare']>>) {
  const value = unwrapOrNull(state);
  if (value === null) throw new Error('expected a prepared artifact');
  return value as PreparedMedia;
}

describe('the plan governs, and is never skipped', () => {
  it('refuses an unmeasured image without touching the library', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const state = await preparer.prepare(
      { ...FITS_INSTAGRAM, width: null, height: null },
      'instagram',
    );

    expect(isError(state)).toBe(true);
    expect(state).toMatchObject({ code: 'dimensions_unknown', retryable: false });
    // Nothing was resized on a guess about how big it is.
    expect(requests).toHaveLength(0);
  });

  it('refuses a file whose format could not be read', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const state = await preparer.prepare({ ...FITS_INSTAGRAM, format: 'unknown' }, 'instagram');

    expect(state).toMatchObject({ code: 'format_unknown', retryable: false });
    expect(requests).toHaveLength(0);
  });

  it('refuses an image below Instagram’s floor rather than enlarging it', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    // 240px against a documented 320px minimum.
    const state = await preparer.prepare(
      { ...FITS_INSTAGRAM, width: 240, height: 300 },
      'instagram',
    );

    expect(state).toMatchObject({ code: 'too_small', retryable: false });
    // Upscaling would invent detail the camera never captured.
    expect(requests).toHaveLength(0);
  });

  it('refuses for Google’s short-edge rule, which is not a width rule', async () => {
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const state = await preparer.prepare(
      { ...FITS_INSTAGRAM, width: 2000, height: 200 },
      'google_business',
    );

    expect(state).toMatchObject({ code: 'too_small' });
  });

  it('gives the planner’s own refusal, so validation and preparation agree', async () => {
    const tiny: MediaAsset = { ...FITS_INSTAGRAM, width: 240, height: 300 };
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const state = await preparer.prepare(tiny, 'instagram');
    const [problem] = validateForPlatform(tiny, 'instagram');

    // The composer cannot tell an owner something is fine that preparation
    // would then reject: one planner, read two ways.
    expect(state).toMatchObject({ message: problem?.message });
  });

  it('marks refusals as not retryable, because the same photo refuses again', async () => {
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const state = await preparer.prepare({ ...FITS_INSTAGRAM, format: 'unknown' }, 'instagram');

    expect(state).toMatchObject({ retryable: false });
  });
});

describe('preparing for Instagram', () => {
  it('does nothing at all to a photo that already fits', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const artifact = await prepared(await preparer.prepare(FITS_INSTAGRAM, 'instagram'));

    // Re-encoding a file that already fits costs quality for nothing.
    expect(requests).toHaveLength(0);
    expect(artifact.uri).toBe(FITS_INSTAGRAM.uri);
    expect(artifact.changes).toEqual([]);
    expect(artifact.byteSize).toBe(2 * MB);
    expect(artifact.preparedFor).toBe('instagram');
  });

  it('transcodes a PNG, because Instagram documents JPEG only', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(1 * MB));

    const artifact = await prepared(
      await preparer.prepare({ ...FITS_INSTAGRAM, format: 'png' }, 'instagram'),
    );

    expect(requests[0]?.format).toBe('jpeg');
    expect(artifact.format).toBe('jpeg');
    expect(artifact.changes).toContainEqual({ kind: 'transcode', to: 'jpeg' });
  });

  it('resizes down to the 1440px ceiling, keeping the proportions', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(3 * MB));

    await preparer.prepare({ ...FITS_INSTAGRAM, width: 2880, height: 3600 }, 'instagram');

    expect(requests[0]?.resize).toEqual({ width: 1440, height: 1800 });
  });

  it('crops a too-wide photo, centred, in the frame left by the resize', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(3 * MB));

    // 3000x1000 is 3.0 wide; Instagram's documented ceiling is 1.91.
    await preparer.prepare({ ...FITS_INSTAGRAM, width: 3000, height: 1000 }, 'instagram');

    // Resized to 1440x480 first, so the crop frame is 1440 wide, not 3000.
    // A crop computed against the original would cut the wrong rectangle.
    expect(requests[0]?.resize).toEqual({ width: 1440, height: 480 });
    expect(requests[0]?.crop).toEqual({ originX: 262, originY: 0, width: 917, height: 480 });
  });

  it('reports the library’s dimensions, not the plan’s intentions', async () => {
    // The library rounded differently from the planner. The file on disk is the
    // fact; the plan was only ever an intention.
    const { manipulator } = fakeManipulator(() => ({ width: 1439, height: 1799 }));
    const preparer = preparerWith(manipulator, measuring(3 * MB));

    const artifact = await prepared(
      await preparer.prepare({ ...FITS_INSTAGRAM, width: 2880, height: 3600 }, 'instagram'),
    );

    expect(artifact.width).toBe(1439);
    expect(artifact.height).toBe(1799);
  });

  it('keeps the source asset alongside the artifact', async () => {
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(1 * MB));

    const artifact = await prepared(
      await preparer.prepare({ ...FITS_INSTAGRAM, format: 'png' }, 'instagram'),
    );

    expect(artifact.source).toEqual({ ...FITS_INSTAGRAM, format: 'png' });
    expect(artifact.uri).not.toBe(FITS_INSTAGRAM.uri);
  });
});

describe('one platform’s rules are not another’s', () => {
  it('leaves a PNG alone for Facebook, which accepts it', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const artifact = await prepared(
      await preparer.prepare({ ...FITS_INSTAGRAM, format: 'png' }, 'facebook'),
    );

    expect(requests).toHaveLength(0);
    expect(artifact.format).toBe('png');
    expect(artifact.changes).toEqual([]);
  });

  it('does not resize for Facebook, which documents no width ceiling', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const artifact = await prepared(
      await preparer.prepare({ ...FITS_INSTAGRAM, width: 4000, height: 3000 }, 'facebook'),
    );

    expect(requests).toHaveLength(0);
    expect(artifact.width).toBe(4000);
  });

  it('prepares the same photo differently for each platform', async () => {
    const wide: MediaAsset = { ...FITS_INSTAGRAM, format: 'png', width: 3000, height: 1000 };
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(2 * MB));

    const forInstagram = await prepared(await preparer.prepare(wide, 'instagram'));
    const forFacebook = await prepared(await preparer.prepare(wide, 'facebook'));

    expect(forInstagram.changes.map((c) => c.kind)).toEqual(['transcode', 'resize', 'crop']);
    expect(forFacebook.changes).toEqual([]);
    expect(forInstagram.preparedFor).toBe('instagram');
    expect(forFacebook.preparedFor).toBe('facebook');
  });
});

describe('the compression ladder', () => {
  it('starts below full quality when the planner already knows it is oversized', async () => {
    const { manipulator, requests } = fakeManipulator();
    // 9MB against Instagram's documented 8MB ceiling.
    const preparer = preparerWith(manipulator, measuring(7 * MB));

    await preparer.prepare({ ...FITS_INSTAGRAM, byteSize: 9 * MB }, 'instagram');

    // Writing a file at quality 1 that is already known to be too big is wasted
    // work, so the first rung is skipped.
    expect(requests[0]?.compress).toBe(QUALITY_LADDER[1]);
  });

  it('steps down and remeasures until it is under the ceiling', async () => {
    const { manipulator, requests } = fakeManipulator();
    // Still over on the first two attempts, under on the third.
    const preparer = preparerWith(manipulator, measuring(9 * MB, 8.5 * MB, 6 * MB));

    const artifact = await prepared(
      await preparer.prepare({ ...FITS_INSTAGRAM, byteSize: 9 * MB }, 'instagram'),
    );

    expect(requests).toHaveLength(3);
    expect(requests.map((r) => r.compress)).toEqual([0.9, 0.75, 0.6]);
    expect(artifact.byteSize).toBe(6 * MB);
  });

  it('refuses when the ladder runs out, rather than handing over the smallest try', async () => {
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(20 * MB));

    const state = await preparer.prepare({ ...FITS_INSTAGRAM, byteSize: 30 * MB }, 'instagram');

    expect(isError(state)).toBe(true);
    expect(state).toMatchObject({ code: 'too_large' });
    // An image still over the ceiling is not prepared, whatever effort went in.
    expect(unwrapOrNull(state)).toBeNull();
  });

  it('does not compress at all when the platform states no ceiling', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(50 * MB));

    // Google documents no image byte limit, so there is nothing to compress
    // towards and Shoogle makes no claim of its own.
    const state = await preparer.prepare(
      { ...FITS_INSTAGRAM, format: 'png', width: 2000, height: 2000, byteSize: 50 * MB },
      'google_business',
    );

    expect(isReady(state)).toBe(true);
    expect(requests).toHaveLength(0);
  });
});

describe('nothing is claimed that was not measured', () => {
  it('refuses when the prepared file cannot be measured', async () => {
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(null));

    const state = await preparer.prepare({ ...FITS_INSTAGRAM, format: 'png' }, 'instagram');

    // No estimate, no "probably fine". PreparedMedia.byteSize is not nullable
    // and an invented one would defeat every ceiling check downstream.
    expect(state).toMatchObject({ code: 'size_unknown' });
  });

  it('refuses when an untouched file cannot be measured either', async () => {
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(null));

    const state = await preparer.prepare({ ...FITS_INSTAGRAM, byteSize: null }, 'instagram');

    expect(state).toMatchObject({ code: 'size_unknown' });
  });

  it('refuses if preparation left the image under the platform’s floor', async () => {
    // The library came back with something smaller than Instagram documents as
    // acceptable. Publishing it would fail at publish time instead.
    const { manipulator } = fakeManipulator(() => ({ width: 300, height: 375 }));
    const preparer = preparerWith(manipulator, measuring(1 * MB));

    const state = await preparer.prepare({ ...FITS_INSTAGRAM, format: 'png' }, 'instagram');

    expect(state).toMatchObject({ code: 'too_small' });
  });

  it('turns a throwing library into an owner-facing refusal', async () => {
    const preparer = preparerWith(
      {
        manipulate: async () => {
          throw new Error('OutOfMemoryError: Failed to allocate a 138412032 byte allocation');
        },
      },
      measuring(1 * MB),
    );

    const state = await preparer.prepare({ ...FITS_INSTAGRAM, format: 'png' }, 'instagram');

    expect(isError(state)).toBe(true);
    expect(JSON.stringify(state)).not.toContain('OutOfMemoryError');
  });
});

describe('video is passed through, not transcoded', () => {
  const VIDEO: MediaAsset = {
    ...FITS_INSTAGRAM,
    kind: 'video',
    format: 'mp4',
    uri: 'file:///storage/clip.mp4',
    durationSeconds: 20,
    byteSize: 40 * MB,
  };

  it('hands an acceptable video straight through', async () => {
    const { manipulator, requests } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(40 * MB));

    const artifact = await prepared(await preparer.prepare(VIDEO, 'instagram'));

    // The image manipulator has no business touching a video.
    expect(requests).toHaveLength(0);
    expect(artifact.kind).toBe('video');
    expect(artifact.uri).toBe(VIDEO.uri);
  });

  it('refuses a container Instagram does not document', async () => {
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(40 * MB));

    const state = await preparer.prepare({ ...VIDEO, format: 'webp' }, 'instagram');

    expect(state).toMatchObject({ code: 'format_unsupported' });
  });

  it('refuses an unmeasured video rather than writing a zero dimension', async () => {
    const { manipulator } = fakeManipulator();
    const preparer = preparerWith(manipulator, measuring(40 * MB));

    const state = await preparer.prepare({ ...VIDEO, width: null, height: null }, 'instagram');

    // The planner tolerates unknown video dimensions; PreparedMedia does not,
    // and 0 would be a measurement of nothing.
    expect(state).toMatchObject({ code: 'dimensions_unknown' });
  });
});

describe('the pure pieces', () => {
  it('centres a crop inside its frame', () => {
    expect(centredCrop(1440, 480, 917, 480)).toEqual({
      originX: 262,
      originY: 0,
      width: 917,
      height: 480,
    });
    expect(centredCrop(1000, 2000, 1000, 1250)).toEqual({
      originX: 0,
      originY: 375,
      width: 1000,
      height: 1250,
    });
  });

  it('never asks for a crop larger than the frame it has', () => {
    expect(centredCrop(500, 500, 900, 900)).toEqual({
      originX: 0,
      originY: 0,
      width: 500,
      height: 500,
    });
  });

  it('knows which formats the library can write', () => {
    expect(saveableFormat('jpeg')).toBe('jpeg');
    expect(saveableFormat('png')).toBe('png');
    expect(saveableFormat('webp')).toBe('webp');
    // Readable, not writable — so a rewrite is a refusal, not a substitution.
    expect(saveableFormat('heic')).toBeNull();
    expect(saveableFormat('mp4')).toBeNull();
    expect(saveableFormat('unknown')).toBeNull();
  });

  it('applies changes in the order the planner returned them', async () => {
    const plan = planPreparation(
      { ...FITS_INSTAGRAM, format: 'png', width: 3000, height: 1000, byteSize: 9 * 1024 * 1024 },
      'instagram',
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changes.map((c) => c.kind)).toEqual([
      'transcode',
      'resize',
      'crop',
      'recompress',
    ]);
  });
});
