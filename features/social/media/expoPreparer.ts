/**
 * Media preparation — the doing half. Owner: Yash.
 *
 * `prepare.ts` works out WHAT must change and refuses what cannot be fixed.
 * This file carries that plan out with `expo-image-manipulator`, and its whole
 * discipline is: never claim more than the library actually did.
 *
 * ===================== THE PLAN IS NOT OPTIONAL ==============================
 *
 * Every call starts at `planPreparation()` and stops dead if it comes back
 * `ok: false`. There is no path that resizes an image whose dimensions were
 * never measured, and none that quietly enlarges one below a platform's floor.
 * The planner's refusals ARE this preparer's refusals — one source of truth,
 * which is the same reason `validateForPlatform()` reads the same function.
 *
 * ================= WHAT IS MEASURED, AND WHAT IS NOT GUESSED =================
 *
 * `ImageResult` reports the output's `uri`, `width` and `height`, so those are
 * read back from the library rather than copied from the plan: the plan is an
 * intention, the result is a fact, and if they disagree the fact wins.
 *
 * It does NOT report a byte size, and `PreparedMedia.byteSize` is not nullable.
 * So a `measureBytes` function is a REQUIRED dependency. Shoogle does not
 * estimate the size of a file it just wrote — an estimate is exactly what would
 * let an over-ceiling image through to a platform that then rejects it.
 *
 * (The library can return the image base64-encoded, whose length would give an
 * exact size. That is rejected on purpose: it loads the whole image into JS
 * memory, and the recompression loop would do it repeatedly.)
 *
 * ========================== THE COMPRESSION LADDER ==========================
 *
 * A plan may ask for `recompress`, and JPEG quality is the only lever that
 * reliably moves bytes without changing pixels. The ladder steps down, remeasures
 * after every attempt, and REFUSES when it runs out — it never returns the
 * smallest attempt with a shrug. An image still over the ceiling is not prepared,
 * whatever effort went into it.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Result } from '@/lib/providers/types';
import { failed, ready } from '@/lib/state/DataState';

import { mediaSpecFor } from '../mediaSpecs';
import { isEnforceable } from '../platforms';
import { PLATFORM_LABEL, type MediaAsset, type MediaFormat, type Platform } from '../types';

import { planPreparation, type MediaPreparer } from './prepare';
import type { PreparationChange, PreparedMedia } from './types';

/* -------------------------------------------------------------------------- */
/* The seam                                                                   */
/* -------------------------------------------------------------------------- */

/** The formats `expo-image-manipulator` can WRITE. Narrower than `MediaFormat`. */
export type SaveableFormat = 'jpeg' | 'png' | 'webp';

export interface ManipulationRequest {
  readonly uri: string;
  /** Applied first, proportionally, per the plan. */
  readonly resize: { readonly width: number; readonly height: number } | null;
  /** Applied after any resize, so the origin is in post-resize pixels. */
  readonly crop: {
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly format: SaveableFormat;
  /** 1 is no compression; the ladder steps down from there. */
  readonly compress: number;
}

/** What the library reports back. No byte size — see the header. */
export interface ManipulatedImage {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export interface ImageManipulatorModule {
  manipulate(request: ManipulationRequest): Promise<ManipulatedImage>;
}

/**
 * Measures a local file, or returns null when it cannot.
 *
 * Required, and deliberately not defaulted: `expo-image-manipulator` does not
 * report sizes, so measuring needs a filesystem module this feature does not
 * own. A default that guessed would defeat the ceiling checks entirely.
 */
export type MeasureBytes = (uri: string) => Promise<number | null>;

/* -------------------------------------------------------------------------- */
/* Owner-facing copy                                                          */
/* -------------------------------------------------------------------------- */

export const PREPARE_MEASURE_FAILED =
  'Shoogle could not measure the photo it just prepared, so it cannot promise the platform will accept it.';

export const PREPARE_FAILED = 'Shoogle could not get this photo ready.';

/** The default ladder. Starts at no compression and gives up rather than lie. */
export const QUALITY_LADDER: readonly number[] = [1, 0.9, 0.75, 0.6, 0.45];

/* -------------------------------------------------------------------------- */
/* Format mapping                                                             */
/* -------------------------------------------------------------------------- */

const SAVEABLE: Readonly<Record<string, SaveableFormat>> = {
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
};

/**
 * The subset of `MediaFormat` this library can write.
 *
 * HEIC is readable but not writable, and video is not this library's business
 * at all. Returning null makes that a refusal rather than a silent substitution
 * — re-encoding a HEIC to JPEG when the plan did not ask for a transcode would
 * change the file behind the owner's back.
 */
export function saveableFormat(format: MediaFormat): SaveableFormat | null {
  return SAVEABLE[format] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The centred crop rectangle for a target size inside a known frame.
 *
 * Centred because `cropToRatioRange` computes the largest centred crop: the
 * subject of a shop photo is near the middle, and trimming from one edge would
 * cut a person out of their own storefront.
 */
export function centredCrop(
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): { originX: number; originY: number; width: number; height: number } {
  const width = Math.min(toWidth, fromWidth);
  const height = Math.min(toHeight, fromHeight);
  return {
    originX: Math.max(0, Math.round((fromWidth - width) / 2)),
    originY: Math.max(0, Math.round((fromHeight - height) / 2)),
    width,
    height,
  };
}

function resizeOf(changes: readonly PreparationChange[]): { width: number; height: number } | null {
  for (const change of changes) {
    if (change.kind === 'resize') return { width: change.toWidth, height: change.toHeight };
  }
  return null;
}

function cropOf(changes: readonly PreparationChange[]): { width: number; height: number } | null {
  for (const change of changes) {
    if (change.kind === 'crop') return { width: change.toWidth, height: change.toHeight };
  }
  return null;
}

function wantsRecompression(changes: readonly PreparationChange[]): boolean {
  return changes.some((change) => change.kind === 'recompress');
}

/** The platform's documented byte ceiling, or null when it does not state one. */
function byteCeiling(platform: Platform, isVideo: boolean): number | null {
  const spec = mediaSpecFor(platform);
  const limit = isVideo ? spec.video.maxBytes : spec.image.maxBytes;
  return isEnforceable(limit) ? limit.value : null;
}

/** The platform's documented minimum width, or null. */
function minimumWidth(platform: Platform): number | null {
  const limit = mediaSpecFor(platform).image.minWidth;
  return isEnforceable(limit) ? limit.value : null;
}

/* -------------------------------------------------------------------------- */
/* The preparer                                                               */
/* -------------------------------------------------------------------------- */

export interface ExpoPreparerDeps {
  manipulator: ImageManipulatorModule;
  measureBytes: MeasureBytes;
  /** Override for tests. Defaults to `QUALITY_LADDER`. */
  quality?: readonly number[];
}

export function createExpoMediaPreparer(deps: ExpoPreparerDeps): MediaPreparer {
  const { manipulator, measureBytes } = deps;
  const ladder = deps.quality ?? QUALITY_LADDER;

  /** A file's size, preferring what was already measured over measuring again. */
  async function bytesOf(uri: string, known: number | null): Promise<number | null> {
    if (known !== null) return known;
    return measureBytes(uri);
  }

  return {
    id: 'expo-image-manipulator',
    isConfigured: () => true,

    async prepare(asset: MediaAsset, platform: Platform): Result<PreparedMedia> {
      const name = PLATFORM_LABEL[platform];

      /* -- The plan governs. It is never skipped. -------------------------- */
      const plan = planPreparation(asset, platform);
      if (!plan.ok) {
        const [first] = plan.problems;
        // Not retryable: the same photo produces the same refusal, and telling
        // an owner to try again would waste their time. Picking another photo,
        // which the message asks for, is the action that works.
        return failed(first?.code ?? 'format_unsupported', first?.message ?? PREPARE_FAILED, false);
      }

      const ceiling = byteCeiling(platform, asset.kind === 'video');

      /* -- Video passes through; Shoogle does not transcode it. ------------ */
      if (asset.kind === 'video') {
        if (asset.width === null || asset.height === null) {
          // The planner tolerates unknown video dimensions because no platform
          // documents one. `PreparedMedia` does not, and writing 0 here would
          // be a measurement of nothing.
          return failed(
            'dimensions_unknown',
            `Shoogle has not measured this video, so it cannot prepare it for ${name}.`,
            false,
          );
        }
        const measured = await bytesOf(asset.uri, asset.byteSize);
        if (measured === null) return failed('size_unknown', PREPARE_MEASURE_FAILED, false);

        return ready<PreparedMedia>(
          {
            source: asset,
            uri: asset.uri,
            kind: 'video',
            format: plan.targetFormat,
            width: asset.width,
            height: asset.height,
            byteSize: measured,
            preparedFor: platform,
            changes: [],
          },
          new Date().toISOString(),
        );
      }

      /* -- Nothing to do: the original already satisfies this platform. ---- */
      if (plan.changes.length === 0) {
        const measured = await bytesOf(asset.uri, asset.byteSize);
        if (measured === null) return failed('size_unknown', PREPARE_MEASURE_FAILED, false);

        // Re-encoding a file that already fits would cost quality for nothing.
        return ready<PreparedMedia>(
          {
            source: asset,
            uri: asset.uri,
            kind: 'image',
            format: plan.targetFormat,
            width: plan.targetWidth,
            height: plan.targetHeight,
            byteSize: measured,
            preparedFor: platform,
            changes: [],
          },
          new Date().toISOString(),
        );
      }

      /* -- Work is required, so the output format must be writable. -------- */
      const format = saveableFormat(plan.targetFormat);
      if (format === null) {
        return failed(
          'format_unsupported',
          `Shoogle cannot rewrite ${plan.targetFormat.toUpperCase()} files, so it cannot get this photo ready for ${name}.`,
          false,
        );
      }

      const resize = resizeOf(plan.changes);
      const cropTo = cropOf(plan.changes);
      // The crop happens AFTER the resize, so its frame is the resized image —
      // using the original dimensions here would cut the wrong rectangle.
      const frameWidth = resize?.width ?? asset.width ?? plan.targetWidth;
      const frameHeight = resize?.height ?? asset.height ?? plan.targetHeight;
      const crop =
        cropTo === null
          ? null
          : centredCrop(frameWidth, frameHeight, cropTo.width, cropTo.height);

      // An asset the planner already knows is oversized starts one rung down;
      // there is no point writing a file at quality 1 that is known to be too
      // big. Everything else starts at no compression.
      const rungs = wantsRecompression(plan.changes) ? ladder.slice(1) : ladder;
      const attempts = rungs.length > 0 ? rungs : ladder;

      let lastMeasured: number | null = null;

      for (const compress of attempts) {
        let result: ManipulatedImage;
        try {
          result = await manipulator.manipulate({
            uri: asset.uri,
            resize,
            crop,
            format,
            compress,
          });
        } catch {
          // A native failure: out of memory on a large photo, an unreadable
          // file. Owner-facing, never the raw error.
          return failed('format_unsupported', PREPARE_FAILED, false);
        }

        const measured = await measureBytes(result.uri);
        if (measured === null) return failed('size_unknown', PREPARE_MEASURE_FAILED, false);
        lastMeasured = measured;

        if (ceiling !== null && measured > ceiling) continue;

        /*
         * THE OUTPUT IS CHECKED, NOT ASSUMED.
         *
         * The library's reported dimensions are the real ones. If rounding or a
         * platform quirk has taken the result under the platform's floor, that
         * is a refusal — the alternative is publishing something the platform
         * documents as unacceptable and finding out at publish time.
         */
        const floor = minimumWidth(platform);
        if (floor !== null && result.width < floor) {
          return failed(
            'too_small',
            `${name} needs images at least ${floor} pixels wide, and preparing this one left it ${result.width}. Pick a larger photo.`,
            false,
          );
        }

        return ready<PreparedMedia>(
          {
            source: asset,
            uri: result.uri,
            kind: 'image',
            // Read back from the library, not copied from the plan.
            width: result.width,
            height: result.height,
            byteSize: measured,
            format: plan.targetFormat,
            preparedFor: platform,
            changes: plan.changes,
          },
          new Date().toISOString(),
        );
      }

      /*
       * The ladder ran out with the file still over the ceiling. The planner
       * deferred this decision here precisely because only a real measurement
       * can make it, and the answer is a refusal — never the smallest attempt
       * handed over with a warning.
       */
      const over = lastMeasured === null ? '' : ` The smallest Shoogle could make it is ${Math.round(lastMeasured / (1024 * 1024))} MB.`;
      return failed(
        'too_large',
        `This photo is too large for ${name} even after compressing it.${over} Pick a smaller one.`,
        false,
      );
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The real module                                                            */
/* -------------------------------------------------------------------------- */

const SAVE_FORMAT: Readonly<Record<SaveableFormat, SaveFormat>> = {
  jpeg: SaveFormat.JPEG,
  png: SaveFormat.PNG,
  webp: SaveFormat.WEBP,
};

/**
 * `expo-image-manipulator`, narrowed to the one operation this preparer needs.
 *
 * Resize before crop, matching the order `planPreparation` returns changes in.
 * `base64` is pinned off: it would put the whole image in JS memory on every
 * rung of the compression ladder.
 */
export const expoImageManipulatorModule: ImageManipulatorModule = {
  manipulate: async (request) => {
    let context = ImageManipulator.manipulate(request.uri);
    if (request.resize !== null) context = context.resize(request.resize);
    if (request.crop !== null) context = context.crop(request.crop);

    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SAVE_FORMAT[request.format],
      compress: request.compress,
      base64: false,
    });

    return { uri: saved.uri, width: saved.width, height: saved.height };
  },
};

/**
 * The preparer over the real library.
 *
 * `measureBytes` stays the caller's to supply: this feature does not own a
 * filesystem dependency, and nothing registers a preparer today, so
 * `getMediaPreparer()` still returns the unconfigured one.
 */
export function expoMediaPreparer(measureBytes: MeasureBytes): MediaPreparer {
  return createExpoMediaPreparer({ manipulator: expoImageManipulatorModule, measureBytes });
}
