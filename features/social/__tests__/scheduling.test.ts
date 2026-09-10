import {
  bySoonestDue,
  formatNextUpLabel,
  formatScheduleLabel,
  instantAtZonedTime,
  isDue,
  MAX_SCHEDULE_HORIZON_DAYS,
  MIN_SCHEDULE_LEAD_MINUTES,
  nextDuePost,
  scheduleWindowFor,
  validateSchedule,
  zonedDateAhead,
  zonedParts,
  type SocialPost,
} from '../index';

const IST = 'Asia/Kolkata';
const NOW = new Date('2026-08-31T04:00:00.000Z'); // 09:30 IST, a Monday

function post(id: string, state: SocialPost['state'], dueAt: string | null): SocialPost {
  return {
    id,
    businessId: 'b1',
    title: id,
    state,
    caption: null,
    media: [],
    carouselId: null,
    schedule: dueAt === null ? null : { dueAt, timeZone: IST, owner: 'shoogle' },
    targets: [],
    insights: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('timezone-correct labels', () => {
  it('reads the clock in the business timezone, not the device one', () => {
    // 03:30 UTC is 09:00 in Kolkata.
    const parts = zonedParts('2026-09-02T03:30:00.000Z', IST);
    expect(parts.weekday).toBe('Wed');
    expect(parts.hour12).toBe(9);
    expect(parts.minute).toBe('00');
    expect(parts.dayPeriod).toBe('AM');
    expect(parts.fellBackToUtc).toBe(false);
  });

  it('formats a list row as "Wed · 9:00 AM"', () => {
    expect(formatScheduleLabel('2026-09-02T03:30:00.000Z', IST)).toBe('Wed · 9:00 AM');
    expect(formatScheduleLabel('2026-09-04T13:00:00.000Z', IST)).toBe('Fri · 6:30 PM');
  });

  it('renders midnight as 12:00 AM, never 0:00', () => {
    expect(formatScheduleLabel('2026-09-01T18:30:00.000Z', IST)).toBe('Wed · 12:00 AM');
  });

  it('says TODAY and TOMORROW only when they are true', () => {
    const today = instantAtZonedTime(2026, 8, 31, 18, 0, IST);
    const tomorrow = instantAtZonedTime(2026, 9, 1, 9, 0, IST);
    const later = instantAtZonedTime(2026, 9, 4, 9, 0, IST);

    expect(formatNextUpLabel(today, IST, NOW)).toBe('NEXT UP · TODAY 6:00 PM');
    expect(formatNextUpLabel(tomorrow, IST, NOW)).toBe('NEXT UP · TOMORROW 9:00 AM');
    expect(formatNextUpLabel(later, IST, NOW)).toBe('NEXT UP · FRI 9:00 AM');
  });

  it('marks a fallback out loud rather than showing a plausible wrong time', () => {
    const parts = zonedParts('2026-09-02T03:30:00.000Z', 'Not/AZone');
    expect(parts.fellBackToUtc).toBe(true);
    expect(formatScheduleLabel('2026-09-02T03:30:00.000Z', 'Not/AZone')).toContain('UTC');
  });

  it('round-trips a wall-clock time through the instant and back', () => {
    const instant = instantAtZonedTime(2026, 9, 2, 9, 0, IST);
    expect(instant).toBe('2026-09-02T03:30:00.000Z');
    expect(formatScheduleLabel(instant, IST)).toBe('Wed · 9:00 AM');
  });

  it('advances the calendar date in the business timezone', () => {
    // 20:00 UTC on the 31st is already the 1st in Kolkata.
    const late = new Date('2026-08-31T20:00:00.000Z');
    expect(zonedDateAhead(late, 1, IST)).toEqual({ year: 2026, month: 9, day: 2 });
  });
});

describe('schedule validation', () => {
  it('accepts a time far enough ahead', () => {
    const result = validateSchedule('2026-09-02T03:30:00.000Z', IST, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.schedule.owner).toBe('shoogle');
      expect(result.schedule.timeZone).toBe(IST);
    }
  });

  it('rejects the past, and says so plainly', () => {
    const result = validateSchedule('2026-08-30T03:30:00.000Z', IST, NOW);
    expect(result).toMatchObject({ ok: false, reason: 'in_the_past' });
  });

  it('rejects a time inside the lead window rather than racing the upload', () => {
    const soon = new Date(NOW.getTime() + (MIN_SCHEDULE_LEAD_MINUTES - 1) * 60_000);
    expect(validateSchedule(soon.toISOString(), IST, NOW)).toMatchObject({
      ok: false,
      reason: 'too_soon',
    });
  });

  it('rejects beyond the horizon', () => {
    const far = new Date(NOW.getTime() + (MAX_SCHEDULE_HORIZON_DAYS + 1) * 86_400_000);
    expect(validateSchedule(far.toISOString(), IST, NOW)).toMatchObject({
      ok: false,
      reason: 'beyond_horizon',
    });
  });

  it('rejects an unusable timezone instead of guessing an offset', () => {
    expect(validateSchedule('2026-09-02T03:30:00.000Z', 'Not/AZone', NOW)).toMatchObject({
      ok: false,
      reason: 'unknown_timezone',
    });
  });

  it('rejects a value that is not a date at all', () => {
    expect(validateSchedule('next tuesday', IST, NOW)).toMatchObject({
      ok: false,
      reason: 'invalid_instant',
    });
  });
});

describe('the due queue', () => {
  it('treats a passed instant as due', () => {
    expect(isDue({ dueAt: '2026-08-31T03:00:00.000Z', timeZone: IST, owner: 'shoogle' }, NOW)).toBe(true);
    expect(isDue({ dueAt: '2026-08-31T05:00:00.000Z', timeZone: IST, owner: 'shoogle' }, NOW)).toBe(false);
  });

  it('sorts unscheduled posts last, never as "now"', () => {
    const sorted = [post('none', 'draft', null), post('soon', 'scheduled', '2026-09-01T03:30:00.000Z')].sort(
      bySoonestDue,
    );
    expect(sorted.map((p) => p.id)).toEqual(['soon', 'none']);
  });

  it('only considers posts that are actually scheduled', () => {
    const posts = [
      // A draft with a date on it is not going out.
      post('draft-with-date', 'draft', '2026-08-31T05:00:00.000Z'),
      post('real', 'scheduled', '2026-09-01T03:30:00.000Z'),
    ];
    expect(nextDuePost(posts)?.id).toBe('real');
  });

  it('returns null when nothing is scheduled', () => {
    expect(nextDuePost([post('d', 'draft', null)])).toBeNull();
  });
});

/**
 * THE TWO DEFECTS FOUND ON 2026-09-09, and the tests that would have caught
 * them.
 *
 * Both were latent: nothing publishes yet, so neither could fire. Both would
 * have produced the single worst outcome this product has — a post the owner
 * watched Shoogle accept, sitting in a tidy list of upcoming posts, which the
 * platform was always going to refuse.
 *
 *   1. MAX_SCHEDULE_HORIZON_DAYS was 90. Facebook documents at most 75, and
 *      arguably 30. Ninety exceeds both.
 *   2. MIN_SCHEDULE_LEAD_MINUTES was 5. Facebook requires 10.
 *
 * The fix is not a smaller constant — it is that the window belongs to the
 * TARGETS, not to the module.
 */
describe('the scheduling window belongs to the targets', () => {
  it('falls back to Shoogle’s own bounds when nothing is targeted yet', () => {
    const window = scheduleWindowFor([]);
    expect(window.minLeadMinutes).toBe(MIN_SCHEDULE_LEAD_MINUTES);
    expect(window.maxHorizonDays).toBe(MAX_SCHEDULE_HORIZON_DAYS);
    expect(window.minLeadSetBy).toBeNull();
    expect(window.maxHorizonSetBy).toBeNull();
  });

  it('lets Facebook tighten both bounds, and records that it did', () => {
    const window = scheduleWindowFor(['facebook']);
    expect(window.minLeadMinutes).toBe(10);
    expect(window.maxHorizonDays).toBe(30);
    expect(window.minLeadSetBy).toBe('facebook');
    expect(window.maxHorizonSetBy).toBe('facebook');
  });

  it('reports a platform with no documented window as unchecked, not as passing', () => {
    const window = scheduleWindowFor(['instagram']);
    expect(window.unverifiedFor).toEqual(['instagram']);
    // Shoogle's own bounds still apply — they are just not Instagram's.
    expect(window.minLeadMinutes).toBe(MIN_SCHEDULE_LEAD_MINUTES);
    expect(window.maxHorizonDays).toBe(MAX_SCHEDULE_HORIZON_DAYS);
  });

  it('intersects rather than averaging or picking the first target', () => {
    const window = scheduleWindowFor(['instagram', 'facebook', 'google_business']);
    // One post goes out at one instant, so the strictest bound wins outright.
    expect(window.minLeadMinutes).toBe(10);
    expect(window.maxHorizonDays).toBe(30);
    expect(window.unverifiedFor.sort()).toEqual(['google_business', 'instagram']);
  });

  it('is order-independent', () => {
    const a = scheduleWindowFor(['facebook', 'instagram']);
    const b = scheduleWindowFor(['instagram', 'facebook']);
    expect(a.minLeadMinutes).toBe(b.minLeadMinutes);
    expect(a.maxHorizonDays).toBe(b.maxHorizonDays);
  });
});

describe('validateSchedule honours each target’s window', () => {
  const minutesOut = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString();
  const daysOut = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

  it('DEFECT 1 — refuses a horizon Facebook would reject, which 90 days allowed', () => {
    const inSixtyDays = daysOut(60);

    // Shoogle's own ceiling is 90, so with no Facebook target this is fine.
    expect(validateSchedule(inSixtyDays, IST, NOW).ok).toBe(true);

    const result = validateSchedule(inSixtyDays, IST, NOW, ['facebook']);
    expect(result).toMatchObject({ ok: false, reason: 'beyond_horizon' });
    if (!result.ok) {
      expect(result.message).toMatch(/Facebook/);
      expect(result.message).toMatch(/30 days/);
    }
  });

  it('DEFECT 2 — enforces Facebook’s 10-minute floor, which 5 minutes allowed', () => {
    const inSevenMinutes = minutesOut(7);

    // Seven minutes clears Shoogle's own 5-minute floor.
    expect(validateSchedule(inSevenMinutes, IST, NOW).ok).toBe(true);

    const result = validateSchedule(inSevenMinutes, IST, NOW, ['facebook']);
    expect(result).toMatchObject({ ok: false, reason: 'too_soon' });
    if (!result.ok) {
      expect(result.message).toMatch(/Facebook/);
      expect(result.message).toMatch(/10 minutes/);
    }
  });

  it('accepts the exact boundaries rather than being off by one', () => {
    expect(validateSchedule(minutesOut(10), IST, NOW, ['facebook']).ok).toBe(true);
    expect(validateSchedule(daysOut(30), IST, NOW, ['facebook']).ok).toBe(true);
  });

  it('names the platform responsible, so the owner can act on the message', () => {
    // "too soon" is not something an owner can fix. "Facebook needs at least
    // 10 minutes' notice" is.
    const result = validateSchedule(minutesOut(6), IST, NOW, ['instagram', 'facebook']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Facebook needs at least 10 minutes/);
  });

  it('does not tighten anything for a post that only targets Instagram', () => {
    // Instagram documents no window, so Shoogle's bounds stand unchanged.
    expect(validateSchedule(minutesOut(7), IST, NOW, ['instagram']).ok).toBe(true);
    expect(validateSchedule(daysOut(60), IST, NOW, ['instagram']).ok).toBe(true);
  });
});
