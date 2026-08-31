/**
 * The words. An audit that measures honestly and then says something misleading
 * has not been honest, so the vocabulary gets its own test.
 */

import type { UnavailableReason } from '@/lib/state/DataState';

import {
  coverageSentence,
  insufficientDataMessage,
  notCheckedReasonBody,
  notCheckedReasonLabel,
} from '../copy';
import type { NotCheckedReason } from '../types';

const ALL_REASONS: NotCheckedReason[] = [
  'not_connected',
  'auth_expired',
  'not_supported',
  'no_data_yet',
  'insufficient_data',
  'offline',
  'rate_limited',
  'requires_upgrade',
  'provider_error',
  'still_loading',
  'check_error',
];

describe('unchecked reasons', () => {
  it('has owner-facing words for every reason a check can fail to run', () => {
    for (const reason of ALL_REASONS) {
      expect(notCheckedReasonLabel(reason).length).toBeGreaterThan(3);
      expect(notCheckedReasonBody(reason).length).toBeGreaterThan(15);
    }
  });

  it('gives each reason its own distinct wording', () => {
    const labels = ALL_REASONS.map(notCheckedReasonLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('never blames Google for our own bug, and never blames us for Google', () => {
    // These are three different facts and must read as three different facts.
    expect(notCheckedReasonLabel('provider_error')).toBe("Google didn't respond");
    expect(notCheckedReasonLabel('check_error')).toBe("Shoogle couldn't finish this check");
    expect(notCheckedReasonLabel('no_data_yet')).toBe('nothing there yet');
    expect(notCheckedReasonBody('check_error')).toContain('fault on our side');
    expect(notCheckedReasonBody('provider_error')).toContain('Nothing is wrong with your listing');
  });

  it('borrows the app-wide copy for the reasons DataState already names', () => {
    const shared: UnavailableReason[] = ['not_connected', 'offline', 'requires_upgrade'];
    for (const reason of shared) {
      // Same vocabulary as the rest of the app, not a second opinion.
      expect(notCheckedReasonBody(reason).length).toBeGreaterThan(15);
    }
  });
});

describe('the coverage caveat', () => {
  it('says how much was checked, in plain numbers', () => {
    expect(coverageSentence(6, 33)).toBe('Shoogle checked 6 of 33 things.');
    expect(coverageSentence(1, 1)).toBe('Shoogle checked 1 of 1 thing.');
  });

  it('explains a missing score without implying the profile is bad', () => {
    const message = insufficientDataMessage(6, 33);
    expect(message).toContain('Shoogle checked 6 of 33 things.');
    expect(message).toContain("isn't enough to score your profile honestly");
    expect(message.toLowerCase()).not.toContain('poor');
    expect(message.toLowerCase()).not.toContain('bad');
    expect(message).not.toContain('0');
  });
});
