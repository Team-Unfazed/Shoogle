import { createGbpWriteQueue } from '@/features/gbp/writeQueue';
import { GBP_EDIT_QPM_PER_PROFILE, GBP_READ_QPM_PER_API } from '@/features/gbp/endpoints';

/**
 * Google caps Business Information EDITS at 10 per minute PER PROFILE and says
 * that ceiling cannot be raised. Reads are 300 per minute per API. Confusing
 * the two would either throttle the whole app for no reason or blow the one
 * limit that cannot be increased.
 */

/** A controllable clock, so a 60-second window does not take 60 seconds. */
function fakeClock() {
  let time = 0;
  const waiters: { at: number; resolve: () => void }[] = [];
  return {
    now: () => time,
    sleep: (ms: number) =>
      new Promise<void>((resolve) => {
        waiters.push({ at: time + ms, resolve });
      }),
    async advance(ms: number) {
      time += ms;
      // Release everything now due, then let the queue's chained continuations
      // run to a standstill. The lane is a promise chain, so one microtask
      // flush is not enough to drain ten tasks.
      for (let round = 0; round < 200; round += 1) {
        for (const waiter of waiters.filter((candidate) => candidate.at <= time)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve();
        }
        await Promise.resolve();
      }
    },
  };
}

describe('the constants are the ones Google documents', () => {
  it('caps edits at 10 per profile per minute and reads at 300 per API', () => {
    expect(GBP_EDIT_QPM_PER_PROFILE).toBe(10);
    expect(GBP_READ_QPM_PER_API).toBe(300);
  });
});

describe('per-profile edit ceiling', () => {
  it('runs up to the ceiling immediately and holds the next one back', async () => {
    const clock = fakeClock();
    const queue = createGbpWriteQueue({ now: clock.now, sleep: clock.sleep });
    const ran: number[] = [];

    const tasks = Array.from({ length: 11 }, (_, index) =>
      queue.enqueue('location-1', async () => {
        ran.push(index);
        return index;
      }),
    );

    // Let the ten allowed tasks drain.
    await clock.advance(0);
    await clock.advance(0);
    expect(ran).toHaveLength(GBP_EDIT_QPM_PER_PROFILE);
    expect(queue.slotsRemaining('location-1')).toBe(0);

    // The eleventh only runs once the window rolls.
    await clock.advance(59_999);
    expect(ran).toHaveLength(GBP_EDIT_QPM_PER_PROFILE);
    await clock.advance(2);
    await Promise.all(tasks);
    expect(ran).toHaveLength(11);
  });

  it('preserves submission order for one profile', async () => {
    const clock = fakeClock();
    const queue = createGbpWriteQueue({ now: clock.now, sleep: clock.sleep });
    const ran: string[] = [];
    const tasks = ['a', 'b', 'c'].map((name) =>
      queue.enqueue('location-1', async () => {
        ran.push(name);
      }),
    );
    await clock.advance(0);
    await Promise.all(tasks);
    expect(ran).toEqual(['a', 'b', 'c']);
  });

  it('does not let one busy profile block another', async () => {
    const clock = fakeClock();
    const queue = createGbpWriteQueue({ now: clock.now, sleep: clock.sleep });
    const ran: string[] = [];

    for (let index = 0; index < GBP_EDIT_QPM_PER_PROFILE; index += 1) {
      void queue.enqueue('busy', async () => {
        ran.push('busy');
      });
    }
    const other = queue.enqueue('quiet', async () => {
      ran.push('quiet');
      return 'done';
    });

    await clock.advance(0);
    await expect(other).resolves.toBe('done');
    expect(ran).toContain('quiet');
  });

  it('does not wedge a profile after a failed edit', async () => {
    const clock = fakeClock();
    const queue = createGbpWriteQueue({ now: clock.now, sleep: clock.sleep });

    const failing = queue.enqueue('location-1', async () => {
      throw new Error('google said no');
    });
    await expect(failing).rejects.toThrow('google said no');

    const next = queue.enqueue('location-1', async () => 'ok');
    await clock.advance(0);
    await expect(next).resolves.toBe('ok');
  });

  it('uses a rolling window, not a fixed bucket', async () => {
    const clock = fakeClock();
    const queue = createGbpWriteQueue({
      maxPerWindow: 2,
      windowMs: 1_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await queue.enqueue('location-1', async () => undefined);
    await clock.advance(900);
    await queue.enqueue('location-1', async () => undefined);
    expect(queue.slotsRemaining('location-1')).toBe(0);

    // 150ms later the FIRST edit ages out, but the second has not.
    await clock.advance(150);
    expect(queue.slotsRemaining('location-1')).toBe(1);
  });
});
