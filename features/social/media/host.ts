/**
 * MediaHost — the seam that turns device bytes into a URL a platform can fetch.
 * Owner: Yash. **Implementation owner: Sunny (server-side).**
 *
 * ========================= WHY THIS EXISTS AT ALL ===========================
 *
 * Neither platform Shoogle publishes images to will accept an upload from the
 * phone:
 *
 *   Instagram  "We cURL media used in publishing attempts, so the media must be
 *              hosted on a publicly accessible server at the time of the
 *              attempt." There is NO binary path for images.
 *   GBP        `sourceUrl` is the only supported media field on a local post.
 *
 * (Facebook is the exception — it takes a `multipart/form-data` upload — but it
 * also takes a URL, and one path is better than two.)
 *
 * So between "the owner picked a photo" and "a platform published it" there has
 * to be a server. This interface is that server's shape, declared here so the
 * publisher, the composer and the tests can all be written against it before it
 * exists.
 *
 * ========================== IT IS NOT IMPLEMENTED ===========================
 *
 * `unconfiguredMediaHost` performs no I/O and reports `not_connected`. That is
 * the literal truth: there is no bucket, no upload endpoint and no Supabase
 * project. A stub that returned a fake URL would be the dishonest version —
 * the post would look ready and fail at publish time, or worse, publish nothing
 * while claiming success.
 *
 * See `docs/proposals/media-hosting.md` for what an implementation must
 * guarantee.
 */

import type { Result } from '@/lib/providers/types';
import { ready, unavailable } from '@/lib/state/DataState';

import type { Platform } from '../types';

import type { PreparedMedia, PublishableMedia } from './types';

/* -------------------------------------------------------------------------- */
/* The contract                                                               */
/* -------------------------------------------------------------------------- */

export interface MediaHost {
  readonly id: string;
  /** Owner-facing name, for "hosted by …" where provenance matters. */
  readonly displayName: string;
  /**
   * False until a real bucket and upload endpoint exist. The composer shows
   * "not ready to publish" rather than offering a control that cannot work.
   */
  isConfigured(): boolean;

  /**
   * Upload one PREPARED artifact and return a publicly fetchable URL.
   *
   * Takes `PreparedMedia`, not `MediaAsset`: a host must never be handed a raw
   * file and left to guess what the platform wants. Preparation has already
   * settled format, dimensions and size against that platform's spec, so the
   * host's only job is to put bytes somewhere and hand back a URL.
   *
   * Must resolve `ready` ONLY with a real https URL. `mintPublishableMedia`
   * refuses anything else, so an implementation cannot return a `file://` even
   * by mistake.
   */
  publish(prepared: PreparedMedia): Result<PublishableMedia>;

  /**
   * Remove hosted media.
   *
   * Needed because hosting happens BEFORE publishing: a post the owner
   * abandons, or one whose publish fails, leaves bytes on a server that nobody
   * will ever look at. Without this the bucket grows forever and a customer's
   * photos outlive the post they were for, which is a privacy problem as much
   * as a billing one.
   */
  revoke(handle: string): Result<void>;
}

/* -------------------------------------------------------------------------- */
/* The honest default                                                         */
/* -------------------------------------------------------------------------- */

export const MEDIA_HOST_NOT_CONFIGURED =
  'Shoogle has nowhere to put this photo yet. Instagram and Google fetch pictures from a web ' +
  'address, and Shoogle has no server to host one — so this post cannot go out, however it looks ' +
  'on screen.';

/**
 * What the app has today.
 *
 * Performs no I/O, uploads nothing, and never returns a URL. Every method
 * reports `not_connected`, which is exactly true.
 */
export const unconfiguredMediaHost: MediaHost = {
  id: 'unconfigured',
  displayName: 'No media hosting',
  isConfigured: () => false,
  publish: () => Promise.resolve(unavailable('not_connected', MEDIA_HOST_NOT_CONFIGURED)),
  revoke: () => Promise.resolve(unavailable('not_connected', MEDIA_HOST_NOT_CONFIGURED)),
};

let activeHost: MediaHost | null = null;

/**
 * Install the real host. Called once, the day a server-side upload endpoint
 * exists — and not before, for the same reason `registerProvider` waits for a
 * real OAuth flow.
 */
export function setMediaHost(host: MediaHost | null): void {
  activeHost = host;
}

export function getMediaHost(): MediaHost {
  return activeHost ?? unconfiguredMediaHost;
}

export function isMediaHostingAvailable(): boolean {
  return getMediaHost().isConfigured();
}

/* -------------------------------------------------------------------------- */
/* Hosting a whole post, per platform                                         */
/* -------------------------------------------------------------------------- */

export interface HostedForPlatform {
  readonly platform: Platform;
  readonly media: readonly PublishableMedia[];
}

/**
 * Host every prepared asset for ONE platform.
 *
 * One platform per call, deliberately. Hosting Instagram's JPEGs and Facebook's
 * PNGs in a single batch would mean one upload failure taking down a target
 * that had nothing to do with it — the coupling product rule 13 forbids, in the
 * one place where a network error makes it most tempting.
 *
 * Returns the first failure rather than a partial list: a carousel missing its
 * third slide is not a carousel, and publishing two of three images would be a
 * different post from the one the owner approved.
 */
export async function hostForPlatform(
  host: MediaHost,
  platform: Platform,
  prepared: readonly PreparedMedia[],
): Result<HostedForPlatform> {
  const hosted: PublishableMedia[] = [];

  for (const artifact of prepared) {
    if (artifact.preparedFor !== platform) {
      // A Facebook-prepared PNG must never be uploaded as Instagram's media.
      // Preparation is per platform and so is hosting.
      return unavailable(
        'not_supported',
        `This photo was prepared for a different platform, so Shoogle will not send it to ${platform}.`,
      );
    }

    const result = await host.publish(artifact);
    if (result.status !== 'ready') return result;
    hosted.push(result.value);
  }

  return ready<HostedForPlatform>(
    { platform, media: hosted },
    new Date().toISOString(),
  );
}
