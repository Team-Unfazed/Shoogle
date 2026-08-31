/**
 * The Google review link, and why Shoogle usually cannot produce one yet.
 *
 * THE HONEST PROBLEM THIS FILE SOLVES
 * -----------------------------------
 * Google's review form is addressed by PLACE ID:
 *
 *     https://search.google.com/local/writereview?placeid=<PLACE_ID>
 *
 * The place id lives on the listing, in `Location.metadata.placeId`, which
 * comes back from `locations.get` on the Business Information API. Shoogle has
 * no Google credentials today, so it has no place id, so it CANNOT construct
 * this link. Every competitor product that shows the owner "your review link"
 * on day one has already connected the profile; we have not.
 *
 * The two dishonest options were: invent a plausible-looking link, or render an
 * empty box that says "coming soon". Both are worse than the third: say plainly
 * where the link comes from, why we do not have it, and let the owner paste the
 * one their own Google dashboard already gives them. That path works today,
 * with no integration, which for an Indian salon owner is the difference
 * between a feature and a promise.
 *
 * WHY PASTED LINKS ARE VALIDATED HARD
 * -----------------------------------
 * Whatever is pasted here ends up printed on a QR at a counter and sent to
 * customers over WhatsApp. A typo'd or wrong link is not a cosmetic bug: it
 * sends the shop's customers somewhere the owner did not choose, on a piece of
 * paper that will sit there for months. So only Google's documented review
 * shapes are accepted, and the one shape whose destination Shoogle genuinely
 * cannot verify is accepted with that stated on screen.
 */

/** The documented write-a-review deep link. Everything else is a redirect to it. */
export const GOOGLE_WRITE_REVIEW_PREFIX = 'https://search.google.com/local/writereview?placeid=';

export type ReviewLinkKind =
  /** `search.google.com/local/writereview?placeid=…` — opens the review form. */
  | 'write_review'
  /** `g.page/r/<id>/review` — Google's own short form of the same thing. */
  | 'g_page_review'
  /** `maps.app.goo.gl/<code>` — a Maps short link. Destination unknown to us. */
  | 'maps_short_link';

export type ReviewLinkSource = 'derived_from_place_id' | 'pasted_by_owner';

export interface ReviewLink {
  readonly url: string;
  readonly kind: ReviewLinkKind;
  readonly source: ReviewLinkSource;
  /**
   * True only when the URL shape itself guarantees the review form opens.
   *
   * A Maps short link is a redirect Shoogle would have to FOLLOW to know where
   * it goes, and following it means a network request we do not make. So this
   * is false there, and the screen says so rather than implying certainty.
   */
  readonly opensReviewFormForSure: boolean;
}

export type ReviewLinkRejection =
  | 'empty'
  | 'not_a_url'
  | 'not_google'
  | 'google_but_not_a_review_link'
  | 'missing_place_id';

export type ReviewLinkParse =
  | { readonly ok: true; readonly link: ReviewLink }
  | { readonly ok: false; readonly reason: ReviewLinkRejection; readonly message: string };

const REJECTION_MESSAGE: Readonly<Record<ReviewLinkRejection, string>> = Object.freeze({
  empty: 'Paste the review link from your Google Business Profile.',
  not_a_url: 'That does not look like a web address. Paste the whole link, starting with https://.',
  not_google:
    'That is not a Google link. Your review link is on google.com, g.page or maps.app.goo.gl — anything else would send your customers somewhere you did not choose.',
  google_but_not_a_review_link:
    'That is a Google link, but not the review link. In your Google Business Profile, use "Ask for reviews" and copy the link it gives you.',
  missing_place_id:
    'This link is missing the place id after "placeid=", so it will not open your review form.',
});

/** Only characters that can legitimately appear in the identifier segments. */
const ID_SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * Build the review link for a place id.
 *
 * The place id is not something Shoogle can guess, invent or derive from a
 * business name — it only ever arrives from a connected profile.
 */
export function reviewLinkForPlaceId(placeId: string): ReviewLink | null {
  const trimmed = placeId.trim();
  if (trimmed.length === 0) return null;
  return {
    url: `${GOOGLE_WRITE_REVIEW_PREFIX}${encodeURIComponent(trimmed)}`,
    kind: 'write_review',
    source: 'derived_from_place_id',
    opensReviewFormForSure: true,
  };
}

interface SplitUrl {
  host: string;
  path: string;
  query: string;
}

function splitUrl(raw: string): SplitUrl | null {
  let rest = raw.trim();

  // Reject anything that carries a scheme we would not open. `whatsapp:` and
  // `javascript:` are not typos, they are a different destination entirely.
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
  if (schemeMatch) {
    const scheme = (schemeMatch[1] ?? '').toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return null;
    rest = rest.slice(schemeMatch[0].length);
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(rest)) {
    return null;
  }

  if (rest.length === 0) return null;

  const hashIndex = rest.indexOf('#');
  if (hashIndex >= 0) rest = rest.slice(0, hashIndex);

  const queryIndex = rest.indexOf('?');
  const query = queryIndex >= 0 ? rest.slice(queryIndex + 1) : '';
  const beforeQuery = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;

  const slashIndex = beforeQuery.indexOf('/');
  const host = (slashIndex >= 0 ? beforeQuery.slice(0, slashIndex) : beforeQuery).toLowerCase();
  const path = slashIndex >= 0 ? beforeQuery.slice(slashIndex) : '';

  if (host.length === 0 || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.')) return null;

  return { host, path, query };
}

function readQueryParam(query: string, name: string): string | null {
  for (const pair of query.split('&')) {
    const equals = pair.indexOf('=');
    if (equals < 0) continue;
    if (pair.slice(0, equals).toLowerCase() !== name) continue;
    const value = pair.slice(equals + 1);
    if (value.length === 0) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      // A malformed escape is not a place id.
      return null;
    }
  }
  return null;
}

function isGoogleHost(host: string): boolean {
  return (
    host === 'g.page' ||
    host === 'maps.app.goo.gl' ||
    host === 'goo.gl' ||
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host === 'google.co.in' ||
    host.endsWith('.google.co.in')
  );
}

/**
 * Validate a link the owner pasted.
 *
 * Returns the normalised `https://` form on success. On failure it names which
 * of the five things went wrong, because "invalid link" tells an owner nothing
 * about what to do next.
 */
export function parsePastedReviewLink(raw: string): ReviewLinkParse {
  if (raw.trim().length === 0) {
    return { ok: false, reason: 'empty', message: REJECTION_MESSAGE.empty };
  }

  const parts = splitUrl(raw);
  if (parts === null) {
    return { ok: false, reason: 'not_a_url', message: REJECTION_MESSAGE.not_a_url };
  }

  const { host, path, query } = parts;

  if (!isGoogleHost(host)) {
    return { ok: false, reason: 'not_google', message: REJECTION_MESSAGE.not_google };
  }

  const rebuild = (): string =>
    `https://${host}${path}${query.length > 0 ? `?${query}` : ''}`;

  if (host === 'search.google.com' && /^\/local\/writereview\/?$/.test(path)) {
    const placeId = readQueryParam(query, 'placeid');
    if (placeId === null) {
      return {
        ok: false,
        reason: 'missing_place_id',
        message: REJECTION_MESSAGE.missing_place_id,
      };
    }
    return {
      ok: true,
      link: {
        url: `${GOOGLE_WRITE_REVIEW_PREFIX}${encodeURIComponent(placeId)}`,
        kind: 'write_review',
        source: 'pasted_by_owner',
        opensReviewFormForSure: true,
      },
    };
  }

  if (host === 'g.page') {
    const match = /^\/r\/([^/]+)\/review\/?$/.exec(path);
    if (match && ID_SEGMENT.test(match[1] ?? '')) {
      return {
        ok: true,
        link: {
          url: rebuild(),
          kind: 'g_page_review',
          source: 'pasted_by_owner',
          opensReviewFormForSure: true,
        },
      };
    }
    return {
      ok: false,
      reason: 'google_but_not_a_review_link',
      message: REJECTION_MESSAGE.google_but_not_a_review_link,
    };
  }

  if (host === 'maps.app.goo.gl') {
    const code = path.replace(/^\//, '').replace(/\/$/, '');
    if (ID_SEGMENT.test(code)) {
      return {
        ok: true,
        link: {
          url: rebuild(),
          kind: 'maps_short_link',
          source: 'pasted_by_owner',
          // Shoogle would have to follow the redirect to know. It does not.
          opensReviewFormForSure: false,
        },
      };
    }
  }

  return {
    ok: false,
    reason: 'google_but_not_a_review_link',
    message: REJECTION_MESSAGE.google_but_not_a_review_link,
  };
}

/** One sentence describing what a link is, for the card and for TalkBack. */
export function describeReviewLink(link: ReviewLink): string {
  switch (link.kind) {
    case 'write_review':
      return link.source === 'derived_from_place_id'
        ? 'Built from your Google place id. It opens Google’s review form directly.'
        : 'This is Google’s review form link. It opens the review box directly.';
    case 'g_page_review':
      return 'This is Google’s short review link. It opens the review box directly.';
    case 'maps_short_link':
      return 'This is a Google Maps short link. Shoogle cannot see where it redirects without opening it — open it once yourself and check it lands on the review box.';
  }
}
