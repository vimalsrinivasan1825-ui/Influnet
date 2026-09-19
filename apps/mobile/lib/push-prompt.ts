/**
 * Asking for push notifications at a moment that earns it.
 *
 * Until now the OS prompt fired the instant a session existed, before the
 * person had seen why. iOS and Android show that prompt once; a reflexive
 * "Don't allow" is permanent. Now nothing asks on app open (see
 * lib/push.ts). Instead, after a first-hand meaningful action (a request sent,
 * received or accepted, a project started) call `maybeAskForPush(moment)`,
 * which shows components/push-prompt.tsx: a short explanation, then the OS
 * prompt only if the person says yes.
 *
 * The decision rules are pure and tested in packages/core/src/push-prompt.ts;
 * this file supplies the inputs (OS status, device, stored state) and the store
 * the prompt component reads. State is per account in AsyncStorage, for the same
 * reason as lib/use-first-milestone.ts: no migration needed, and the failure mode
 * (a second device asks once more) is the acceptable direction.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { create } from 'zustand';
import {
  afterPushDismissed,
  parsePushPromptState,
  shouldAskForPush,
  type PushMoment,
} from '@influnet/core';
import { useSession } from './session';
import { getPushOsStatus, syncPushToken } from './push';

const KEY_PREFIX = 'push-prompt:';
/** Let the screen that triggered this settle (a `router.replace`, a toast) before covering it. */
const SETTLE_MS = 700;

interface PushPromptStore {
  moment: PushMoment | null;
  show: (moment: PushMoment) => void;
  hide: () => void;
}

export const usePushPromptStore = create<PushPromptStore>((set) => ({
  moment: null,
  show: (moment) => set({ moment }),
  hide: () => set({ moment: null }),
}));

// One prompt per app run: a second meaningful action in the same session must
// not ask again while the first is still on screen or was just answered.
let askedThisRun = false;

const userId = () => useSession.getState().session?.user.id ?? null;

/** Call after a meaningful action. Cheap and safe to call every time: it decides for itself. */
export async function maybeAskForPush(moment: PushMoment): Promise<void> {
  try {
    const uid = userId();
    if (!uid || askedThisRun) return;
    const [osStatus, raw] = await Promise.all([getPushOsStatus(), AsyncStorage.getItem(KEY_PREFIX + uid).catch(() => null)]);
    const ask = shouldAskForPush({
      osStatus,
      isPhysicalDevice: Device.isDevice,
      state: parsePushPromptState(raw),
      now: Date.now(),
    });
    if (!ask) return;
    askedThisRun = true;
    setTimeout(() => usePushPromptStore.getState().show(moment), SETTLE_MS);
  } catch {
    // A prompt that fails to appear must never break the action that triggered it.
  }
}

/** "Turn on notifications": the OS prompt now, then register this device. */
export async function acceptPushPrompt(): Promise<void> {
  usePushPromptStore.getState().hide();
  await syncPushToken({ prompt: true });
}

/** "Not now": remember it so we do not nag. */
export async function dismissPushPrompt(): Promise<void> {
  usePushPromptStore.getState().hide();
  const uid = userId();
  if (!uid) return;
  const raw = await AsyncStorage.getItem(KEY_PREFIX + uid).catch(() => null);
  await AsyncStorage.setItem(KEY_PREFIX + uid, JSON.stringify(afterPushDismissed(parsePushPromptState(raw), Date.now()))).catch(() => {});
}
