import { fixtureVoiceOfMerchantStates } from '@/fixtures/gbp';
import {
  classifyVoiceOfMerchant,
  describeVoiceOfMerchant,
  toContractVerificationState,
  voiceOfMerchantGate,
  type VoiceOfMerchantOutcome,
} from '@/features/gbp/voiceOfMerchant';

/**
 * Voice of Merchant decides whether the entire Google surface can show
 * anything. For a small Indian business the unhappy branches are the LIKELY
 * ones, so all four are pinned here, along with the rule that nothing is ever
 * assumed healthy.
 */

describe('classifyVoiceOfMerchant', () => {
  it('recognises a healthy profile', () => {
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.healthy)).toEqual({
      kind: 'has_voice_of_merchant',
      hasBusinessAuthority: true,
    });
  });

  it('recognises each of the four documented remedial actions', () => {
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.verify).kind).toBe('verify');
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.wait).kind).toBe(
      'wait_for_voice_of_merchant',
    );
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.ownership_conflict).kind).toBe(
      'resolve_ownership_conflict',
    );
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.suspended)).toEqual({
      kind: 'comply_with_guidelines',
      reason: 'BUSINESS_LOCATION_SUSPENDED',
    });
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.disabled)).toEqual({
      kind: 'comply_with_guidelines',
      reason: 'BUSINESS_LOCATION_DISABLED',
    });
  });

  it('does not invent "no pending verification" when Google stayed silent', () => {
    // The owner may well have a postcard in the post. Absent means unknown.
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.verify)).toEqual({
      kind: 'verify',
      hasPendingVerification: null,
    });
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.verify_pending)).toEqual({
      kind: 'verify',
      hasPendingVerification: true,
    });
  });

  it('never assumes healthy when Google reports nothing', () => {
    expect(classifyVoiceOfMerchant(fixtureVoiceOfMerchantStates.silent).kind).toBe('indeterminate');
    expect(classifyVoiceOfMerchant({}).kind).toBe('indeterminate');
  });

  it('reports the most blocking action if Google somehow sets more than one', () => {
    const outcome = classifyVoiceOfMerchant({
      hasVoiceOfMerchant: false,
      verify: {},
      complyWithGuidelines: { recommendationReason: 'BUSINESS_LOCATION_SUSPENDED' },
    });
    expect(outcome.kind).toBe('comply_with_guidelines');
  });
});

describe('what each state means to an owner', () => {
  const outcomes: VoiceOfMerchantOutcome[] = [
    { kind: 'has_voice_of_merchant', hasBusinessAuthority: true },
    { kind: 'verify', hasPendingVerification: null },
    { kind: 'verify', hasPendingVerification: true },
    { kind: 'wait_for_voice_of_merchant' },
    { kind: 'resolve_ownership_conflict' },
    { kind: 'comply_with_guidelines', reason: 'BUSINESS_LOCATION_SUSPENDED' },
    { kind: 'comply_with_guidelines', reason: 'BUSINESS_LOCATION_DISABLED' },
    { kind: 'comply_with_guidelines', reason: 'RECOMMENDATION_REASON_UNSPECIFIED' },
    { kind: 'indeterminate' },
  ];

  it('gives every state its own explanation, in plain English', () => {
    const bodies = outcomes.map((outcome) => describeVoiceOfMerchant(outcome).body);
    expect(new Set(bodies).size).toBeGreaterThanOrEqual(7);
    for (const body of bodies) {
      expect(body.length).toBeGreaterThan(40);
      // No Google API jargon in front of a salon owner.
      expect(body).not.toMatch(/voice of merchant|VoiceOfMerchantState|hasBusinessAuthority/i);
    }
  });

  it('offers an action only where the owner can actually do something', () => {
    expect(describeVoiceOfMerchant({ kind: 'wait_for_voice_of_merchant' }).ownerAction).toBeNull();
    expect(describeVoiceOfMerchant({ kind: 'indeterminate' }).ownerAction).toBeNull();
    expect(
      describeVoiceOfMerchant({ kind: 'verify', hasPendingVerification: null }).ownerAction,
    ).toMatch(/verify/i);
    expect(describeVoiceOfMerchant({ kind: 'resolve_ownership_conflict' }).ownerAction).not.toBeNull();
  });

  it('only allows reading reviews when Google says the profile is live', () => {
    for (const outcome of outcomes) {
      const readable = describeVoiceOfMerchant(outcome).reviewsReadable;
      expect(readable).toBe(outcome.kind === 'has_voice_of_merchant');
    }
  });
});

describe('voiceOfMerchantGate', () => {
  it('lets a healthy profile through', () => {
    expect(
      voiceOfMerchantGate({ kind: 'has_voice_of_merchant', hasBusinessAuthority: false }),
    ).toBeNull();
  });

  it('maps the four actions onto distinct, honest unavailable states', () => {
    expect(voiceOfMerchantGate({ kind: 'verify', hasPendingVerification: null })).toMatchObject({
      status: 'unavailable',
      reason: 'not_supported',
    });
    expect(voiceOfMerchantGate({ kind: 'wait_for_voice_of_merchant' })).toMatchObject({
      reason: 'insufficient_data',
    });
    expect(voiceOfMerchantGate({ kind: 'resolve_ownership_conflict' })).toMatchObject({
      reason: 'not_supported',
    });
    expect(
      voiceOfMerchantGate({ kind: 'comply_with_guidelines', reason: 'BUSINESS_LOCATION_SUSPENDED' }),
    ).toMatchObject({ reason: 'not_supported' });
    expect(voiceOfMerchantGate({ kind: 'indeterminate' })).toMatchObject({
      reason: 'insufficient_data',
    });
  });

  it('never produces an empty or zero-flavoured message', () => {
    const blocked: VoiceOfMerchantOutcome[] = [
      { kind: 'verify', hasPendingVerification: null },
      { kind: 'wait_for_voice_of_merchant' },
      { kind: 'resolve_ownership_conflict' },
      { kind: 'comply_with_guidelines', reason: 'BUSINESS_LOCATION_DISABLED' },
      { kind: 'indeterminate' },
    ];
    for (const outcome of blocked) {
      const state = voiceOfMerchantGate(outcome);
      expect(state).not.toBeNull();
      expect(state?.message.length ?? 0).toBeGreaterThan(40);
      expect(state?.message).not.toMatch(/\b0 reviews\b/);
    }
  });
});

describe('projection onto the shared contract', () => {
  it('never calls anything verified except a live profile', () => {
    expect(
      toContractVerificationState({ kind: 'has_voice_of_merchant', hasBusinessAuthority: true }),
    ).toBe('verified');
    expect(toContractVerificationState({ kind: 'verify', hasPendingVerification: null })).toBe(
      'unverified',
    );
    expect(toContractVerificationState({ kind: 'verify', hasPendingVerification: true })).toBe(
      'pending',
    );
    expect(toContractVerificationState({ kind: 'wait_for_voice_of_merchant' })).toBe('pending');
    // The contract has no member for these, so they must not be guessed.
    expect(toContractVerificationState({ kind: 'resolve_ownership_conflict' })).toBe('unknown');
    expect(
      toContractVerificationState({
        kind: 'comply_with_guidelines',
        reason: 'BUSINESS_LOCATION_SUSPENDED',
      }),
    ).toBe('unknown');
    expect(toContractVerificationState({ kind: 'indeterminate' })).toBe('unknown');
  });
});
