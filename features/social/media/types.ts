/**
 * Media types, and the boundary that matters. Owner: Yash.
 *
 * ============ A LOCAL FILE IS NOT A PUBLISHABLE URL, AND CANNOT BE ==========
 *
 * Meta cURLs Instagram media from a publicly reachable URL and offers no binary
 * upload path for images (docs/research/meta-instagram.md §3). Google fetches a
 * local post's media from `sourceUrl` the same way. So a `file://` or
 * `content://` URI from the phone's picker is NOT something either platform can
 * publish — it is bytes on one device that no server can reach.
 *
 * That is easy to state and easy to forget three files later, at which point
 * the failure is a publish attempt that 400s with a confusing message, or worse
 * a stored post that looks scheduled and never goes out.
 *
 * So the distinction is a TYPE, not a convention:
 *
 *   MediaAsset        bytes on the device. Has a `uri`. Cannot be published.
 *   PreparedMedia     transcoded/resized for one platform. Still on the device.
 *   PublishableMedia  a public https URL a platform can fetch. Branded, and
 *                     mintable only by `mintPublishableMedia`, which refuses
 *                     anything that is not https.
 *
 * `PlatformPublisher` accepts `PublishableMedia` and nothing else, so handing a
 * publisher a local asset does not compile. There is a `@ts-expect-error` test
 * asserting exactly that, which fails the build if the boundary is ever
 * loosened.
 */

import type { MediaAsset, MediaFormat, MediaKind, Platform } from '../types';

/* -------------------------------------------------------------------------- */
/* Problems                                                                   */
/* -------------------------------------------------------------------------- */

export type MediaProblemCode =
  /** The picker did not tell us the pixel dimensions. */
  | 'dimensions_unknown'
  /** The picker did not tell us the byte size. */
  | 'size_unknown'
  /** Shoogle could not identify the container format. */
  | 'format_unknown'
  /** Too few pixels. Upscaling would invent detail that is not there. */
  | 'too_small'
  /** The platform does not accept this container format and it cannot be converted. */
  | 'format_unsupported'
  /** Over the platform's byte ceiling and not recoverable by recompression. */
  | 'too_large'
  /** Video outside the platform's documented length bounds. */
  | 'duration_out_of_range';

export interface MediaProblem {
  readonly code: MediaProblemCode;
  /** Owner-facing sentence. Names the platform where that helps. */
  readonly message: string;
  /** The platform this problem belongs to. Never another platform's. */
  readonly platform: Platform;
}

/* -------------------------------------------------------------------------- */
/* Preparation                                                                */
/* -------------------------------------------------------------------------- */

/** What a preparer must actually do to an asset. */
export type PreparationChange =
  | { readonly kind: 'transcode'; readonly to: MediaFormat }
  | { readonly kind: 'resize'; readonly toWidth: number; readonly toHeight: number }
  | { readonly kind: 'crop'; readonly toWidth: number; readonly toHeight: number }
  | { readonly kind: 'recompress'; readonly targetBytes: number };

/**
 * The work needed to make one asset satisfy one platform, or why it cannot be.
 *
 * Pure and separate from doing it, so the arithmetic — which is where the bugs
 * live — is testable without a native image library, and so the composer can
 * tell an owner "this will be cropped" before anything is touched.
 */
export type PreparationPlan =
  | {
      readonly ok: true;
      readonly platform: Platform;
      /** Empty when the asset already satisfies the platform. */
      readonly changes: readonly PreparationChange[];
      readonly targetFormat: MediaFormat;
      readonly targetWidth: number;
      readonly targetHeight: number;
    }
  | { readonly ok: false; readonly platform: Platform; readonly problems: readonly MediaProblem[] };

/**
 * An artifact that satisfies one platform's spec — still a local file.
 *
 * Being prepared is NOT being publishable. These bytes are still on the phone;
 * only a `MediaHost` can turn them into something Meta or Google can fetch.
 */
export interface PreparedMedia {
  /** The asset this came from, unmodified. */
  readonly source: MediaAsset;
  /** Local URI of the prepared artifact. Still not publishable. */
  readonly uri: string;
  readonly kind: MediaKind;
  readonly format: MediaFormat;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  /** The platform whose spec this satisfies. Preparation is per platform. */
  readonly preparedFor: Platform;
  readonly changes: readonly PreparationChange[];
}

/* -------------------------------------------------------------------------- */
/* Publishable media — the branded end of the pipeline                        */
/* -------------------------------------------------------------------------- */

/**
 * The brand.
 *
 * `declare const` with a `unique symbol` type is a TYPE-LEVEL marker with no
 * runtime value at all. No code outside this file can name the property, so no
 * code outside this file can write an object literal that satisfies
 * `PublishableMedia` — that is what makes the boundary structural rather than a
 * naming convention.
 *
 * Because it does not exist at runtime, the brand is never assigned; it is
 * applied by a cast inside `mintPublishableMedia`, which is the single control
 * point. (Assigning it was the first attempt and threw
 * `ReferenceError: PUBLISHABLE is not defined` — a `declare const` is a promise
 * to the type checker, not a value.)
 */
declare const PUBLISHABLE: unique symbol;

/**
 * Media a platform can actually fetch.
 *
 * Only `mintPublishableMedia` produces one, and it refuses any URL that is not
 * https — so "we uploaded it" cannot be claimed about a file that is still on
 * the device, even by a buggy host implementation.
 */
export interface PublishableMedia {
  readonly [PUBLISHABLE]: true;
  readonly kind: MediaKind;
  /** Publicly fetchable https URL. Never file://, content:// or data:. */
  readonly url: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationSeconds: number | null;
  /** The platform whose spec the hosted artifact satisfies. */
  readonly preparedFor: Platform;
  /** Opaque handle for `MediaHost.revoke`. */
  readonly handle: string;
  readonly hostedAt: string;
}

export interface MintPublishableInput {
  kind: MediaKind;
  url: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  preparedFor: Platform;
  handle: string;
  hostedAt: string;
}

/**
 * The ONLY way to make a `PublishableMedia`.
 *
 * Called by a `MediaHost` implementation after a real upload. It validates the
 * one thing that cannot be allowed to slip — that the URL is genuinely
 * fetchable by someone else's servers — and returns null otherwise.
 *
 * `http://` is rejected alongside `file://`: Meta fetches over TLS, and a
 * plaintext URL that happens to work today is not a thing to encode.
 */
export function mintPublishableMedia(input: MintPublishableInput): PublishableMedia | null {
  if (!/^https:\/\/[^\s]+$/i.test(input.url.trim())) return null;
  if (input.byteSize <= 0) return null;
  if (input.handle.trim() === '') return null;

  /*
   * The one cast in the pipeline, and the reason this function exists.
   *
   * The brand is a phantom: it has no runtime representation, so it cannot be
   * assigned, only asserted. Confining that assertion here means every
   * `PublishableMedia` in the app has passed the https check above — a cast
   * anywhere else would not compile, because no other module can name the
   * branded property.
   */
  return {
    kind: input.kind,
    url: input.url.trim(),
    contentType: input.contentType,
    byteSize: input.byteSize,
    width: input.width,
    height: input.height,
    durationSeconds: input.durationSeconds,
    preparedFor: input.preparedFor,
    handle: input.handle,
    hostedAt: input.hostedAt,
  } as PublishableMedia;
}

/** True for a URI that is on this device and therefore not publishable. */
export function isLocalUri(uri: string): boolean {
  return /^(file|content|asset|ph|data):/i.test(uri.trim());
}
