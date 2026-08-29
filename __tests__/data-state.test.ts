import {
  combineData,
  failed,
  isError,
  isLoading,
  isReady,
  isUnavailable,
  loading,
  mapData,
  ready,
  unavailable,
  unwrapOrNull,
  UNAVAILABLE_COPY,
  type UnavailableReason,
} from '@/lib/state/DataState';

/**
 * DataState is the mechanism behind product rule 7 ("unknown is not zero").
 * These tests pin the behaviour the whole app depends on.
 */
describe('DataState', () => {
  describe('constructors and guards', () => {
    it('distinguishes all four states', () => {
      expect(isLoading(loading())).toBe(true);
      expect(isReady(ready(1, 'now'))).toBe(true);
      expect(isUnavailable(unavailable('not_connected', 'nope'))).toBe(true);
      expect(isError(failed('CODE', 'boom'))).toBe(true);
    });

    it('marks fixture-sourced values so the flag travels with the data', () => {
      const state = ready(42, 'now', true);
      expect(state.isFixture).toBe(true);
      expect(ready(42, 'now').isFixture).toBeUndefined();
    });

    it('defaults errors to retryable but allows terminal errors', () => {
      expect(failed('A', 'msg').retryable).toBe(true);
      expect(failed('B', 'msg', false).retryable).toBe(false);
    });
  });

  describe('unwrapOrNull', () => {
    it('returns the value only when ready', () => {
      expect(unwrapOrNull(ready(7, 'now'))).toBe(7);
    });

    // This is the core guarantee: a non-ready state can never become a number.
    it.each([
      ['loading', loading()],
      ['unavailable', unavailable('no_data_yet', 'x')],
      ['error', failed('E', 'x')],
    ])('returns null (never 0) for %s', (_label, state) => {
      const result = unwrapOrNull(state as ReturnType<typeof loading>);
      expect(result).toBeNull();
      expect(result).not.toBe(0);
    });
  });

  describe('mapData', () => {
    it('transforms a ready value and preserves its metadata', () => {
      const mapped = mapData(ready(2, 'ts', true), (n) => n * 5);
      expect(mapped).toMatchObject({ status: 'ready', value: 10, fetchedAt: 'ts', isFixture: true });
    });

    it('passes non-ready states through untouched', () => {
      const err = failed('E', 'x');
      expect(mapData(err, () => 1)).toBe(err);
    });
  });

  describe('combineData', () => {
    it('combines two ready values', () => {
      const combined = combineData(ready('a', 'ts'), ready(1, 'ts'));
      expect(combined).toMatchObject({ status: 'ready', value: ['a', 1] });
    });

    it('propagates fixture-ness if either side is a fixture', () => {
      const combined = combineData(ready('a', 'ts'), ready(1, 'ts', true));
      expect(isReady(combined) && combined.isFixture).toBe(true);
    });

    it('prefers loading over every other state', () => {
      expect(combineData(loading(), failed('E', 'x')).status).toBe('loading');
      expect(combineData(ready(1, 'ts'), loading()).status).toBe('loading');
    });

    it('prefers error over unavailable', () => {
      const combined = combineData(unavailable('offline', 'x'), failed('E', 'x'));
      expect(combined.status).toBe('error');
    });
  });

  describe('UNAVAILABLE_COPY', () => {
    const reasons: UnavailableReason[] = [
      'not_connected',
      'auth_expired',
      'not_supported',
      'no_data_yet',
      'insufficient_data',
      'offline',
      'rate_limited',
      'requires_upgrade',
    ];

    it('has owner-facing copy for every reason', () => {
      for (const reason of reasons) {
        expect(UNAVAILABLE_COPY[reason].title.length).toBeGreaterThan(0);
        expect(UNAVAILABLE_COPY[reason].body.length).toBeGreaterThan(0);
      }
    });

    it('never describes missing data as a zero', () => {
      for (const reason of reasons) {
        const text = `${UNAVAILABLE_COPY[reason].title} ${UNAVAILABLE_COPY[reason].body}`;
        expect(text).not.toMatch(/\b0\b/);
      }
    });
  });
});
