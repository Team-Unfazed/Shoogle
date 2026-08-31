/**
 * The owner's stop switch, and where it is kept. Owner: Pranay.
 *
 * Product rule 5: "Skip and pause must always be easy." A pause that is
 * forgotten when the app restarts is not a pause — the owner would stop the
 * agent, close the app, and find it running again. So the preference is
 * written to device storage before the UI changes, not after.
 *
 * THREE DECISIONS WORTH KNOWING
 * ----------------------------
 * 1. THE WRITE COMES FIRST. `setPaused` awaits the store and only then reports
 *    the new value. An optimistic flip would tell the owner they had stopped
 *    the agent when the write had failed — the same class of lie as an
 *    optimistic "Published" toast (CONTRIBUTING.md rule 5).
 * 2. LOADING IS NOT "NOT PAUSED". The hook starts at `loading()`, never at
 *    `{ paused: false }`. `resolveAgentStatus` reads the loading state as
 *    "checking" rather than as permission to act.
 * 3. AN UNREADABLE VALUE BLOCKS. If storage returns something this module
 *    cannot parse, the state is an error, which resolves to
 *    `pause_state_unknown` and stops the agent. Defaulting a corrupt value to
 *    "not paused" would be Shoogle deciding, on the owner's behalf, that they
 *    had not asked it to stop.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { failed, loading, ready, type DataState } from '@/lib/state/DataState';

import type { AgentPausePreference } from './model';

/** Versioned, so a future shape change cannot be misread as the current one. */
export const AGENT_PAUSE_STORAGE_KEY = 'shoogle.gbp.agent.pause.v1';

/** The seam. Injected in tests; defaults to the device store. */
export interface AgentPauseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const deviceAgentPauseStorage: AgentPauseStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

const CORRUPT_MESSAGE =
  'Shoogle could not read whether you had paused it. Rather than assume you had not, it has stopped.';

const READ_FAILED_MESSAGE =
  'Shoogle could not open its own settings on this device, so it does not know whether you paused it. It has stopped rather than guess.';

const WRITE_FAILED_MESSAGE =
  'That could not be saved on this device, so nothing was changed. Shoogle will not tell you it stopped when it has not.';

/**
 * Parse a stored value.
 *
 * Returns null for anything that is not exactly the shape written by this
 * module. Null means unknown, and unknown blocks — see the header.
 */
export function parsePausePreference(raw: string | null): AgentPausePreference | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record: Record<string, unknown> = { ...parsed };
  const paused = record['paused'];
  const changedAt = record['changedAt'];
  if (typeof paused !== 'boolean') return null;
  if (changedAt !== null && typeof changedAt !== 'string') return null;
  return { paused, changedAt };
}

export type PauseWriteOutcome = { ok: true } | { ok: false; message: string };

export interface UseAgentPauseResult {
  state: DataState<AgentPausePreference>;
  /** Resolves once the store has confirmed. Never reports success it did not get. */
  setPaused: (paused: boolean) => Promise<PauseWriteOutcome>;
  /** True while a write is in flight, so the button can show it is busy. */
  busy: boolean;
}

export interface UseAgentPauseOptions {
  storage?: AgentPauseStorage;
  now?: () => string;
}

export function useAgentPause(options: UseAgentPauseOptions = {}): UseAgentPauseResult {
  const storage = options.storage ?? deviceAgentPauseStorage;
  const now = options.now ?? (() => new Date().toISOString());

  const [state, setState] = useState<DataState<AgentPausePreference>>(loading());
  const [busy, setBusy] = useState(false);

  /**
   * The seams are captured once, on mount.
   *
   * A store is not a value that should change under a mounted screen, and
   * pinning it here means the read effect below depends on nothing that
   * changes — so the device is read exactly once per mount rather than on
   * every render of the agent screen.
   */
  const [seams] = useState(() => ({ storage, now }));

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await seams.storage.getItem(AGENT_PAUSE_STORAGE_KEY);
        if (cancelled) return;
        if (raw === null) {
          // Never set is a real, knowable answer: the owner has not paused it.
          setState(ready({ paused: false, changedAt: null }, seams.now()));
          return;
        }
        const parsed = parsePausePreference(raw);
        setState(
          parsed === null
            ? failed('agent_pause_corrupt', CORRUPT_MESSAGE, false)
            : ready(parsed, seams.now()),
        );
      } catch {
        if (!cancelled) setState(failed('agent_pause_read_failed', READ_FAILED_MESSAGE, true));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [seams]);

  const setPaused = useCallback(async (paused: boolean): Promise<PauseWriteOutcome> => {
    const next: AgentPausePreference = { paused, changedAt: seams.now() };
    setBusy(true);
    try {
      await seams.storage.setItem(AGENT_PAUSE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setBusy(false);
      return { ok: false, message: WRITE_FAILED_MESSAGE };
    }
    // Only now, after the store confirmed, is the new value reported.
    setState(ready(next, seams.now()));
    setBusy(false);
    return { ok: true };
  }, [seams]);

  return { state, setPaused, busy };
}
