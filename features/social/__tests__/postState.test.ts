import {
  canTransition,
  DRAFT_LIKE_STATES,
  isTerminal,
  nextState,
  POST_EVENTS,
  POST_STATE_LABEL,
  POST_STATES,
  toSharedStatus,
  transition,
  TRANSITIONS,
  type PostState,
} from '../postState';

/**
 * The lifecycle is the load-bearing part of this feature: every dishonest
 * outcome the product must avoid ("Published" without a provider confirming,
 * generated content surviving a failed generation) is an illegal edge here.
 * These tests assert the edges that must NOT exist as carefully as the ones
 * that must.
 */
describe('post lifecycle', () => {
  it('declares a transition table for every state', () => {
    for (const state of POST_STATES) {
      expect(TRANSITIONS[state]).toBeDefined();
    }
  });

  it('only ever moves to a declared state', () => {
    for (const state of POST_STATES) {
      for (const event of POST_EVENTS) {
        const next = nextState(state, event);
        if (next !== null) expect(POST_STATES).toContain(next);
      }
    }
  });

  it('treats published as terminal — nothing un-publishes a live post', () => {
    expect(isTerminal('published')).toBe(true);
    for (const event of POST_EVENTS) {
      expect(nextState('published', event)).toBeNull();
    }
  });

  it('has no path from scheduled straight to published', () => {
    for (const event of POST_EVENTS) {
      expect(nextState('scheduled', event)).not.toBe('published');
    }
    // The only way in is through `publishing`, which is where the provider
    // call is made.
    expect(nextState('publishing', 'publish_succeeded')).toBe('published');
  });

  it('sends a failed generation back to draft, never forward to ready', () => {
    expect(nextState('generating', 'generation_failed')).toBe('draft');
    expect(nextState('generating', 'generation_succeeded')).toBe('ready');
    // A generating post cannot be scheduled out from under the generator.
    expect(canTransition('generating', 'scheduled')).toBe(false);
  });

  it('unschedules an edited post rather than silently keeping the slot', () => {
    expect(nextState('scheduled', 'content_edited')).toBe('draft');
  });

  it('keeps skip reachable from every state the owner can see, per rule 5', () => {
    for (const state of ['draft', 'ready', 'scheduled', 'failed'] as PostState[]) {
      expect(canTransition(state, 'skipped')).toBe(true);
    }
  });

  it('lets a skipped post come back', () => {
    expect(nextState('skipped', 'unskipped')).toBe('ready');
  });

  it('throws on an illegal transition rather than corrupting the post', () => {
    expect(() => transition('published', 'content_edited')).toThrow(/Illegal post transition/);
    expect(() => transition('draft', 'publish_started')).toThrow();
  });

  it('names every state for the owner', () => {
    for (const state of POST_STATES) {
      expect(POST_STATE_LABEL[state].length).toBeGreaterThan(0);
    }
  });

  it('narrows onto the shared PostStatus the badge understands', () => {
    expect(toSharedStatus('generating')).toBe('draft');
    expect(toSharedStatus('ready')).toBe('draft');
    expect(toSharedStatus('scheduled')).toBe('scheduled');
    expect(toSharedStatus('publishing')).toBe('publishing');
    expect(toSharedStatus('published')).toBe('published');
    expect(toSharedStatus('failed')).toBe('failed');
    expect(toSharedStatus('skipped')).toBe('skipped');
  });

  it('counts unfinished work as draft-like without counting scheduled posts', () => {
    expect(DRAFT_LIKE_STATES).toEqual(['draft', 'generating', 'ready']);
    expect(DRAFT_LIKE_STATES).not.toContain('scheduled');
    expect(DRAFT_LIKE_STATES).not.toContain('published');
  });
});
