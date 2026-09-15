import { isError, isReady, isUnavailable, unwrapOrNull } from '@/lib/state/DataState';

import {
  createExpoMediaSource,
  formatFromMime,
  isLocalUri,
  isMeasured,
  kindFromPicked,
  PICKER_FAILED,
  PICKER_PERMISSION_BLOCKED,
  PICKER_PERMISSION_DENIED,
  toMediaAsset,
  unmeasuredFields,
  type ExpoPickerModule,
  type MediaAsset,
  type PickedAsset,
  type PickerLaunchOptions,
  type PickerResult,
} from '../index';

/**
 * THE PICKER ADAPTER.
 *
 * Its whole job is translation, and the way translation goes wrong here is by
 * inventing a measurement. `ImagePickerAsset` says "I don't know" with a 0, an
 * `undefined` and a missing MIME type; `MediaAsset` says it with `null` and
 * `format: 'unknown'`. Every test below is about one of those crossings.
 *
 * Nothing here loads the native module — the adapter takes an `ExpoPickerModule`
 * and these tests hand it a plain object.
 */

const NOW = new Date('2026-09-16T04:00:00.000Z');

/** Everything the system managed to report. The happy case. */
const FULLY_REPORTED: PickedAsset = {
  uri: 'file:///storage/emulated/0/DCIM/Camera/IMG_2201.jpg',
  assetId: 'a-1',
  width: 3024,
  height: 4032,
  type: 'image',
  fileName: 'IMG_2201.jpg',
  fileSize: 2_411_233,
  mimeType: 'image/jpeg',
};

function pickerReturning(
  result: PickerResult,
  permission = { granted: true, canAskAgain: true },
): { picker: ExpoPickerModule; launches: PickerLaunchOptions[] } {
  const launches: PickerLaunchOptions[] = [];
  return {
    launches,
    picker: {
      requestMediaLibraryPermissionsAsync: async () => permission,
      launchImageLibraryAsync: async (options) => {
        launches.push(options);
        return result;
      },
    },
  };
}

function sourceReturning(assets: readonly PickedAsset[]) {
  const { picker, launches } = pickerReturning({ canceled: false, assets });
  let n = 0;
  return {
    launches,
    source: createExpoMediaSource({ picker, now: () => NOW, newId: () => `m-${(n += 1)}` }),
  };
}

async function pickOne(asset: PickedAsset): Promise<MediaAsset> {
  const { source } = sourceReturning([asset]);
  const state = await source.pick();
  const assets = unwrapOrNull(state);
  expect(assets).not.toBeNull();
  const [first] = assets ?? [];
  if (first === undefined) throw new Error('expected one asset');
  return first;
}

describe('translating what the picker reported', () => {
  it('carries a fully reported photo across intact', async () => {
    const asset = await pickOne(FULLY_REPORTED);

    expect(asset).toEqual({
      id: 'm-1',
      kind: 'image',
      format: 'jpeg',
      uri: FULLY_REPORTED.uri,
      width: 3024,
      height: 4032,
      byteSize: 2_411_233,
      durationSeconds: null,
      altText: null,
    });
    expect(isMeasured(asset)).toBe(true);
  });

  it('numbers each asset, so a carousel has distinct ids', async () => {
    const { source } = sourceReturning([FULLY_REPORTED, FULLY_REPORTED, FULLY_REPORTED]);

    const picked = unwrapOrNull(await source.pick({ limit: 10 })) ?? [];

    expect(picked.map((a) => a.id)).toEqual(['m-1', 'm-2', 'm-3']);
  });
});

describe('a zero the system never measured does not become a measurement', () => {
  /*
   * PRODUCT RULE 7, AT THE BOUNDARY WHERE IT IS EASIEST TO BREAK.
   *
   * expo-image-picker types width/height as `number` and documents that they
   * "can be 0 if the system did not provide" them. Copying that 0 through would
   * put a measured-looking zero into the domain, and every downstream check
   * reads `width !== null` as "measured".
   */
  it('maps an unreported width and height to null, not 0', async () => {
    const asset = await pickOne({ ...FULLY_REPORTED, width: 0, height: 0 });

    expect(asset.width).toBeNull();
    expect(asset.height).toBeNull();
    expect(asset.width).not.toBe(0);
  });

  it('refuses such an asset downstream rather than treating it as fine', async () => {
    const asset = await pickOne({ ...FULLY_REPORTED, width: 0, height: 0 });

    expect(isMeasured(asset)).toBe(false);
    expect(unmeasuredFields(asset)).toContain('size in pixels');
  });

  it('maps an absent file size to null', async () => {
    const { fileSize: _omitted, ...withoutSize } = FULLY_REPORTED;
    const asset = await pickOne(withoutSize);

    expect(asset.byteSize).toBeNull();
    expect(isMeasured(asset)).toBe(false);
  });

  it('keeps a measured zero-byte file as 0, which is a different fact', async () => {
    // Nobody failed to measure this one: it is an empty file, and validation
    // refuses it on its own terms rather than calling it unmeasured.
    const asset = await pickOne({ ...FULLY_REPORTED, fileSize: 0 });

    expect(asset.byteSize).toBe(0);
  });
});

describe('a format nobody disclosed stays undisclosed', () => {
  it('maps a missing MIME type to unknown rather than reading the filename', async () => {
    const { mimeType: _omitted, ...withoutMime } = FULLY_REPORTED;
    const asset = await pickOne({ ...withoutMime, fileName: 'holi-offer.jpg' });

    // The name says JPEG. The name is not a measurement.
    expect(asset.format).toBe('unknown');
    expect(isMeasured(asset)).toBe(false);
    expect(unmeasuredFields(asset)).toContain('file type');
  });

  it('maps the formats a phone actually hands over', () => {
    expect(formatFromMime('image/jpeg')).toBe('jpeg');
    expect(formatFromMime('image/png')).toBe('png');
    expect(formatFromMime('image/webp')).toBe('webp');
    expect(formatFromMime('image/heic')).toBe('heic');
    expect(formatFromMime('image/heif')).toBe('heic');
    expect(formatFromMime('video/mp4')).toBe('mp4');
    expect(formatFromMime('video/quicktime')).toBe('mov');
  });

  it('tolerates the shapes a MIME type really arrives in', () => {
    expect(formatFromMime('IMAGE/JPEG')).toBe('jpeg');
    expect(formatFromMime('image/jpeg; charset=binary')).toBe('jpeg');
    expect(formatFromMime(undefined)).toBe('unknown');
    expect(formatFromMime('application/octet-stream')).toBe('unknown');
  });
});

describe('videos are measured in the units the domain uses', () => {
  it('converts the picker’s milliseconds into seconds', async () => {
    const asset = await pickOne({
      ...FULLY_REPORTED,
      type: 'video',
      mimeType: 'video/mp4',
      duration: 15_000,
    });

    // 15_000 passed through unconverted would look like a four-hour clip and
    // clear every duration ceiling in the specs.
    expect(asset.kind).toBe('video');
    expect(asset.durationSeconds).toBe(15);
  });

  it('leaves an unreported duration null instead of zero', async () => {
    const asset = await pickOne({
      ...FULLY_REPORTED,
      type: 'video',
      mimeType: 'video/mp4',
      duration: null,
    });

    expect(asset.durationSeconds).toBeNull();
    expect(isMeasured(asset)).toBe(false);
  });

  it('never puts a duration on a still', async () => {
    const asset = await pickOne({ ...FULLY_REPORTED, duration: 9_000 });

    expect(asset.kind).toBe('image');
    expect(asset.durationSeconds).toBeNull();
  });
});

describe('deciding image or video when the picker could not', () => {
  it('reads the declared type when there is one', () => {
    expect(kindFromPicked({ ...FULLY_REPORTED, type: 'video' })).toBe('video');
    expect(kindFromPicked({ ...FULLY_REPORTED, type: 'pairedVideo' })).toBe('video');
    expect(kindFromPicked({ ...FULLY_REPORTED, type: 'livePhoto' })).toBe('image');
  });

  it('falls back to the MIME family, and the guess is harmless either way', async () => {
    expect(kindFromPicked({ ...FULLY_REPORTED, type: null, mimeType: 'video/mp4' })).toBe('video');

    const { mimeType: _omitted, ...withoutMime } = FULLY_REPORTED;
    const undetermined = await pickOne({ ...withoutMime, type: null });

    // Whichever way `kind` fell, the format is unknown, so nothing publishes.
    expect(undetermined.format).toBe('unknown');
    expect(isMeasured(undetermined)).toBe(false);
  });
});

describe('what the adapter asks the picker for', () => {
  it('asks for stills only by default', async () => {
    const { source, launches } = sourceReturning([FULLY_REPORTED]);
    await source.pick();

    expect(launches[0]?.mediaTypes).toEqual(['images']);
  });

  it('admits videos only when the caller asked for them', async () => {
    const { source, launches } = sourceReturning([FULLY_REPORTED]);
    await source.pick({ imagesOnly: false });

    expect(launches[0]?.mediaTypes).toEqual(['images', 'videos']);
  });

  it('allows one photo unless a limit says otherwise', async () => {
    const { source, launches } = sourceReturning([FULLY_REPORTED]);
    await source.pick();

    expect(launches[0]?.allowsMultipleSelection).toBe(false);
    expect(launches[0]?.selectionLimit).toBe(1);
  });

  it('passes a carousel limit through', async () => {
    const { source, launches } = sourceReturning([FULLY_REPORTED]);
    await source.pick({ limit: 10 });

    expect(launches[0]?.allowsMultipleSelection).toBe(true);
    expect(launches[0]?.selectionLimit).toBe(10);
  });

  it('never asks for base64 or EXIF', async () => {
    const { source, launches } = sourceReturning([FULLY_REPORTED]);
    await source.pick();

    // base64 would put the whole image in JS memory and into anything that logs
    // the asset; EXIF carries the owner's GPS coordinates and publishing needs
    // neither.
    expect(launches[0]?.base64).toBe(false);
    expect(launches[0]?.exif).toBe(false);
  });

  it('does not crop on the way in, and does not re-encode', async () => {
    const { source, launches } = sourceReturning([FULLY_REPORTED]);
    await source.pick();

    // Both belong to preparation, which knows each platform's bounds.
    expect(launches[0]?.allowsEditing).toBe(false);
    expect(launches[0]?.quality).toBe(1);
  });
});

describe('when the owner says no, or nothing at all', () => {
  it('treats cancelling as a successful empty pick, not an error', async () => {
    const { picker } = pickerReturning({ canceled: true });
    const source = createExpoMediaSource({ picker, now: () => NOW });

    const state = await source.pick();

    expect(isReady(state)).toBe(true);
    expect(unwrapOrNull(state)).toEqual([]);
  });

  it('reports a refused permission as unavailable, and never opens the picker', async () => {
    const { picker, launches } = pickerReturning(
      { canceled: true },
      { granted: false, canAskAgain: true },
    );
    const source = createExpoMediaSource({ picker, now: () => NOW });

    const state = await source.pick();

    expect(isUnavailable(state)).toBe(true);
    expect(state).toMatchObject({ reason: 'not_connected', message: PICKER_PERMISSION_DENIED });
    expect(launches).toHaveLength(0);
  });

  it('points at Settings once Android will not prompt again', async () => {
    const { picker } = pickerReturning(
      { canceled: true },
      { granted: false, canAskAgain: false },
    );
    const source = createExpoMediaSource({ picker, now: () => NOW });

    // "Try again" would be a lie here — the prompt cannot reappear.
    expect(await source.pick()).toMatchObject({ message: PICKER_PERMISSION_BLOCKED });
  });

  it('turns a throwing native picker into an owner-facing failure', async () => {
    const source = createExpoMediaSource({
      now: () => NOW,
      picker: {
        requestMediaLibraryPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
        launchImageLibraryAsync: async () => {
          throw new Error('Activity com.shoogle.app/.MainActivity has leaked ServiceConnection');
        },
      },
    });

    const state = await source.pick();

    expect(isError(state)).toBe(true);
    expect(state).toMatchObject({ message: PICKER_FAILED });
    // The raw error never reaches the owner.
    expect(JSON.stringify(state)).not.toContain('ServiceConnection');
  });
});

describe('picking gets nothing closer to publishable', () => {
  it('hands back a local URI that is still unpublishable', async () => {
    const asset = await pickOne(FULLY_REPORTED);

    expect(isLocalUri(asset.uri)).toBe(true);
    // Only a MediaHost can mint PublishableMedia, and nothing here is one.
    expect(asset.uri.startsWith('https://')).toBe(false);
  });

  it('reports itself configured, unlike the default source', async () => {
    const { source } = sourceReturning([FULLY_REPORTED]);

    expect(source.isConfigured()).toBe(true);
    expect(source.id).toBe('expo-image-picker');
  });

  it('writes no alt text of its own', async () => {
    const asset = await pickOne(FULLY_REPORTED);

    // Alt text the owner did not write is a fabrication about their photo.
    expect(asset.altText).toBeNull();
  });
});

describe('toMediaAsset is the whole translation, and is pure', () => {
  it('maps without touching a picker at all', () => {
    expect(toMediaAsset({ ...FULLY_REPORTED, width: 0 }, 'fixed-id')).toEqual({
      id: 'fixed-id',
      kind: 'image',
      format: 'jpeg',
      uri: FULLY_REPORTED.uri,
      width: null,
      height: 4032,
      byteSize: 2_411_233,
      durationSeconds: null,
      altText: null,
    });
  });
});
