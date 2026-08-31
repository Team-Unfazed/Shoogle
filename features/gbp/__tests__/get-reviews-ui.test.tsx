import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Share, StyleSheet } from 'react-native';

import GetReviewsScreen from '@/app/seo/get-reviews';
import { ToastProvider } from '@/components/ui';
import { ThemeProvider } from '@/theme';
import { control } from '@/theme/tokens';

import {
  copyToClipboard,
  formatNationalMobile,
  openWhatsApp,
  parseIndianMobile,
  parsePastedReviewLink,
  reviewLinkForPlaceId,
  reviewRequestMessage,
  whatsAppUrl,
  type LinkingLike,
} from '../components/getReviews';
import {
  blockSpecFor,
  buildCodewords,
  characterCountBitsFor,
  darkRects,
  dataCodewordsFor,
  encodeQr,
  errorCorrectionCodewords,
  functionModuleMask,
  gfExp,
  gfMultiply,
  QR_MAX_BYTES,
  TOTAL_CODEWORDS,
  utf8Bytes,
  type QrMatrix,
} from '../components/getReviews/qr';
import {
  loadRequestLog,
  parseRequestLog,
  recordConfirmedRequest,
  startOfWeek,
  summarise,
  type AsyncStorageLike,
  type ReviewRequestEntry,
} from '../components/getReviews/requestLog';

/**
 * THE REVIEW-REQUEST GENERATOR.
 *
 * Two halves. The first is the machinery an owner never sees but which decides
 * whether the feature works at all — the QR encoder, the link validator, the
 * weekly log. The second is what is actually on screen, and every case in it is
 * a specific lie the screen must not tell:
 *
 *  1. There is NO review link until a place id exists. A screen that renders a
 *     plausible URL sends a shop's customers to nothing, on a QR that will sit
 *     on a counter for months.
 *  2. "Requests sent" and "new reviews" are never joined. Google publishes no
 *     attribution, so a single progress bar toward a review goal — Grexa's — is
 *     an invented causal claim.
 *  3. Opening WhatsApp is not sending. Nothing is counted until the owner says
 *     it went, and the unconfirmed request is visible while it waits.
 *  4. Zero requests is a MEASURED zero and renders `0`. An unknown review count
 *     renders `—`. Those two must never look the same.
 *  5. Nothing on this screen is a search rank. Google publishes none.
 */

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

let mockFixtures = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    ...actual,
    isFixtureModeEnabled: () => mockFixtures,
    isDevPreviewEnabled: () => false,
  };
});

/**
 * `expo-linking` is spied on, on the object the SCREEN actually holds.
 *
 * Two things conspire here and both are silent. `expo-router/testing-library`
 * registers its own `jest.mock('expo-linking')` the moment it is imported, so a
 * module mock declared in this file is replaced and every WhatsApp assertion
 * would quietly run against the real module. And Babel's `import * as`
 * interop COPIES a namespace, so spying on an imported namespace patches a copy
 * nobody calls. `requireMock` returns the exact object the screen's
 * `openURL` / `canOpenURL` bindings resolve against, which is the only handle
 * that works.
 */
const linkingModule: typeof import('expo-linking') = jest.requireMock('expo-linking');
const mockOpenURL = jest.spyOn(linkingModule, 'openURL');
const mockCanOpenURL = jest.spyOn(linkingModule, 'canOpenURL');

const mockSetString = jest.fn<void, [string]>();
jest.mock('react-native/Libraries/Components/Clipboard/Clipboard', () => ({
  __esModule: true,
  default: {
    setString: (value: string) => mockSetString(value),
    getString: async () => '',
  },
}));

/* -------------------------------------------------------------------------- */
/* Fakes                                                                      */
/* -------------------------------------------------------------------------- */

function memoryStorage(initial: Record<string, string> = {}): AsyncStorageLike & {
  values: Record<string, string>;
} {
  const values: Record<string, string> = { ...initial };
  return {
    values,
    async getItem(key) {
      return values[key] ?? null;
    },
    async setItem(key, value) {
      values[key] = value;
    },
  };
}

/**
 * Every screen test starts from an empty phone.
 *
 * The request log is real local storage, so without this a request confirmed in
 * one test would still be counted in the next — and a test that asserts "the
 * count did not move" would pass or fail depending on what ran before it.
 */
async function resetHarness(): Promise<void> {
  mockOpenURL.mockReset().mockResolvedValue(true);
  mockCanOpenURL.mockReset().mockResolvedValue(true);
  mockSetString.mockReset();
  await AsyncStorage.clear();
}

function fakeLinking(overrides: Partial<LinkingLike> = {}): LinkingLike {
  return {
    openURL: async () => true,
    canOpenURL: async () => true,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* 1. The QR encoder                                                          */
/* -------------------------------------------------------------------------- */

const REVIEW_URL = 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4';

function matrixOf(text: string): QrMatrix {
  const result = encodeQr(text);
  if (!result.ok) throw new Error(`expected an encodable string, got ${result.reason}`);
  return result.matrix;
}

/** Evaluate a codeword polynomial (highest term first) at `alpha^power`. */
function evaluateAt(codeword: readonly number[], power: number): number {
  const x = gfExp(power);
  let accumulator = 0;
  for (const coefficient of codeword) {
    accumulator = gfMultiply(accumulator, x) ^ coefficient;
  }
  return accumulator;
}

describe('QR encoder — tables', () => {
  it('every version table agrees with the independent total-codeword table', () => {
    for (let version = 1; version <= TOTAL_CODEWORDS.length; version += 1) {
      const spec = blockSpecFor(version);
      const total =
        spec.shortBlocks * (spec.shortDataCodewords + spec.ecPerBlock) +
        spec.longBlocks * (spec.longDataCodewords + spec.ecPerBlock);
      expect(total).toBe(TOTAL_CODEWORDS[version - 1]);
      expect(dataCodewordsFor(version)).toBe(total - (spec.shortBlocks + spec.longBlocks) * spec.ecPerBlock);
    }
  });

  it('encodes UTF-8 rather than assuming ASCII', () => {
    expect(utf8Bytes('a')).toEqual([0x61]);
    expect(utf8Bytes('नम')).toHaveLength(6);
    expect(utf8Bytes('😀')).toHaveLength(4);
  });
});

describe('QR encoder — Reed-Solomon', () => {
  /**
   * The property that makes error correction work: a data block followed by its
   * error-correction codewords is divisible by the generator polynomial, so it
   * evaluates to zero at every root. This checks the arithmetic without
   * reference to anything else in the file.
   */
  it('produces codewords with zero syndromes at every root', () => {
    for (let version = 1; version <= 10; version += 1) {
      const spec = blockSpecFor(version);
      const data = Array.from({ length: spec.shortDataCodewords }, (_, i) => (i * 37 + 11) % 256);
      const ec = errorCorrectionCodewords(data, spec.ecPerBlock);
      expect(ec).toHaveLength(spec.ecPerBlock);

      const full = [...data, ...ec];
      for (let root = 0; root < spec.ecPerBlock; root += 1) {
        expect(evaluateAt(full, root)).toBe(0);
      }
    }
  });

  it('splits a multi-block version into the documented block sizes', () => {
    const version = 10;
    const spec = blockSpecFor(version);
    const data = Array.from({ length: dataCodewordsFor(version) }, (_, i) => i % 256);
    const { blocks, interleaved } = buildCodewords(version, data);

    expect(blocks).toHaveLength(spec.shortBlocks + spec.longBlocks);
    expect(interleaved).toHaveLength(TOTAL_CODEWORDS[version - 1] ?? -1);
  });
});

describe('QR encoder — structure', () => {
  it('picks the smallest version that fits and lays out the finder patterns', () => {
    const matrix = matrixOf(REVIEW_URL);
    expect(matrix.size).toBe(matrix.version * 4 + 17);

    // A finder is a 7x7 ring: dark border, light ring, 3x3 dark core.
    const finderAt = (top: number, left: number) => {
      for (let dy = 0; dy < 7; dy += 1) {
        for (let dx = 0; dx < 7; dx += 1) {
          const ring = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
          const expected = ring !== 2;
          expect(matrix.modules[top + dy]?.[left + dx]).toBe(expected);
        }
      }
    };
    finderAt(0, 0);
    finderAt(0, matrix.size - 7);
    finderAt(matrix.size - 7, 0);
  });

  it('always sets the module the specification requires to be dark', () => {
    const matrix = matrixOf(REVIEW_URL);
    expect(matrix.modules[matrix.size - 8]?.[8]).toBe(true);
  });

  it('is deterministic, so the printed code and the screen code are one code', () => {
    expect(matrixOf(REVIEW_URL)).toEqual(matrixOf(REVIEW_URL));
  });

  it('refuses an empty string and an over-long one instead of drawing nonsense', () => {
    const empty = encodeQr('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('empty');

    const long = encodeQr('x'.repeat(QR_MAX_BYTES + 1));
    expect(long.ok).toBe(false);
    if (!long.ok) {
      expect(long.reason).toBe('too_long');
      expect(long.message).toContain(String(QR_MAX_BYTES));
    }

    // The boundary itself still encodes.
    expect(encodeQr('x'.repeat(QR_MAX_BYTES)).ok).toBe(true);
  });
});

describe('QR encoder — round trip', () => {
  /**
   * Read the matrix back and recover the original URL.
   *
   * This walks the same zig-zag the writer uses, tries every mask, de-interleaves
   * using the block table and parses the byte-mode header. If the bit stream,
   * the padding, the interleaving or the masking were wrong, no mask would
   * yield the original string.
   */
  function decode(matrix: QrMatrix): string | null {
    const isFunction = functionModuleMask(matrix.version);
    const spec = blockSpecFor(matrix.version);
    const size = matrix.size;

    for (let mask = 0; mask < 8; mask += 1) {
      const bits: boolean[] = [];
      for (let right = size - 1; right >= 1; right -= 2) {
        const rightColumn = right === 6 ? 5 : right;
        for (let vertical = 0; vertical < size; vertical += 1) {
          for (let j = 0; j < 2; j += 1) {
            const col = rightColumn - j;
            const upward = ((rightColumn + 1) & 2) === 0;
            const row = upward ? size - 1 - vertical : vertical;
            if (isFunction[row]?.[col] === true) continue;
            const module = matrix.modules[row]?.[col] === true;
            const inverted = maskBit(mask, col, row);
            bits.push(inverted ? !module : module);
          }
        }
      }

      const codewords: number[] = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] === true ? 1 : 0);
        codewords.push(byte);
      }

      // De-interleave the data half back into blocks.
      const sizes = [
        ...Array.from<number>({ length: spec.shortBlocks }).fill(spec.shortDataCodewords),
        ...Array.from<number>({ length: spec.longBlocks }).fill(spec.longDataCodewords),
      ];
      const blocks: number[][] = sizes.map(() => []);
      let cursor = 0;
      const maxSize = Math.max(...sizes);
      for (let i = 0; i < maxSize; i += 1) {
        for (let b = 0; b < sizes.length; b += 1) {
          if (i >= (sizes[b] ?? 0)) continue;
          const value = codewords[cursor];
          cursor += 1;
          if (value !== undefined) blocks[b]?.push(value);
        }
      }
      const data = blocks.flat();

      const text = readByteSegment(data, characterCountBitsFor(matrix.version));
      if (text !== null) return text;
    }
    return null;
  }

  function maskBit(mask: number, col: number, row: number): boolean {
    switch (mask) {
      case 0:
        return (col + row) % 2 === 0;
      case 1:
        return row % 2 === 0;
      case 2:
        return col % 3 === 0;
      case 3:
        return (col + row) % 3 === 0;
      case 4:
        return (Math.floor(col / 3) + Math.floor(row / 2)) % 2 === 0;
      case 5:
        return ((col * row) % 2) + ((col * row) % 3) === 0;
      case 6:
        return (((col * row) % 2) + ((col * row) % 3)) % 2 === 0;
      default:
        return (((col + row) % 2) + ((col * row) % 3)) % 2 === 0;
    }
  }

  function readByteSegment(data: readonly number[], countBits: number): string | null {
    const bits: boolean[] = [];
    for (const byte of data) {
      for (let i = 7; i >= 0; i -= 1) bits.push(((byte >>> i) & 1) === 1);
    }
    const take = (start: number, width: number): number => {
      let value = 0;
      for (let i = 0; i < width; i += 1) value = (value << 1) | (bits[start + i] === true ? 1 : 0);
      return value;
    };
    if (bits.length < 4 + countBits) return null;
    if (take(0, 4) !== 0b0100) return null;
    const length = take(4, countBits);
    const start = 4 + countBits;
    if (length === 0 || bits.length < start + length * 8) return null;

    const bytes: number[] = [];
    for (let i = 0; i < length; i += 1) bytes.push(take(start + i * 8, 8));
    // ASCII is all these URLs contain; anything else means the wrong mask.
    if (bytes.some((byte) => byte < 0x20 || byte > 0x7e)) return null;
    return bytes.map((byte) => String.fromCharCode(byte)).join('');
  }

  it('recovers the exact URL from the finished matrix', () => {
    for (const url of [
      'https://g.page/r/ABCDEF/review',
      REVIEW_URL,
      `https://search.google.com/local/writereview?placeid=${'A'.repeat(120)}`,
    ]) {
      expect(decode(matrixOf(url))).toBe(url);
    }
  });
});

describe('QR rendering', () => {
  it('collapses to rectangles that reproduce the matrix exactly', () => {
    const matrix = matrixOf(REVIEW_URL);
    const rects = darkRects(matrix);

    const painted = Array.from({ length: matrix.size }, () =>
      new Array<boolean>(matrix.size).fill(false),
    );
    for (const rect of rects) {
      for (let row = rect.row; row < rect.row + rect.height; row += 1) {
        for (let col = rect.col; col < rect.col + rect.width; col += 1) {
          painted[row]![col] = true;
        }
      }
    }
    expect(painted).toEqual(matrix.modules);

    // The whole point of merging: far fewer Views than modules.
    expect(rects.length).toBeLessThan((matrix.size * matrix.size) / 4);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The link                                                                */
/* -------------------------------------------------------------------------- */

describe('review link', () => {
  it('derives a link from a place id, and nothing else', () => {
    const link = reviewLinkForPlaceId('ChIJ123');
    expect(link?.url).toBe('https://search.google.com/local/writereview?placeid=ChIJ123');
    expect(link?.source).toBe('derived_from_place_id');
    expect(link?.opensReviewFormForSure).toBe(true);
    expect(reviewLinkForPlaceId('   ')).toBeNull();
  });

  it('accepts the two shapes whose destination is certain', () => {
    const direct = parsePastedReviewLink(' https://search.google.com/local/writereview?placeid=ChIJ9 ');
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.link.kind).toBe('write_review');
      expect(direct.link.opensReviewFormForSure).toBe(true);
      expect(direct.link.source).toBe('pasted_by_owner');
    }

    const short = parsePastedReviewLink('g.page/r/AbC-1_2/review');
    expect(short.ok).toBe(true);
    if (short.ok) {
      expect(short.link.kind).toBe('g_page_review');
      // Normalised to https, so what is printed is what was checked.
      expect(short.link.url).toBe('https://g.page/r/AbC-1_2/review');
    }
  });

  it('accepts a Maps short link but refuses to claim it opens the review box', () => {
    const parsed = parsePastedReviewLink('https://maps.app.goo.gl/abc123');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.link.kind).toBe('maps_short_link');
      expect(parsed.link.opensReviewFormForSure).toBe(false);
    }
  });

  it('rejects everything else, and says which kind of wrong it is', () => {
    const cases: [string, string][] = [
      ['', 'empty'],
      ['not a link', 'not_a_url'],
      ['javascript:alert(1)', 'not_a_url'],
      ['whatsapp://send?text=hi', 'not_a_url'],
      ['https://example.com/review', 'not_google'],
      ['https://not-google.com/local/writereview?placeid=x', 'not_google'],
      ['https://maps.google.com/maps?cid=123', 'google_but_not_a_review_link'],
      ['https://g.page/example-business', 'google_but_not_a_review_link'],
      ['https://search.google.com/local/writereview', 'missing_place_id'],
      ['https://search.google.com/local/writereview?placeid=', 'missing_place_id'],
    ];
    for (const [input, reason] of cases) {
      const parsed = parsePastedReviewLink(input);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.reason).toBe(reason);
        expect(parsed.message.length).toBeGreaterThan(20);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The message and the number                                              */
/* -------------------------------------------------------------------------- */

describe('the request message', () => {
  it('carries the link and never offers anything in return', () => {
    for (const tone of ['english', 'hinglish'] as const) {
      const text = reviewRequestMessage({
        businessName: 'Example Salon',
        url: REVIEW_URL,
        tone,
      });
      expect(text).toContain(REVIEW_URL);
      expect(text).toContain('Example Salon');
      expect(text).not.toMatch(/discount|free|offer|off\b|5 star|five star|cashback/i);
    }
  });

  it('rewrites the sentence rather than leaving a hole when the name is unknown', () => {
    const text = reviewRequestMessage({ businessName: null, url: REVIEW_URL, tone: 'english' });
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('null');
    expect(text).toContain('Thank you for coming in today.');
  });
});

describe('the customer number', () => {
  it('accepts what an owner actually types', () => {
    for (const input of ['9876543210', '98765 43210', '+91 98765-43210', '098765 43210', '919876543210']) {
      const parsed = parseIndianMobile(input);
      expect(parsed.ok).toBe(true);
      if (parsed.ok === true) expect(parsed.wa).toBe('919876543210');
    }
  });

  it('treats blank as "let WhatsApp ask", not as an error', () => {
    expect(parseIndianMobile('  ').ok).toBe('blank');
  });

  it('rejects a number WhatsApp could not open a chat with', () => {
    for (const input of ['12345', '1234567890', '5876543210', 'abcdefghij']) {
      expect(parseIndianMobile(input).ok).toBe(false);
    }
  });

  it('formats a number back so the owner can check it', () => {
    expect(formatNationalMobile('9876543210')).toBe('98765 43210');
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Sharing                                                                 */
/* -------------------------------------------------------------------------- */

describe('WhatsApp handoff', () => {
  it('builds a wa.me link with and without a number', () => {
    expect(whatsAppUrl({ waNumber: '919876543210', text: 'hi there' })).toBe(
      'https://wa.me/919876543210?text=hi%20there',
    );
    expect(whatsAppUrl({ waNumber: null, text: 'hi' })).toBe('https://wa.me/?text=hi');
  });

  it('reports a failed open instead of silently doing nothing', async () => {
    const result = await openWhatsApp(
      fakeLinking({
        openURL: async () => {
          throw new Error('no activity found');
        },
      }),
      { waNumber: null, text: 'hi' },
    );
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.message).toMatch(/not be installed/i);
  });

  it('never claims WhatsApp is missing when the probe merely could not see it', async () => {
    const result = await openWhatsApp(
      fakeLinking({
        canOpenURL: async () => false,
      }),
      { waNumber: null, text: 'hi' },
    );
    // Opened, but honestly flagged as undetected rather than reported as absent.
    expect(result).toEqual({ status: 'opened', whatsappDetected: false });
  });
});

describe('clipboard', () => {
  it('reports a refusal rather than pretending it copied', () => {
    expect(copyToClipboard('x', null)).toEqual({
      ok: false,
      message: expect.stringContaining('clipboard'),
    });
    expect(
      copyToClipboard('x', {
        setString: () => {
          throw new Error('nope');
        },
      }).ok,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. The weekly log                                                          */
/* -------------------------------------------------------------------------- */

const MONDAY = new Date(2024, 4, 6, 10, 0, 0); // Monday 6 May 2024, local time.
const WEDNESDAY = new Date(2024, 4, 8, 10, 0, 0);
const PREVIOUS_FRIDAY = new Date(2024, 4, 3, 10, 0, 0);

function entryAt(id: string, date: Date): ReviewRequestEntry {
  return { id, confirmedAt: date.toISOString(), channel: 'whatsapp' };
}

describe('weekly request log', () => {
  it('starts the week on Monday, in local time', () => {
    expect(startOfWeek(MONDAY)).toBe('2024-05-06');
    expect(startOfWeek(WEDNESDAY)).toBe('2024-05-06');
    expect(startOfWeek(new Date(2024, 4, 12, 23, 30))).toBe('2024-05-06'); // Sunday.
    expect(startOfWeek(PREVIOUS_FRIDAY)).toBe('2024-04-29');
  });

  it('counts only this week, and keeps the older entries without counting them', () => {
    const summary = summarise(
      [entryAt('a', MONDAY), entryAt('b', WEDNESDAY), entryAt('c', PREVIOUS_FRIDAY)],
      WEDNESDAY,
    );
    expect(summary.confirmed).toBe(2);
    expect(summary.entries).toHaveLength(3);
    expect(summary.suggested).toBe(8);
  });

  it('reports an unreadable log as an error, never as zero requests', async () => {
    const corrupt = await loadRequestLog(memoryStorage({ 'shoogle.gbp.reviewRequests.v1': '{{{' }), MONDAY);
    expect(corrupt.status).toBe('error');

    const wrongShape = parseRequestLog('[{"id":1}]');
    expect(wrongShape).toBe('corrupt');

    const unreadable = await loadRequestLog(
      {
        async getItem() {
          throw new Error('disk gone');
        },
        async setItem() {
          /* not reached */
        },
      },
      MONDAY,
    );
    expect(unreadable.status).toBe('error');
    if (unreadable.status === 'error') expect(unreadable.message).toMatch(/not zero/i);
  });

  it('reads an empty log as a genuine zero', async () => {
    const state = await loadRequestLog(memoryStorage(), MONDAY);
    expect(state.status).toBe('ready');
    if (state.status === 'ready') expect(state.value.confirmed).toBe(0);
  });

  it('persists a confirmed request, and says when it could not', async () => {
    const storage = memoryStorage();
    const first = await recordConfirmedRequest(storage, entryAt('a', MONDAY), MONDAY, []);
    expect(first.persisted).toBe(true);
    expect(first.summary.confirmed).toBe(1);

    const reloaded = await loadRequestLog(storage, MONDAY);
    expect(reloaded.status === 'ready' && reloaded.value.confirmed).toBe(1);

    const failing = await recordConfirmedRequest(
      {
        async getItem() {
          return null;
        },
        async setItem() {
          throw new Error('full');
        },
      },
      entryAt('b', MONDAY),
      MONDAY,
      [],
    );
    expect(failing.persisted).toBe(false);
    expect(failing.summary.confirmed).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. The screen                                                              */
/* -------------------------------------------------------------------------- */

function renderScreen() {
  return renderRouter(
    {
      'seo/get-reviews': () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>
            <GetReviewsScreen />
          </ToastProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: '/seo/get-reviews' },
  );
}

/** Nothing on this screen may read as a Google search rank. */
function expectNoRankRendered() {
  expect(screen.queryAllByText(/#\s?\d/)).toHaveLength(0);
  expect(screen.queryAllByText(/\brank\w*\b[^.]*\d/i)).toHaveLength(0);
  expect(screen.queryAllByText(/\bposition\b[^.]*\d/i)).toHaveLength(0);
}

async function pasteValidLink() {
  await fireEvent.changeText(screen.getByTestId('review-link-input'), 'https://g.page/r/FAKE1/review');
  await fireEvent.press(screen.getByTestId('review-link-use'));
  await waitFor(() => expect(screen.getByTestId('review-link-url')).toBeOnTheScreen());
}

describe('get reviews screen — NOT CONNECTED (the default)', () => {
  beforeEach(async () => {
    mockFixtures = false;
    await resetHarness();
  });

  it('names the missing place id instead of inventing a link', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-card')).toBeOnTheScreen());

    expect(screen.getByText(/place id only comes from a connected Google Business Profile/i)).toBeOnTheScreen();
    // No URL anywhere on screen, and no QR built from one.
    expect(screen.queryByTestId('review-link-url')).toBeNull();
    expect(screen.queryByTestId('review-qr')).toBeNull();
    expect(screen.queryAllByText(/writereview\?placeid=/)).toHaveLength(0);

    // Real state, so no fixture banner.
    expect(screen.queryByTestId('fixture-banner')).toBeNull();
    expect(screen.queryByTestId('fixture-view-switch')).toBeNull();
    expectNoRankRendered();
  });

  it('disables sending and says why — no dead controls', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('send-whatsapp')).toBeOnTheScreen());

    expect(screen.getByTestId('send-whatsapp')).toBeDisabled();
    expect(screen.getByTestId('send-share')).toBeDisabled();
    expect(screen.getByTestId('send-disabled-reason')).toBeOnTheScreen();
    expect(screen.getByText(/nothing to send without it/i)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('send-whatsapp'));
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('shows a measured zero for requests and an unknown for reviews — never the same thing', async () => {
    await renderScreen();

    // Requests: Shoogle sent none and knows it. A real 0.
    await waitFor(() => expect(screen.getByTestId('weekly-requests-count')).toHaveTextContent('0'));
    expect(screen.getByTestId('weekly-requests-scope')).toBeOnTheScreen();

    // Reviews: not connected, so no number at all.
    expect(screen.queryByTestId('new-reviews-delta')).toBeNull();
    expect(screen.getByText(/cannot read how many reviews you have/i)).toBeOnTheScreen();
    expect(screen.getByText(/unknown, not zero/i)).toBeOnTheScreen();
  });

  it('explains where the link lives when asked, rather than dead-ending', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-help')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('review-link-help'));
    await waitFor(() => expect(screen.getByTestId('where-is-my-link')).toBeOnTheScreen());
    expect(screen.getByText(/Google shows a short link — copy it\./)).toBeOnTheScreen();
  });

  it('every control carries a name and meets the 44pt Android floor', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('send-whatsapp')).toBeOnTheScreen());

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(3);

    for (const button of buttons) {
      const name: unknown = button.props.accessibilityLabel;
      expect(typeof name === 'string' && name.trim().length > 0).toBe(true);

      const style = StyleSheet.flatten(button.props.style) as {
        height?: number;
        minHeight?: number;
      } | null;
      const size = style?.minHeight ?? style?.height;
      if (typeof size === 'number') {
        expect(size).toBeGreaterThanOrEqual(control.minTouchTarget);
      }
    }
  });
});

describe('get reviews screen — THE PASTED LINK PATH', () => {
  beforeEach(async () => {
    mockFixtures = false;
    await resetHarness();
  });

  it('refuses a link that is not Google, with the reason, and builds no QR', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('review-link-input'), 'https://example.com/reviews');
    await fireEvent.press(screen.getByTestId('review-link-use'));

    await waitFor(() => expect(screen.getByText(/not a Google link/i)).toBeOnTheScreen());
    expect(screen.queryByTestId('review-qr')).toBeNull();
    expect(screen.getByTestId('send-whatsapp')).toBeDisabled();
  });

  it('accepts a Google review link, shows its provenance and draws the QR', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    expect(screen.getByTestId('review-link-url')).toHaveTextContent('https://g.page/r/FAKE1/review');
    expect(screen.getByText('You pasted this')).toBeOnTheScreen();
    expect(screen.getByTestId('review-qr')).toBeOnTheScreen();
    expect(screen.getByTestId('review-qr').props.accessibilityLabel).toContain(
      'https://g.page/r/FAKE1/review',
    );
    expect(screen.getByTestId('send-whatsapp')).not.toBeDisabled();
  });

  it('copies the link, and reports it', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    await fireEvent.press(screen.getByTestId('review-link-copy'));
    expect(mockSetString).toHaveBeenCalledWith('https://g.page/r/FAKE1/review');
  });

  it('prefills a message that carries the link and offers nothing in return', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    const value: string = screen.getByTestId('send-message').props.value;
    expect(value).toContain('https://g.page/r/FAKE1/review');
    expect(value).not.toMatch(/discount|free|5 star/i);
  });
});

describe('get reviews screen — SENDING IS NOT COUNTING', () => {
  beforeEach(async () => {
    mockFixtures = false;
    await resetHarness();
  });

  it('opens wa.me, counts nothing yet, and asks the owner what happened', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    await fireEvent.changeText(screen.getByTestId('send-phone'), '98765 43210');
    await fireEvent.press(screen.getByTestId('send-whatsapp'));

    await waitFor(() => expect(mockOpenURL).toHaveBeenCalledTimes(1));
    expect(mockOpenURL.mock.calls[0]?.[0]).toContain('https://wa.me/919876543210?text=');

    // The count has NOT moved, and the uncounted request is visible.
    await waitFor(() => expect(screen.getByTestId('confirm-send-card')).toBeOnTheScreen());
    expect(screen.getByTestId('weekly-requests-count')).toHaveTextContent('0');
    expect(screen.getByTestId('weekly-requests-pending')).toBeOnTheScreen();
  });

  it('counts the request only once the owner confirms it went', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    await fireEvent.press(screen.getByTestId('send-whatsapp'));
    await waitFor(() => expect(screen.getByTestId('confirm-sent')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('confirm-sent'));
    await waitFor(() => expect(screen.getByTestId('weekly-requests-count')).toHaveTextContent('1'));
    expect(screen.queryByTestId('confirm-send-card')).toBeNull();
  });

  it('leaves the count alone when the owner says it did not go', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    await fireEvent.press(screen.getByTestId('send-whatsapp'));
    await waitFor(() => expect(screen.getByTestId('confirm-not-sent')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('confirm-not-sent'));
    await waitFor(() => expect(screen.queryByTestId('confirm-send-card')).toBeNull());
    expect(screen.getByTestId('weekly-requests-count')).toHaveTextContent('0');
  });

  it('refuses a bad number before opening anything', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    await fireEvent.changeText(screen.getByTestId('send-phone'), '12345');
    await fireEvent.press(screen.getByTestId('send-whatsapp'));

    await waitFor(() => expect(screen.getByText(/not an Indian mobile number/i)).toBeOnTheScreen());
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('reports a failed handoff rather than silently doing nothing', async () => {
    mockOpenURL.mockRejectedValue(new Error('no activity'));
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    await fireEvent.press(screen.getByTestId('send-whatsapp'));
    await waitFor(() => expect(screen.getByText(/WhatsApp did not open/i)).toBeOnTheScreen());
    expect(screen.queryByTestId('confirm-send-card')).toBeNull();
  });

  it('treats the share sheet the same way — picked a target is not sent', async () => {
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });

    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-input')).toBeOnTheScreen());
    await pasteValidLink();

    await fireEvent.press(screen.getByTestId('send-share'));
    await waitFor(() => expect(screen.getByTestId('confirm-send-card')).toBeOnTheScreen());
    expect(screen.getByTestId('weekly-requests-count')).toHaveTextContent('0');

    shareSpy.mockRestore();
  });
});

describe('get reviews screen — FIXTURE PROFILE', () => {
  beforeEach(async () => {
    mockFixtures = true;
    await resetHarness();
  });

  afterEach(() => {
    mockFixtures = false;
  });

  it('labels fixture content and derives the link from the fixture place id', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('review-link-url')).toBeOnTheScreen());

    expect(screen.getByTestId('fixture-banner')).toBeOnTheScreen();
    expect(screen.getByTestId('review-link-url')).toHaveTextContent(/FIXTURE/);
    expect(screen.getByText('From Google')).toBeOnTheScreen();
    expect(screen.getByTestId('review-qr')).toBeOnTheScreen();
  });

  it('keeps requests sent and reviews received as two separate, unjoined facts', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('new-reviews-delta')).toBeOnTheScreen());

    // Three requests confirmed this week, two new reviews. Never combined.
    expect(screen.getByTestId('weekly-requests-count')).toHaveTextContent('3');
    expect(screen.getByTestId('new-reviews-delta')).toHaveTextContent('+2');
    expect(screen.getByTestId('new-reviews-not-attributed')).toBeOnTheScreen();
    expect(screen.getByText(/cannot tell you which of these came from a request/i)).toBeOnTheScreen();
    expectNoRankRendered();
  });

  it('renders the Voice of Merchant states as first-class, with no number', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('fixture-view-switch')).toBeOnTheScreen());

    await fireEvent.press(screen.getByText('Not verified'));
    await waitFor(() => expect(screen.queryByTestId('new-reviews-delta')).toBeNull());
    expect(screen.getByText(/Google has not verified that this business is yours/i)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Owned by someone else'));
    await waitFor(() =>
      expect(screen.getByText(/Another Google account already claims this business/i)).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('new-reviews-delta')).toBeNull();

    // The requests count is local and unaffected by the profile's state.
    expect(screen.getByTestId('weekly-requests-count')).toHaveTextContent('3');
  });
});

describe('get reviews screen — THE GUIDANCE SHIPS WITH THE BUTTON', () => {
  beforeEach(() => {
    mockFixtures = false;
  });

  it('states Google’s rules on the same screen as the send control', async () => {
    await renderScreen();
    await waitFor(() => expect(screen.getByTestId('google-rules-card')).toBeOnTheScreen());

    expect(screen.getByText(/Never offer anything in return/i)).toBeOnTheScreen();
    expect(screen.getByText(/Do not request in bulk/i)).toBeOnTheScreen();
    expect(screen.getByText(/Ask everyone, not only the happy ones/i)).toBeOnTheScreen();
    expect(screen.getByTestId('how-this-works-card')).toBeOnTheScreen();
  });
});
