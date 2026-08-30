/**
 * Area D — Hours & availability. Weight 13 (5+2+5+1).
 * docs/research/local-seo-methodology.md §2 area D.
 *
 * D3 (festival hours) is called out in the research as the highest-value
 * low-effort check in the whole audit, and the one generic SEO tooling misses.
 * Its honesty depends entirely on the calendar in ../data/india-holidays.ts
 * declaring what it does NOT know — read the header of that file.
 */

import type { BusinessCategory } from '@/types/domain';

import type { CheckDefinition, GbpTimePeriodObservation, WeekDay } from '../types';
import { INDIA_HOLIDAY_CALENDAR, findHolidaysInWindow } from '../data/india-holidays';

import {
  CAP_PATCHABLE_NO_METHOD,
  CAP_REGULAR_HOURS,
  addDays,
  fail,
  isoDate,
  need,
  notApplicable,
  notChecked,
  pass,
  readList,
  warn,
} from './helpers';

const ALL_DAYS: WeekDay[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

const DAY_LABEL: Record<WeekDay, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
  SATURDAY: 'Saturday',
  SUNDAY: 'Sunday',
};

/**
 * Minutes a single period covers. Google represents "open all day" as an open
 * time equal to the close time, so that is 1440 rather than 0 — reading it as
 * zero would invent a closed day.
 */
function periodMinutes(p: GbpTimePeriodObservation): number {
  if (p.openMinutes === p.closeMinutes) return 1440;
  return (p.closeMinutes - p.openMinutes + 1440) % 1440;
}

function minutesPerDay(periods: readonly GbpTimePeriodObservation[]): Map<WeekDay, number> {
  const totals = new Map<WeekDay, number>();
  for (const p of periods) {
    totals.set(p.day, (totals.get(p.day) ?? 0) + periodMinutes(p));
  }
  return totals;
}

/** D1 — are there any opening hours at all? Weight 5, critical. */
const D1: CheckDefinition = {
  id: 'D1',
  area: 'hours',
  weight: 5,
  scored: true,
  name: 'Regular hours set',
  severity: 'critical',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_REGULAR_HOURS,
  sources: ['gbp.info'],
  needs: ['location'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH and CALL_CLICKS over 28 days.',
  failureCheck: 'If the listing displays hours to a searcher today, our read of regularHours is wrong.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    // Hours Google never sent us are not hours the owner never set. Only a list
    // Google actually returned can be reported as empty.
    const periods = readList(location.regularHourPeriods);
    if (!periods.ok) return periods.evaluation;

    const days = minutesPerDay(periods.items);
    if (days.size === 0) {
      return fail({
        title: 'Your opening hours are missing',
        detail:
          'Google shows "Hours not available" on your listing, and many people will not risk the ' +
          'trip. Tell us when you open and close and we will set it today.',
        observation: 'regularHours.periods is empty.',
        evidence: ['Days with hours on Google: 0'],
      });
    }
    return pass();
  },
};

/** D2 — are the hours believable? Weight 2. */
const D2: CheckDefinition = {
  id: 'D2',
  area: 'hours',
  weight: 2,
  scored: true,
  name: 'Hours plausible',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_REGULAR_HOURS,
  sources: ['gbp.info', 'own'],
  needs: ['location', 'owner'],
  leadingIndicator: 'CALL_CLICKS outside the stated hours over 28 days.',
  failureCheck:
    'Some gyms, chemists and clinics genuinely trade 24x7. One owner confirmation makes this check ' +
    'not applicable for them forever.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'owner');
    if (!got.ok) return got.evaluation;
    const { location, owner } = got.data;

    const hours = readList(location.regularHourPeriods);
    if (!hours.ok) return hours.evaluation;

    const days = minutesPerDay(hours.items);
    if (days.size === 0) {
      return notApplicable('There are no hours set yet, so there is nothing to sanity-check.');
    }

    const outOfRange = hours.items.filter(
      (p) =>
        p.openMinutes < 0 || p.openMinutes > 1440 || p.closeMinutes < 0 || p.closeMinutes > 1440,
    );
    if (outOfRange.length > 0) {
      return fail({
        title: 'Your opening hours are not a real time',
        detail:
          'One of your day timings is stored as something that is not a clock time, so Google may ' +
          'show nothing at all for that day. Tell us the real timings and we will replace them.',
        observation: `${outOfRange.length} period(s) have out-of-range minute values.`,
        evidence: outOfRange.map((p) => `${DAY_LABEL[p.day]}: ${p.openMinutes}–${p.closeMinutes} min`),
      });
    }

    const openAllWeek = ALL_DAYS.every((d) => (days.get(d) ?? 0) > 0);
    const is24x7 = ALL_DAYS.every((d) => (days.get(d) ?? 0) >= 1440);

    if (is24x7) {
      if (owner.confirmed24x7 === true) return pass();
      const evidence = ['Google shows: open 24 hours, 7 days'];
      if (owner.confirmed24x7 === false) {
        return fail({
          title: "Google says you're open 24 hours, every day",
          detail:
            'You told us that is not right, so customers are turning up to a closed shutter. Give ' +
            'us your real timings and we will set them.',
          observation: 'regularHours covers 24 hours on all 7 days; the owner said this is wrong.',
          evidence: [...evidence, 'You told Shoogle: that is not right'],
        });
      }
      // Never asked. We measured what Google shows; we have not measured the truth.
      return warn(0.5, {
        title: "Google says you're open 24 hours, every day — is that right?",
        detail:
          'If it is not, people are turning up to a closed shutter and blaming you for it. Tell us ' +
          'your real timings and we will fix it; if you really are always open, say so once and we ' +
          'will stop asking.',
        observation: 'regularHours covers 24 hours on all 7 days and the owner has never confirmed it.',
        evidence: [...evidence, 'You told Shoogle: nothing yet'],
        severity: 'minor',
        confidence: 'inferred',
      });
    }

    if (!openAllWeek) return pass();

    if (owner.confirmedNoWeeklyClosure === true) return pass();
    if (owner.confirmedNoWeeklyClosure === false) {
      return fail({
        title: 'Google shows you open every day, but you told us you have a weekly off',
        detail:
          'People are being told you are open on your closed day. Tell us which day you shut and we ' +
          'will take it off your listing.',
        observation: 'regularHours covers all 7 days; the owner said they close weekly.',
        evidence: ['Google shows: open all 7 days', 'You told Shoogle: you have a weekly off'],
      });
    }
    return warn(0.5, {
      title: 'Google shows you open all seven days',
      detail:
        'Plenty of salons and clinics shut one day a week. If you do, tell us which day and we will ' +
        'take it off your listing so nobody turns up to a closed shutter.',
      observation: 'regularHours covers all 7 days and the owner has never confirmed a weekly off.',
      evidence: ['Google shows: open all 7 days', 'You told Shoogle: nothing yet'],
      severity: 'minor',
      confidence: 'inferred',
    });
  },
};

const FESTIVAL_WINDOW_DAYS = 21;

/** D3 — festival and special hours. Weight 5. */
const D3: CheckDefinition = {
  id: 'D3',
  area: 'hours',
  weight: 5,
  scored: true,
  name: 'Festival & special hours',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  // §9 of the matrix confirms specialHours is writable, but the contract's
  // `updateBusinessHours(locationId, hours: unknown)` does not say it covers
  // special hours. Claiming a button we cannot honour is worse than a guide.
  capability: {
    apiSupportsWrite: true,
    providerMethod: null,
    matrixNote:
      'docs/research/google-business-profile.md §9: specialHours is writable via locations.patch, ' +
      'but no contract method is confirmed to write it. Blocker recorded for Sunny.',
  },
  sources: ['gbp.info', 'own'],
  needs: ['location', 'owner'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH on the festival day itself.',
  failureCheck:
    'If the calendar is stale or missing the festival, this check must say so rather than concluding ' +
    'that no festival is coming.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'owner');
    if (!got.ok) return got.evaluation;
    const { location, owner } = got.data;

    const today = isoDate(ctx.now);
    const windowEnd = addDays(today, FESTIVAL_WINDOW_DAYS);

    // A special-hours list Google never returned tells us nothing about whether
    // the festival is covered, so there is nothing here to score either way.
    const special = readList(location.specialHourPeriods);
    if (!special.ok) return special.evaluation;

    // Stale holiday hours are an observed fact and do not need the calendar.
    const periods = special.items;
    if (periods.length > 0 && periods.every((p) => p.endDate < today)) {
      const newest = periods.reduce((a, b) => (a.endDate > b.endDate ? a : b));
      return fail({
        title: 'Your holiday hours on Google are out of date',
        detail:
          `The special hours on your listing all ended on ${newest.endDate}. Old holiday hours ` +
          'sometimes keep showing, and they tell people you are shut when you are open. Clearing ' +
          'them is under Hours in the Google Business Profile app — we will show you where to tap.',
        observation: `All ${periods.length} specialHourPeriods ended before ${today}.`,
        evidence: [`Latest special hours end: ${newest.endDate}`, `Today: ${today}`],
      });
    }

    const { upcoming, windowFullyCovered } = findHolidaysInWindow(
      INDIA_HOLIDAY_CALENDAR,
      today,
      windowEnd,
      owner.stateCode,
    );

    if (upcoming.length === 0) {
      // The calendar knows it is incomplete (lunar festivals are not in it), so
      // "we found nothing" is NOT "nothing is coming". Say which one it is.
      if (!windowFullyCovered || owner.stateCode === null) {
        return notChecked(
          'insufficient_data',
          owner.stateCode === null
            ? 'We do not know which state you are in, so we cannot tell which festivals are coming up for you.'
            : 'Our festival calendar does not yet cover the next three weeks for your state.',
        );
      }
      return notApplicable('There is no festival in the next three weeks to set hours for.');
    }

    const next = upcoming[0];
    if (next === undefined) {
      return notChecked('insufficient_data', 'The festival calendar returned nothing usable.');
    }

    const covered = periods.some((p) => p.startDate <= next.date && p.endDate >= next.date);
    if (covered) return pass();

    const daysAway = Math.max(0, Math.round((Date.parse(next.date) - Date.parse(today)) / 86_400_000));
    return fail({
      title: `${next.name} is in ${daysAway} ${daysAway === 1 ? 'day' : 'days'} and your hours say normal`,
      detail:
        `Google still shows your usual timings for ${next.name}. Special hours for that one day ` +
        'go under Hours in the Google Business Profile app, and Google then shows a holiday note ' +
        'to everyone who searches for you that day. We will show you where to tap.',
      observation: `No specialHourPeriod covers ${next.date} (${next.name}).`,
      evidence: [
        `${next.name}: ${next.date}`,
        `Special hours covering that date: none`,
        `Calendar version: ${INDIA_HOLIDAY_CALENDAR.version}`,
      ],
    });
  },
};

const DEPARTMENT_HOURS_CATEGORIES: BusinessCategory[] = ['clinic', 'restaurant', 'gym'];

/** D4 — department hours. Weight 1, minor. */
const D4: CheckDefinition = {
  id: 'D4',
  area: 'hours',
  weight: 1,
  scored: true,
  name: 'Department hours',
  severity: 'minor',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('moreHours'),
  sources: ['gbp.info'],
  needs: ['location', 'owner'],
  leadingIndicator: 'CALL_CLICKS outside the main hours over 28 days.',
  failureCheck: 'Most single-counter shops have no second set of hours. Only ask where a department exists.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'owner');
    if (!got.ok) return got.evaluation;
    const { location, owner } = got.data;

    if (!DEPARTMENT_HOURS_CATEGORIES.includes(owner.business.category)) {
      return notApplicable('Your kind of business does not usually have separate department hours.');
    }

    const more = readList(location.moreHours);
    if (!more.ok) return more.evaluation;
    if (more.items.length > 0) return pass();

    const example =
      owner.business.category === 'clinic'
        ? 'doctor hours'
        : owner.business.category === 'restaurant'
          ? 'delivery hours'
          : 'staffed hours';
    return warn(0.5, {
      title: `Your ${example} are not listed separately`,
      detail:
        `If your ${example} are different from your shop timings, adding them separately stops ` +
        'people arriving at the wrong time. If they are the same, ignore this.',
      observation: 'moreHours is empty for a category that commonly uses it.',
      evidence: ['Separate hours listed: 0'],
    });
  },
};

export const AREA_D_CHECKS: CheckDefinition[] = [D1, D2, D3, D4];
