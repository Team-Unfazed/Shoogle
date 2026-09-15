/**
 * Picking and measuring media. Owner: Yash.
 *
 * ===================== WHY MEASURING IS ITS OWN STEP ========================
 *
 * `MediaAsset` has nullable `width`, `height`, `byteSize` and `durationSeconds`,
 * and `format: 'unknown'` is a real member. That is not defensive typing — an
 * Android `content://` URI genuinely does not always disclose its type, and a
 * picker does not always report dimensions.
 *
 * Every one of those nulls means "nobody has measured this", and the planner
 * treats them as REFUSALS rather than passes. So probing is the step that turns
 * an unusable asset into a usable one, and it is separate from picking because
 * a picker that reports dimensions (most do) makes it free, while one that does
 * not needs a real read.
 *
 * ========================== NEITHER IS IMPLEMENTED ==========================
 *
 * `MediaSource` needs `expo-image-picker`. Until one is installed the
 * unconfigured source reports `not_connected` and the composer says the picker
 * is not built — the same posture `features/gbp/components/media/AddMediaSheet`
 * takes for Google photos, and for the same reason.
 */

import type { Result } from '@/lib/providers/types';
import { unavailable } from '@/lib/state/DataState';

import type { MediaAsset } from '../types';

/* -------------------------------------------------------------------------- */
/* Picking                                                                    */
/* -------------------------------------------------------------------------- */

export interface PickOptions {
  /** How many assets the caller can accept. Instagram carousels take 10. */
  readonly limit?: number;
  /** Restrict to stills. Videos need a separate pipeline Shoogle lacks. */
  readonly imagesOnly?: boolean;
}

export interface MediaSource {
  readonly id: string;
  isConfigured(): boolean;
  /**
   * Ask the owner for files.
   *
   * Returns assets with whatever the picker reported — which may include nulls
   * and `format: 'unknown'`. It is NOT this method's job to guess the missing
   * parts; that is what probing is for, and an unmeasured asset is refused
   * downstream rather than assumed fine.
   */
  pick(options?: PickOptions): Result<MediaAsset[]>;
}

export const MEDIA_SOURCE_NOT_CONFIGURED =
  'Choosing a photo is not built yet. Shoogle cannot open your gallery.';

export const unconfiguredMediaSource: MediaSource = {
  id: 'unconfigured',
  isConfigured: () => false,
  pick: () => Promise.resolve(unavailable('not_connected', MEDIA_SOURCE_NOT_CONFIGURED)),
};

let activeSource: MediaSource | null = null;

export function setMediaSource(source: MediaSource | null): void {
  activeSource = source;
}

export function getMediaSource(): MediaSource {
  return activeSource ?? unconfiguredMediaSource;
}

/* -------------------------------------------------------------------------- */
/* Measuring                                                                  */
/* -------------------------------------------------------------------------- */

/** True when every field the planner needs has actually been measured. */
export function isMeasured(asset: MediaAsset): boolean {
  if (asset.format === 'unknown') return false;
  if (asset.byteSize === null) return false;
  if (asset.kind === 'video') return asset.durationSeconds !== null;
  return asset.width !== null && asset.height !== null;
}

/** What is still unknown about an asset, for an owner-facing explanation. */
export function unmeasuredFields(asset: MediaAsset): string[] {
  const missing: string[] = [];
  if (asset.format === 'unknown') missing.push('file type');
  if (asset.width === null || asset.height === null) missing.push('size in pixels');
  if (asset.byteSize === null) missing.push('file size');
  if (asset.kind === 'video' && asset.durationSeconds === null) missing.push('length');
  return missing;
}
