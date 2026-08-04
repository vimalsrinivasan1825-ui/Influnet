/**
 * OTA update lifecycle, surfaced to the user instead of applied invisibly.
 *
 * expo-updates' default behaviour is silent: it checks and downloads in the
 * background on cold start, and the new code only takes effect on the NEXT
 * cold start — with no UI at any point. A tester sitting on a stale build has
 * no way to know one exists, which is exactly how "this doesn't work" reports
 * kept turning out to be an update nobody knew to apply.
 *
 * State machine: idle -> available -> downloading -> ready -> (reload).
 * `ready` escalates to a mandatory restart after a grace period so an update
 * does not sit downloaded-but-unapplied indefinitely.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';
import { logger } from './logger';

export type AppUpdateState = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

/** How long a downloaded-but-unapplied update is allowed to sit before the
 *  banner escalates to a full-screen, undismissable restart prompt. */
const FORCE_RESTART_AFTER_MS = 5 * 60_000;

export function useAppUpdate(enabled: boolean) {
  const [state, setState] = useState<AppUpdateState>('idle');
  const [forceRestart, setForceRestart] = useState(false);
  const forceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the AppState listener from re-checking mid-flow (downloading, or
  // already sitting on a ready-to-apply update).
  const stateRef = useRef(state);
  stateRef.current = state;

  const check = useCallback(async () => {
    if (!enabled || !Updates.isEnabled) return;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) setState((s) => (s === 'idle' ? 'available' : s));
    } catch (err) {
      // A failed check is not an error state worth surfacing — it just means
      // try again next time (next cold start, or next foreground).
      logger.debug('[app-update] check failed', { err });
    }
  }, [enabled]);

  const download = useCallback(async () => {
    setState('downloading');
    try {
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        setState('ready');
      } else {
        // Nothing actually new after all (e.g. two devices raced the same
        // check) — nothing to apply, quietly go back to idle.
        setState('idle');
      }
    } catch (err) {
      logger.warn('[app-update] download failed', { err });
      setState('error');
    }
  }, []);

  const restart = useCallback(() => {
    void Updates.reloadAsync();
  }, []);

  const dismiss = useCallback(() => {
    // Session-only — checkForUpdateAsync finds the same update again on the
    // next cold start, so declining once does not lose it.
    setState('idle');
  }, []);

  // Check once on mount, and again whenever the app returns to the
  // foreground — a tester who leaves the app backgrounded across a publish
  // should not have to force-quit it themselves to find out.
  useEffect(() => {
    if (!enabled) return;
    void check();
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active' && stateRef.current === 'idle') void check();
    });
    return () => sub.remove();
  }, [enabled, check]);

  // Grace period: once downloaded, escalate to a mandatory prompt rather than
  // leaving a working fix sitting unapplied on the device indefinitely.
  useEffect(() => {
    if (state === 'ready') {
      forceTimer.current = setTimeout(() => setForceRestart(true), FORCE_RESTART_AFTER_MS);
    } else {
      setForceRestart(false);
    }
    return () => {
      if (forceTimer.current) clearTimeout(forceTimer.current);
    };
  }, [state]);

  return { state, forceRestart, download, restart, dismiss };
}
