/**
 * A QR encoder, written from the specification, because there is no QR
 * dependency in package.json and adding one was not allowed.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * A printed QR on the counter is the single cheapest way an Indian salon,
 * clinic or gym collects reviews: the customer is already standing there with a
 * phone. Every QR library in the React Native ecosystem pulls in
 * `react-native-svg`, which this project does not have, so the choice was
 * "ship the link only" or "encode it ourselves". The encoder is ~350 lines of
 * pure, deterministic arithmetic with no native surface, so it is the cheaper
 * of the two.
 *
 * WHAT IS AND IS NOT SUPPORTED, ON PURPOSE
 * ----------------------------------------
 * - **Byte mode only.** A URL is bytes. Alphanumeric mode would encode a
 *   handful of links slightly smaller and doubles the code.
 * - **Error-correction level M only** (~15% recovery). L would fit more
 *   characters, but this code gets printed, laminated, taped to a counter and
 *   smudged; M is the level the Google/ISO guidance uses for printed media.
 * - **Versions 1-10.** That is up to 213 bytes, which covers every Google
 *   review URL shape by a wide margin (the longest, a `writereview` link with a
 *   27-character place id, is 78). Anything longer returns `too_long` and the
 *   screen says so rather than rendering a QR that cannot be scanned.
 *
 * Nothing here reads state, touches the network, or renders. `QrCode.tsx` turns
 * the matrix into Views.
 *
 * Reference: ISO/IEC 18004. The structure follows the same well-trodden order
 * as Project Nayuki's reference implementation (finder/timing/alignment,
 * reserve format areas, zig-zag data placement, mask penalty selection), which
 * is the canonical public description of the placement rules.
 */

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export interface QrMatrix {
  /** Modules per side, excluding the quiet zone. `4 * version + 17`. */
  readonly size: number;
  readonly version: number;
  /** Row-major. `true` is a dark module. */
  readonly modules: readonly (readonly boolean[])[];
}

export type QrEncodeResult =
  | { readonly ok: true; readonly matrix: QrMatrix }
  | { readonly ok: false; readonly reason: 'empty' | 'too_long'; readonly message: string };

/** The quiet zone the specification requires around a printed code. */
export const QR_QUIET_ZONE_MODULES = 4;

/** Longest byte length this encoder can carry (version 10, level M). */
export const QR_MAX_BYTES = 213;

/* -------------------------------------------------------------------------- */
/* Bounds-checked table access                                                */
/* -------------------------------------------------------------------------- */

/**
 * `noUncheckedIndexedAccess` is on, and silencing it with `!` would hide a real
 * class of bug in table-driven code. Every lookup goes through here instead: in
 * range it is the value, out of range it throws immediately rather than
 * producing a subtly wrong code that fails to scan.
 */
function at(list: readonly number[], index: number): number {
  const value = list[index];
  if (value === undefined) throw new RangeError(`QR table index out of range: ${index}`);
  return value;
}

function rowAt(grid: readonly (boolean | null)[][], index: number): (boolean | null)[] {
  const row = grid[index];
  if (row === undefined) throw new RangeError(`QR row out of range: ${index}`);
  return row;
}

function boolRowAt(grid: readonly boolean[][], index: number): boolean[] {
  const row = grid[index];
  if (row === undefined) throw new RangeError(`QR row out of range: ${index}`);
  return row;
}

function readonlyRowAt(
  grid: readonly (readonly boolean[])[],
  index: number,
): readonly boolean[] {
  const row = grid[index];
  if (row === undefined) throw new RangeError(`QR row out of range: ${index}`);
  return row;
}

function cellAt(grid: readonly (readonly boolean[])[], row: number, col: number): boolean {
  const cell = readonlyRowAt(grid, row)[col];
  if (cell === undefined) throw new RangeError(`QR column out of range: ${col}`);
  return cell;
}

/* -------------------------------------------------------------------------- */
/* GF(256) arithmetic, primitive polynomial 0x11D                             */
/* -------------------------------------------------------------------------- */

const GF_EXP: number[] = [];
const GF_LOG: number[] = new Array<number>(256).fill(0);

{
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP.push(value);
    GF_LOG[value] = i;
    value <<= 1;
    if ((value & 0x100) !== 0) value ^= 0x11d;
  }
  for (let i = 0; i < 255; i += 1) GF_EXP.push(at(GF_EXP, i));
}

/** GF(256) multiply. Exported so a test can check codewords independently. */
export function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return at(GF_EXP, at(GF_LOG, a) + at(GF_LOG, b));
}

/** `alpha^exponent`. Exported so tests can verify Reed-Solomon syndromes. */
export function gfExp(exponent: number): number {
  return at(GF_EXP, ((exponent % 255) + 255) % 255);
}

/* -------------------------------------------------------------------------- */
/* Version tables (level M, versions 1-10)                                    */
/* -------------------------------------------------------------------------- */

export interface BlockSpec {
  /** Error-correction codewords per block. */
  readonly ecPerBlock: number;
  readonly shortBlocks: number;
  readonly shortDataCodewords: number;
  readonly longBlocks: number;
  readonly longDataCodewords: number;
}

/**
 * Index 0 is version 1. Every row satisfies
 * `shortBlocks * (short + ec) + longBlocks * (long + ec) === totalCodewords`,
 * which `qr.test.ts` asserts against the independent total-codeword table so a
 * typo here cannot survive.
 */
const BLOCK_SPECS_M: readonly BlockSpec[] = [
  { ecPerBlock: 10, shortBlocks: 1, shortDataCodewords: 16, longBlocks: 0, longDataCodewords: 0 },
  { ecPerBlock: 16, shortBlocks: 1, shortDataCodewords: 28, longBlocks: 0, longDataCodewords: 0 },
  { ecPerBlock: 26, shortBlocks: 1, shortDataCodewords: 44, longBlocks: 0, longDataCodewords: 0 },
  { ecPerBlock: 18, shortBlocks: 2, shortDataCodewords: 32, longBlocks: 0, longDataCodewords: 0 },
  { ecPerBlock: 24, shortBlocks: 2, shortDataCodewords: 43, longBlocks: 0, longDataCodewords: 0 },
  { ecPerBlock: 16, shortBlocks: 4, shortDataCodewords: 27, longBlocks: 0, longDataCodewords: 0 },
  { ecPerBlock: 18, shortBlocks: 4, shortDataCodewords: 31, longBlocks: 0, longDataCodewords: 0 },
  { ecPerBlock: 22, shortBlocks: 2, shortDataCodewords: 38, longBlocks: 2, longDataCodewords: 39 },
  { ecPerBlock: 22, shortBlocks: 3, shortDataCodewords: 36, longBlocks: 2, longDataCodewords: 37 },
  { ecPerBlock: 26, shortBlocks: 4, shortDataCodewords: 43, longBlocks: 1, longDataCodewords: 44 },
];

/** Total codewords (data + error correction) per version. Versions 1-10. */
export const TOTAL_CODEWORDS: readonly number[] = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/** Alignment-pattern centre coordinates per version. Version 1 has none. */
const ALIGNMENT_POSITIONS: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export const QR_MAX_VERSION = BLOCK_SPECS_M.length;

function specFor(version: number): BlockSpec {
  const spec = BLOCK_SPECS_M[version - 1];
  if (spec === undefined) throw new RangeError(`Unsupported QR version: ${version}`);
  return spec;
}

/**
 * The block layout for a version. Exported so `get-reviews-ui.test.tsx` can
 * check the hand-transcribed table against the independent total-codeword
 * table, and can de-interleave a matrix it has read back.
 */
export function blockSpecFor(version: number): BlockSpec {
  return specFor(version);
}

/** Byte-mode character-count indicator width, exported for the same reason. */
export function characterCountBitsFor(version: number): number {
  return characterCountBits(version);
}

/**
 * Which modules are function patterns for a version. Exported so a test can
 * read a matrix back without re-deriving the placement rules.
 */
export function functionModuleMask(version: number): boolean[][] {
  const canvas = createCanvas(version * 4 + 17);
  drawFunctionPatterns(canvas, version);
  return canvas.isFunction;
}

export function dataCodewordsFor(version: number): number {
  const spec = specFor(version);
  return (
    spec.shortBlocks * spec.shortDataCodewords + spec.longBlocks * spec.longDataCodewords
  );
}

/** Byte-mode character-count indicator width. 8 bits below version 10. */
function characterCountBits(version: number): number {
  return version < 10 ? 8 : 16;
}

/* -------------------------------------------------------------------------- */
/* UTF-8                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hand-rolled rather than `TextEncoder`, which is not guaranteed on Hermes.
 * Review links are ASCII today; a Hinglish caption in a future QR would not be.
 */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Reed-Solomon                                                               */
/* -------------------------------------------------------------------------- */

/** `g(x) = product of (x - alpha^i)` for `i` in `[0, degree)`, highest term first. */
export function generatorPolynomial(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = at(next, j) ^ at(poly, j);
      next[j + 1] = at(next, j + 1) ^ gfMultiply(at(poly, j), gfExp(i));
    }
    poly = next;
  }
  return poly;
}

/** The `ecLength` error-correction codewords for one block of data codewords. */
export function errorCorrectionCodewords(data: readonly number[], ecLength: number): number[] {
  const generator = generatorPolynomial(ecLength);
  const remainder = new Array<number>(ecLength).fill(0);

  for (const byte of data) {
    const factor = byte ^ at(remainder, 0);
    remainder.shift();
    remainder.push(0);
    for (let j = 0; j < ecLength; j += 1) {
      remainder[j] = at(remainder, j) ^ gfMultiply(at(generator, j + 1), factor);
    }
  }

  return remainder;
}

/* -------------------------------------------------------------------------- */
/* Bit stream                                                                 */
/* -------------------------------------------------------------------------- */

class BitBuffer {
  private readonly bits: boolean[] = [];

  append(value: number, width: number): void {
    for (let i = width - 1; i >= 0; i -= 1) {
      this.bits.push(((value >>> i) & 1) === 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }

  padToCodewords(totalCodewords: number): number[] {
    const capacityBits = totalCodewords * 8;

    // Terminator: up to four zero bits.
    const terminator = Math.min(4, capacityBits - this.bits.length);
    for (let i = 0; i < terminator; i += 1) this.bits.push(false);
    // Then pad to a whole byte.
    while (this.bits.length % 8 !== 0) this.bits.push(false);

    const codewords: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) {
        byte = (byte << 1) | (this.bits[i + j] === true ? 1 : 0);
      }
      codewords.push(byte);
    }

    // The specification's alternating pad bytes.
    const PAD = [0xec, 0x11];
    let padIndex = 0;
    while (codewords.length < totalCodewords) {
      codewords.push(at(PAD, padIndex % 2));
      padIndex += 1;
    }
    return codewords;
  }
}

/* -------------------------------------------------------------------------- */
/* Codeword assembly                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Split the data codewords into blocks, add error correction to each, and
 * interleave. Exported so a test can check every block is a valid Reed-Solomon
 * codeword independently of anything this file does with the matrix.
 */
export function buildCodewords(version: number, dataCodewords: readonly number[]): {
  interleaved: number[];
  blocks: { data: number[]; ec: number[] }[];
} {
  const spec = specFor(version);
  const blocks: { data: number[]; ec: number[] }[] = [];

  let offset = 0;
  const push = (count: number, size: number) => {
    for (let i = 0; i < count; i += 1) {
      const data = dataCodewords.slice(offset, offset + size);
      offset += size;
      blocks.push({ data, ec: errorCorrectionCodewords(data, spec.ecPerBlock) });
    }
  };
  push(spec.shortBlocks, spec.shortDataCodewords);
  push(spec.longBlocks, spec.longDataCodewords);

  const interleaved: number[] = [];
  const maxData = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) {
      const value = block.data[i];
      if (value !== undefined) interleaved.push(value);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of blocks) {
      interleaved.push(at(block.ec, i));
    }
  }

  return { interleaved, blocks };
}

/* -------------------------------------------------------------------------- */
/* Matrix construction                                                        */
/* -------------------------------------------------------------------------- */

interface Canvas {
  size: number;
  modules: (boolean | null)[][];
  isFunction: boolean[][];
}

function createCanvas(size: number): Canvas {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null)),
    isFunction: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

/** `(col, row)` ordering, matching the specification's `(x, y)` diagrams. */
function setFunctionModule(canvas: Canvas, col: number, row: number, dark: boolean): void {
  if (col < 0 || col >= canvas.size || row < 0 || row >= canvas.size) return;
  rowAt(canvas.modules, row)[col] = dark;
  boolRowAt(canvas.isFunction, row)[col] = true;
}

function drawFinderPattern(canvas: Canvas, col: number, row: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(canvas, col + dx, row + dy, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignmentPattern(canvas: Canvas, col: number, row: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(canvas, col + dx, row + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function bitOf(value: number, index: number): boolean {
  return ((value >>> index) & 1) === 1;
}

/** Error-correction level M is `0b00` in the format string. */
const EC_LEVEL_M_BITS = 0b00;

function drawFormatBits(canvas: Canvas, mask: number): void {
  const data = (EC_LEVEL_M_BITS << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const size = canvas.size;

  for (let i = 0; i <= 5; i += 1) setFunctionModule(canvas, 8, i, bitOf(bits, i));
  setFunctionModule(canvas, 8, 7, bitOf(bits, 6));
  setFunctionModule(canvas, 8, 8, bitOf(bits, 7));
  setFunctionModule(canvas, 7, 8, bitOf(bits, 8));
  for (let i = 9; i < 15; i += 1) setFunctionModule(canvas, 14 - i, 8, bitOf(bits, i));

  for (let i = 0; i < 8; i += 1) setFunctionModule(canvas, size - 1 - i, 8, bitOf(bits, i));
  for (let i = 8; i < 15; i += 1) setFunctionModule(canvas, 8, size - 15 + i, bitOf(bits, i));

  // The one module that is always dark.
  setFunctionModule(canvas, 8, size - 8, true);
}

function drawVersionBits(canvas: Canvas, version: number): void {
  if (version < 7) return;
  let remainder = version;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | remainder;

  for (let i = 0; i < 18; i += 1) {
    const bit = bitOf(bits, i);
    const a = canvas.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunctionModule(canvas, a, b, bit);
    setFunctionModule(canvas, b, a, bit);
  }
}

function drawFunctionPatterns(canvas: Canvas, version: number): void {
  const size = canvas.size;

  for (let i = 0; i < size; i += 1) {
    setFunctionModule(canvas, 6, i, i % 2 === 0);
    setFunctionModule(canvas, i, 6, i % 2 === 0);
  }

  drawFinderPattern(canvas, 3, 3);
  drawFinderPattern(canvas, size - 4, 3);
  drawFinderPattern(canvas, 3, size - 4);

  const positions = ALIGNMENT_POSITIONS[version - 1] ?? [];
  const count = positions.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < count; j += 1) {
      const isFinderCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === count - 1) ||
        (i === count - 1 && j === 0);
      if (!isFinderCorner) drawAlignmentPattern(canvas, at(positions, i), at(positions, j));
    }
  }

  // Mask 0 is a placeholder; the real format bits are written once the mask is
  // chosen. Writing them now is what reserves the area from data placement.
  drawFormatBits(canvas, 0);
  drawVersionBits(canvas, version);
}

function drawCodewords(canvas: Canvas, codewords: readonly number[]): void {
  const size = canvas.size;
  const totalBits = codewords.length * 8;
  let bitIndex = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    const rightColumn = right === 6 ? 5 : right;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const col = rightColumn - j;
        const upward = ((rightColumn + 1) & 2) === 0;
        const row = upward ? size - 1 - vertical : vertical;
        if (!boolRowAt(canvas.isFunction, row)[col] && bitIndex < totalBits) {
          const byte = at(codewords, bitIndex >>> 3);
          rowAt(canvas.modules, row)[col] = bitOf(byte, 7 - (bitIndex & 7));
          bitIndex += 1;
        }
      }
    }
  }
}

function maskAt(mask: number, col: number, row: number): boolean {
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
    case 7:
      return (((col + row) % 2) + ((col * row) % 3)) % 2 === 0;
    default:
      throw new RangeError(`Unknown QR mask: ${mask}`);
  }
}

function applyMask(canvas: Canvas, mask: number): void {
  for (let row = 0; row < canvas.size; row += 1) {
    for (let col = 0; col < canvas.size; col += 1) {
      if (boolRowAt(canvas.isFunction, row)[col]) continue;
      if (maskAt(mask, col, row)) {
        rowAt(canvas.modules, row)[col] = rowAt(canvas.modules, row)[col] !== true;
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Mask penalty                                                               */
/* -------------------------------------------------------------------------- */

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/** The two finder-lookalike sequences rule 3 penalises, in both directions. */
const FINDER_LIKE_A = [true, false, true, true, true, false, true, false, false, false, false];
const FINDER_LIKE_B = [false, false, false, false, true, false, true, true, true, false, true];

function matchesAt(line: readonly boolean[], start: number, pattern: readonly boolean[]): boolean {
  for (let i = 0; i < pattern.length; i += 1) {
    if (line[start + i] !== pattern[i]) return false;
  }
  return true;
}

function linePenalty(line: readonly boolean[]): number {
  let penalty = 0;

  let runLength = 1;
  for (let i = 1; i <= line.length; i += 1) {
    if (i < line.length && line[i] === line[i - 1]) {
      runLength += 1;
      continue;
    }
    if (runLength >= 5) penalty += PENALTY_N1 + (runLength - 5);
    runLength = 1;
  }

  for (let i = 0; i + FINDER_LIKE_A.length <= line.length; i += 1) {
    if (matchesAt(line, i, FINDER_LIKE_A) || matchesAt(line, i, FINDER_LIKE_B)) {
      penalty += PENALTY_N3;
    }
  }

  return penalty;
}

/** The four standard penalty rules. Lower is better. Exported for tests. */
export function penaltyScore(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let penalty = 0;

  for (let row = 0; row < size; row += 1) {
    penalty += linePenalty(readonlyRowAt(modules, row));
  }
  for (let col = 0; col < size; col += 1) {
    const column: boolean[] = [];
    for (let row = 0; row < size; row += 1) column.push(cellAt(modules, row, col));
    penalty += linePenalty(column);
  }

  for (let row = 0; row + 1 < size; row += 1) {
    for (let col = 0; col + 1 < size; col += 1) {
      const first = cellAt(modules, row, col);
      if (
        first === cellAt(modules, row, col + 1) &&
        first === cellAt(modules, row + 1, col) &&
        first === cellAt(modules, row + 1, col + 1)
      ) {
        penalty += PENALTY_N2;
      }
    }
  }

  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (cellAt(modules, row, col)) dark += 1;
    }
  }
  const percent = (dark * 100) / (size * size);
  penalty += PENALTY_N4 * Math.floor(Math.abs(percent - 50) / 5);

  return penalty;
}

/* -------------------------------------------------------------------------- */
/* Encoding                                                                   */
/* -------------------------------------------------------------------------- */

function smallestVersionFor(byteLength: number): number | null {
  for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
    const needed = 4 + characterCountBits(version) + byteLength * 8;
    if (needed <= dataCodewordsFor(version) * 8) return version;
  }
  return null;
}

/**
 * Encode `text` as a QR matrix, or say why it cannot be encoded.
 *
 * Deterministic: the same input always produces the same matrix, so a printed
 * code and an on-screen code are the same code.
 */
export function encodeQr(text: string): QrEncodeResult {
  if (text.trim().length === 0) {
    return { ok: false, reason: 'empty', message: 'There is nothing to put in a QR code yet.' };
  }

  const bytes = utf8Bytes(text);
  const version = smallestVersionFor(bytes.length);
  if (version === null) {
    return {
      ok: false,
      reason: 'too_long',
      message: `This link is ${bytes.length} characters. Shoogle can only put ${QR_MAX_BYTES} characters in a QR code, so the link is shown on its own instead.`,
    };
  }

  const buffer = new BitBuffer();
  buffer.append(0b0100, 4); // Byte mode.
  buffer.append(bytes.length, characterCountBits(version));
  for (const byte of bytes) buffer.append(byte, 8);

  const dataCodewords = buffer.padToCodewords(dataCodewordsFor(version));
  const { interleaved } = buildCodewords(version, dataCodewords);

  const size = version * 4 + 17;
  const canvas = createCanvas(size);
  drawFunctionPatterns(canvas, version);
  drawCodewords(canvas, interleaved);

  // Any module the data stream did not reach is a remainder bit: light.
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (rowAt(canvas.modules, row)[col] === null) rowAt(canvas.modules, row)[col] = false;
    }
  }

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(canvas, mask);
    drawFormatBits(canvas, mask);
    const score = penaltyScore(freeze(canvas));
    if (score < bestPenalty) {
      bestPenalty = score;
      bestMask = mask;
    }
    applyMask(canvas, mask); // Masking is an XOR, so re-applying undoes it.
  }

  applyMask(canvas, bestMask);
  drawFormatBits(canvas, bestMask);

  return { ok: true, matrix: { size, version, modules: freeze(canvas) } };
}

function freeze(canvas: Canvas): boolean[][] {
  return canvas.modules.map((row) => row.map((cell) => cell === true));
}

/* -------------------------------------------------------------------------- */
/* Rendering support                                                          */
/* -------------------------------------------------------------------------- */

/** An axis-aligned block of dark modules, in module coordinates. */
export interface QrRect {
  readonly row: number;
  readonly col: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Collapse the dark modules into as few rectangles as possible.
 *
 * A version-6 code is 41x41, so one View per module would be 1,681 Views on a
 * screen a salon owner scrolls. Merging each row into runs and then merging a
 * run with an identical run directly above it typically cuts that by an order
 * of magnitude, with pixel-identical output.
 */
export function darkRects(matrix: QrMatrix): QrRect[] {
  const finished: QrRect[] = [];
  let open: QrRect[] = [];

  for (let row = 0; row < matrix.size; row += 1) {
    const runs: { col: number; width: number }[] = [];
    let start: number | null = null;
    for (let col = 0; col <= matrix.size; col += 1) {
      const dark = col < matrix.size && cellAt(matrix.modules, row, col);
      if (dark && start === null) start = col;
      if (!dark && start !== null) {
        runs.push({ col: start, width: col - start });
        start = null;
      }
    }

    const nextOpen: QrRect[] = [];
    for (const run of runs) {
      const match = open.find((rect) => rect.col === run.col && rect.width === run.width);
      if (match) {
        open = open.filter((rect) => rect !== match);
        nextOpen.push({ ...match, height: match.height + 1 });
      } else {
        nextOpen.push({ row, col: run.col, width: run.width, height: 1 });
      }
    }

    finished.push(...open);
    open = nextOpen;
  }

  finished.push(...open);
  return finished;
}
