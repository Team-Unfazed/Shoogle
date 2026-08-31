import {
  bySoonestDue,
  formatNextUpLabel,
  formatScheduleLabel,
  instantAtZonedTime,
  isDue,
  MAX_SCHEDULE_HORIZON_DAYS,
  MIN_SCHEDULE_LEAD_MINUTES,
  nextDuePost,
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
