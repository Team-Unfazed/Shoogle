/**
 * The Expo adapter for `MediaSource` — the owner's gallery. Owner: Yash.
 *
 * ===================== WHAT THIS DOES AND DOES NOT DO =======================
 *
 * It opens the system picker and reports EXACTLY what the picker disclosed.
 * It does not transcode, resize, crop, upload or repair anything: preparation
 * is `prepare.ts` (unimplemented) and hosting is `host.ts` (Sunny's). The URI
 * that comes back is a `file://` or `content://` path on the phone, and
 * `isLocalUri()` still returns true for it — picking gets Shoogle no closer to
 * publishing, and nothing here can mint a `PublishableMedia`.
 *
 * ==================== WHY THE MAPPING IS THE INTERESTING PART ===============
 *
 * `ImagePickerAsset` and `MediaAsset` disagree about how to say "I don't know",
 * and translating carelessly is how a fabricated measurement enters the system:
 *
 *   width / height   The picker types these `number`, but its own docs say they
 *                    "can be 0 if the system did not provide" them. Zero pixels
 *                    is not a measurement, it is the absence of one, so 0 maps
 *                    to `null` — product rule 7, at the exact boundary where
 *                    the outside world hands us a zero meaning "unknown".
 *   fileSize         Absent when the picker could not stat the file, so
 *                    `undefined` maps to `null`. A literal 0 is preserved: that
 *                    is a measured, empty file, and validation refuses it on
 *                    its own terms rather than calling it unmeasured.
 *   mimeType         Absent or unrecognised maps to `format: 'unknown'`, never
 *                    a guess from the filename. An Android `content://` URI
 *                    genuinely does not always disclose its type, and
 *                    `isMeasured()` treats 'unknown' as a refusal — so an
 *                    undisclosed format blocks publication instead of being
 *                    assumed to be a JPEG.
 *   duration         The picker reports MILLISECONDS; `MediaAsset` holds
 *                    SECONDS. Passing it through unconverted would make a
 *                    15-second clip look like a four-hour one and sail past
 *                    every duration check.
 *
 * The one guess left is `kind`, because `MediaKind` has no 'unknown' member.
 * It is harmless: when the type could not be determined the format is 'unknown'
 * too, so the asset is refused downstream whichever way `kind` fell.
 */

import * as ImagePicker from 'expo-image-picker';

import type { Result } from '@/lib/providers/types';
import { failed, ready, unavailable } from '@/lib/state/DataState';

import type { MediaAsset, MediaFormat, MediaKind } from '../types';

import type { MediaSource, PickOptions } from './probe';

/* -------------------------------------------------------------------------- */
/* The seam                                                                   */
/* -------------------------------------------------------------------------- */

/** What the picker reports about one file. A subset of `ImagePickerAsset`. */
export interface PickedAsset {
  readonly uri: string;
  readonly assetId?: string | null;
  readonly width: number;
  readonly height: number;
  readonly type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo' | null;
  readonly fileName?: string | null;
  readonly fileSize?: number;
  readonly mimeType?: string;
  readonly duration?: number | null;
}

export type PickerResult =
  | { readonly canceled: true }
  | { readonly canceled: false; readonly assets: readonly PickedAsset[] };

export interface PickerPermission {
  readonly granted: boolean;
  /** False once the owner has permanently refused; only Settings can undo it. */
  readonly canAskAgain: boolean;
}

export interface PickerLaunchOptions {
  readonly mediaTypes: readonly ('images' | 'videos')[];
  readonly allowsMultipleSelection: boolean;
  readonly selectionLimit: number;
  readonly allowsEditing: boolean;
  readonly base64: boolean;
  readonly exif: boolean;
  readonly quality: number;
}

/**
 * The slice of `expo-image-picker` this adapter uses.
 *
 * Declared structurally so the tests can hand over a fake instead of loading a
 * native module — the mapping above is the part worth testing, and it is pure.
 */
export interface ExpoPickerModule {
  requestMediaLibraryPermissionsAsync(): Promise<PickerPermission>;
  launchImageLibraryAsync(options: PickerLaunchOptions): Promise<PickerResult>;
}

/* -------------------------------------------------------------------------- */
/* Owner-facing copy                                                          */
/* -------------------------------------------------------------------------- */

export const PICKER_PERMISSION_DENIED =
  'Shoogle needs permission to open your photos. Allow access and try again.';

/**
 * Distinct copy, because the action is different. Once Android has recorded a
 * permanent refusal the app cannot prompt again, so "try again" would be a lie:
 * the only route back is Settings.
 */
export const PICKER_PERMISSION_BLOCKED =
  'Shoogle cannot open your photos. Allow photo access for Shoogle in your phone’s Settings, then try again.';

export const PICKER_FAILED = 'Shoogle could not open your gallery.';

/* -------------------------------------------------------------------------- */
/* Mapping                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A dimension the system did not provide. The picker signals that with 0, and
 * `MediaAsset` signals it with null; 0 would be a measurement of nothing.
 */
function measuredDimension(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

const FORMAT_BY_MIME: Readonly<Record<string, MediaFormat>> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

/** Never inferred from the filename — an undisclosed type stays undisclosed. */
export function formatFromMime(mimeType: string | undefined): MediaFormat {
  if (mimeType === undefined) return 'unknown';
  const normalised = mimeType.trim().toLowerCase().split(';')[0] ?? '';
  return FORMAT_BY_MIME[normalised] ?? 'unknown';
}

/**
 * `MediaKind` has only two members, so something must be chosen even when the
 * picker could not say. A live photo has a still representation and is treated
 * as one; anything else undetermined falls to 'image', which is safe because
 * its format is 'unknown' in that case and the asset is refused anyway.
 */
export function kindFromPicked(asset: PickedAsset): MediaKind {
  if (asset.type === 'video' || asset.type === 'pairedVideo') return 'video';
  if (asset.type === 'image' || asset.type === 'livePhoto') return 'image';
  // The type was undetermined, so fall back to the MIME family. Whatever this
  // returns, `format` is 'unknown' in this branch and the asset is refused.
  return (asset.mimeType ?? '').trim().toLowerCase().startsWith('video/') ? 'video' : 'image';
}

/** Milliseconds from the picker, seconds in the domain. */
function durationSecondsOf(asset: PickedAsset, kind: MediaKind): number | null {
  if (kind !== 'video') return null;
  const ms = asset.duration;
  if (ms === undefined || ms === null || !Number.isFinite(ms) || ms < 0) return null;
  return ms / 1000;
}

/** One picked file, translated without a single invented value. */
export function toMediaAsset(asset: PickedAsset, id: string): MediaAsset {
  const kind = kindFromPicked(asset);
  return {
    id,
    kind,
    format: formatFromMime(asset.mimeType),
    uri: asset.uri,
    width: measuredDimension(asset.width),
    height: measuredDimension(asset.height),
    byteSize: asset.fileSize ?? null,
    durationSeconds: durationSecondsOf(asset, kind),
    // The owner writes alt text later, in the composer. Never auto-generated:
    // a caption Shoogle invented for someone's photo is a fabrication.
    altText: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The adapter                                                                */
/* -------------------------------------------------------------------------- */

export interface ExpoMediaSourceDeps {
  /** Defaults to the real `expo-image-picker`. */
  picker?: ExpoPickerModule;
  now?: () => Date;
  newId?: () => string;
}

export function createExpoMediaSource(deps: ExpoMediaSourceDeps = {}): MediaSource {
  const picker = deps.picker ?? expoImagePickerModule;
  const now = deps.now ?? (() => new Date());

  let counter = 0;
  const newId = deps.newId ?? (() => `media-${(counter += 1)}`);

  return {
    id: 'expo-image-picker',
    isConfigured: () => true,

    async pick(options?: PickOptions): Result<MediaAsset[]> {
      const imagesOnly = options?.imagesOnly ?? true;
      // A caller that did not say how many can have one. A picker that silently
      // allows any number when nobody asked for that is the worse default.
      const limit = Math.max(1, Math.trunc(options?.limit ?? 1));

      const permission = await picker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return unavailable(
          'not_connected',
          permission.canAskAgain ? PICKER_PERMISSION_DENIED : PICKER_PERMISSION_BLOCKED,
        );
      }

      let result: PickerResult;
      try {
        result = await picker.launchImageLibraryAsync({
          mediaTypes: imagesOnly ? ['images'] : ['images', 'videos'],
          allowsMultipleSelection: limit > 1,
          selectionLimit: limit,
          // Cropping belongs to preparation, which knows each platform's aspect
          // bounds. A crop taken here would be guesswork the owner has to redo.
          allowsEditing: false,
          // Never. A base64 copy puts the whole image in JS memory and into
          // anything that logs the asset.
          base64: false,
          // Not needed to publish, and it carries GPS. Shoogle does not collect
          // a business owner's location from their photos.
          exif: false,
          // No re-encode on the way in: 1 keeps the original bytes, and
          // recompression is a decision preparation makes per platform.
          quality: 1,
        });
      } catch {
        // The picker is a native module and can throw — a dead activity, a
        // revoked provider. An owner-facing sentence, never the raw error.
        return failed('picker_failed', PICKER_FAILED);
      }

      const at = now().toISOString();

      // Choosing nothing is a successful outcome with nothing in it, not an
      // error. The composer simply keeps whatever media it already had.
      if (result.canceled) return ready<MediaAsset[]>([], at);

      return ready<MediaAsset[]>(
        result.assets.map((asset) => toMediaAsset(asset, newId())),
        at,
      );
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The real module                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `expo-image-picker`, narrowed to the two calls this adapter makes.
 *
 * The narrowing is the point: it keeps the options this app sends explicit and
 * auditable — `base64` and `exif` are pinned off here and cannot be switched on
 * by a caller — and it lets every test drive the adapter with a plain object.
 */
export const expoImagePickerModule: ExpoPickerModule = {
  requestMediaLibraryPermissionsAsync: async () => {
    const response = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return { granted: response.granted, canAskAgain: response.canAskAgain };
  },

  launchImageLibraryAsync: async (options) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [...options.mediaTypes],
      allowsMultipleSelection: options.allowsMultipleSelection,
      selectionLimit: options.selectionLimit,
      allowsEditing: options.allowsEditing,
      base64: options.base64,
      exif: options.exif,
      quality: options.quality,
    });
    return result.canceled ? { canceled: true } : { canceled: false, assets: result.assets };
  },
};

/**
 * The adapter over the real picker.
 *
 * Registration stays the composer's call, via `setMediaSource()`, at the point
 * a screen actually needs the gallery. Nothing registers it today, so
 * `getMediaSource()` still returns the unconfigured source that reports
 * `not_connected`.
 */
export function expoMediaSource(): MediaSource {
  return createExpoMediaSource();
}
