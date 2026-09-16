/**
 * The compose hook. Owner: Yash.
 *
 * Wraps the pure reducer and owns the two side effects the flow has:
 * generating per platform, and saving a draft. Everything else is a dispatch.
 *
 * ============== GENERATION FANS OUT, IT DOES NOT BATCH ======================
 *
 * `generateAll()` starts one independent request per selected platform and
 * settles them with `allSettled`. There is deliberately no combined promise
 * whose rejection could take the others down, and no shared "generating" flag:
 * each platform's status lives on its own draft entry, so Facebook failing
 * leaves Instagram's copy on screen and usable.
 *
 * That is product rule 13 at the interaction layer — the same rule
 * `availabilityFor` enforces by signature.
 */

import { useCallback, useMemo, useReducer, useState } from 'react';

import { unwrapOrNull } from '@/lib/state/DataState';

import { createSocialGenerator, type BusinessContext, type ContentObjective } from '../generation';
import { newUuid } from '../ids';
import type { PostStore } from '../store';
import type { Platform, SocialPost } from '../types';

import {
  advanceBlockedReason,
  composeReducer,
  initialComposeState,
  nextStep,
  previousStep,
  toDraftPost,
  type ComposeEvent,
  type ComposeState,
} from './state';

export interface UseComposeOptions {
  /** The business this post is for. */
  context: BusinessContext;
  /** Built by the caller from whichever `AiProvider` is appropriate. */
  generator: ReturnType<typeof createSocialGenerator> | null;
  /** Where a saved draft goes. In-memory for this milestone. */
  store: PostStore;
  now?: () => string;
  newId?: () => string;
}

export interface UseCompose {
  state: ComposeState;
  dispatch: (event: ComposeEvent) => void;
  /** Null when the owner may continue; otherwise why they may not. */
  blockedReason: string | null;
  canGoBack: boolean;
  goNext: () => void;
  goBack: () => void;
  /** Draft every selected platform, independently. */
  generateAll: () => Promise<void>;
  /** Draft one platform, leaving every other alone. */
  generateOne: (platform: Platform) => Promise<void>;
  /** True while at least one platform is being written. */
  isGenerating: boolean;
  saveDraft: () => Promise<SocialPost | null>;
  saving: boolean;
}

export function useCompose(options: UseComposeOptions): UseCompose {
  const [state, dispatch] = useReducer(composeReducer, undefined, initialComposeState);
  const [saving, setSaving] = useState(false);

  const now = options.now ?? (() => new Date().toISOString());
  // A saved draft is a persisted row, so its id has to be storable.
  const newId = options.newId ?? newUuid;

  const objectiveFor = useCallback(
    (platform: Platform): ContentObjective => ({
      kind: state.objective,
      brief: state.brief,
      language: state.language,
      platforms: [platform],
    }),
    [state.objective, state.brief, state.language],
  );

  const generateOne = useCallback(
    async (platform: Platform) => {
      if (options.generator === null) {
        dispatch({
          type: 'generation_failed',
          platform,
          message: 'Shoogle cannot write posts yet — generation is not switched on.',
        });
        return;
      }

      dispatch({ type: 'generation_started', platform });

      const result = await options.generator.draftFor(
        platform,
        options.context,
        objectiveFor(platform),
        { hasMedia: state.media.length > 0 },
      );

      const draft = unwrapOrNull(result);
      if (draft === null) {
        // The provider's own reason, not a generic one: "the free tier limit
        // was reached" and "nothing passed the checks" need different actions.
        const message =
          'message' in result && typeof result.message === 'string'
            ? result.message
            : 'Shoogle could not write this one.';
        dispatch({ type: 'generation_failed', platform, message });
        return;
      }

      dispatch({
        type: 'generation_succeeded',
        platform,
        text: draft.caption,
        modelId: draft.modelId,
      });
    },
    [options.generator, options.context, objectiveFor, state.media.length],
  );

  const generateAll = useCallback(async () => {
    // One request per platform, settled independently. No combined rejection.
    await Promise.allSettled(state.targets.map((platform) => generateOne(platform)));
  }, [state.targets, generateOne]);

  const saveDraft = useCallback(async () => {
    setSaving(true);
    try {
      const post = toDraftPost(state, options.context, now(), newId());
      const stored = await options.store.put(post);
      dispatch({ type: 'saved', postId: stored.id });
      return stored;
    } finally {
      setSaving(false);
    }
  }, [state, options.context, options.store, now, newId]);

  const blockedReason = useMemo(() => advanceBlockedReason(state), [state]);

  const goNext = useCallback(() => {
    if (advanceBlockedReason(state) !== null) return;
    const next = nextStep(state.step);
    if (next !== null && next !== 'saved') dispatch({ type: 'go_to', step: next });
  }, [state]);

  const goBack = useCallback(() => {
    const previous = previousStep(state.step);
    if (previous !== null) dispatch({ type: 'go_to', step: previous });
  }, [state.step]);

  const isGenerating = state.targets.some(
    (platform) => state.drafts[platform]?.status === 'generating',
  );

  return {
    state,
    dispatch,
    blockedReason,
    canGoBack: previousStep(state.step) !== null && state.step !== 'saved',
    goNext,
    goBack,
    generateAll,
    generateOne,
    isGenerating,
    saveDraft,
    saving,
  };
}
