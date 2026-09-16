/**
 * Identifiers that a `uuid` column will accept.
 *
 * The property worth testing is not "it returns a string" — the old
 * `post-<ts>-<n>` fallback did that too, and Postgres would have rejected every
 * one of them. It is that an id which cannot be stored is never returned.
 */

import { isUuid, newUuid } from '../ids';

const randomUUID = jest.requireMock('expo-crypto').randomUUID as jest.Mock;

describe('isUuid', () => {
  it('accepts the canonical 8-4-4-4-12 form, in either case', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true);
  });

  it('rejects the id shapes this feature used to mint', () => {
    // Every one of these was a real default in this codebase, and every one
    // would have been rejected by Postgres at the end of a publish.
    expect(isUuid('post-1757548800000-1')).toBe(false);
    expect(isUuid('draft-1757548800000-k3f9a1')).toBe(false);
    expect(isUuid('media-1')).toBe(false);
    expect(isUuid('fixture-business-0001')).toBe(false);
  });

  it('rejects the non-strings a missing native module can produce', () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid('undefined')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('rejects near-misses rather than letting them through', () => {
    // Wrong group lengths and a non-hex digit. A lenient check here would push
    // the failure into the database, one layer further from the cause.
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c330')).toBe(false);
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c33011')).toBe(false);
    expect(isUuid('3f2504e04f8941d39a0c0305e82c3301')).toBe(false);
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c330g')).toBe(false);
  });
});

describe('newUuid', () => {
  it('returns an id a uuid column would accept', () => {
    expect(isUuid(newUuid())).toBe(true);
  });

  it('does not repeat itself', () => {
    const ids = new Set([newUuid(), newUuid(), newUuid()]);
    expect(ids.size).toBe(3);
  });

  it('throws rather than returning undefined when the native module is absent', () => {
    // This is the real failure mode: expo-crypto does not throw when its native
    // side is missing, it returns undefined. Saving a post with id `undefined`
    // would tell the owner their draft was safe when it was not.
    randomUUID.mockReturnValueOnce(undefined);
    expect(() => newUuid()).toThrow(/could not generate an identifier/i);
  });

  it('throws rather than returning a value a uuid column would reject', () => {
    randomUUID.mockReturnValueOnce('not-a-uuid');
    expect(() => newUuid()).toThrow(/nothing was saved/i);
  });

  it('never reports a failure as a saved record', () => {
    randomUUID.mockReturnValueOnce('');
    // The message is owner-facing and has to say what did NOT happen, rather
    // than leaking the provider detail.
    expect(() => newUuid()).toThrow(/nothing was saved/i);
    expect(() => newUuid()).not.toThrow();
  });
});
