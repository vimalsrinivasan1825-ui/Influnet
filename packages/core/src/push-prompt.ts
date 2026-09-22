/**
 * When to ask a person to turn on push notifications.
 *
 * The operating system lets an app ask for notification permission ONCE. If the
 * person taps "Don't allow" on a prompt they have no context for, the app can
 * never ask again; they have to dig through system Settings. So the app asks
 * only after something has happened that makes the value obvious (a request
 * sent, a request received, a request accepted, a project started), first shows
 * its own short explanation, and only then triggers the OS prompt.
 *
 * This file is the rules, kept pure so they can be tested. The mobile app
 * (apps/mobile/lib/push-prompt.ts) supplies the inputs and does the asking.
 */

/** The moments that count as "meaningful". Each one is a first-hand experience of why push matters. */
export type PushMoment = 'request_sent' | 'request_received' | 'request_accepted' | 'project_started';

/** Mirrors expo-notifications' permission status, reduced to what the rules need. */
export type PushOsStatus = 'undetermined' | 'granted' | 'denied';

export interface PushPromptState {
  /** How many times the person has tapped "Not now" on our explanation. */
  dismissCount: number;
  /** Epoch ms of the last "Not now", or null if never. */
  lastDismissedAt: number | null;
}

export const INITIAL_PUSH_PROMPT_STATE: PushPromptState = { dismissCount: 0, lastDismissedAt: null };

/** After "Not now", wait this long before asking again. */
export const PUSH_REASK_AFTER_DAYS = 14;
/** After this many "Not now"s, stop asking; Settings still has the switch. */
export const PUSH_MAX_DISMISSALS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldAskForPush(input: {
  osStatus: PushOsStatus;
  /** False on simulators and emulators, which have no push service. */
  isPhysicalDevice: boolean;
  state: PushPromptState;
  now: number;
}): boolean {
  if (!input.isPhysicalDevice) return false;
  // Granted: nothing to ask. Denied: the OS will not show its prompt again, so
  // asking would only teach the person to ignore us; Settings has the way in.
  if (input.osStatus !== 'undetermined') return false;
  if (input.state.dismissCount >= PUSH_MAX_DISMISSALS) return false;
  if (input.state.lastDismissedAt !== null && input.now - input.state.lastDismissedAt < PUSH_REASK_AFTER_DAYS * DAY_MS) {
    return false;
  }
  return true;
}

/** The state after a "Not now". */
export function afterPushDismissed(state: PushPromptState, now: number): PushPromptState {
  return { dismissCount: state.dismissCount + 1, lastDismissedAt: now };
}

/** Tolerant parse of what was persisted: anything odd falls back to "never asked". */
export function parsePushPromptState(raw: string | null | undefined): PushPromptState {
  if (!raw) return INITIAL_PUSH_PROMPT_STATE;
  try {
    const v = JSON.parse(raw) as Partial<PushPromptState>;
    const dismissCount = typeof v.dismissCount === 'number' && v.dismissCount >= 0 ? Math.floor(v.dismissCount) : 0;
    const lastDismissedAt = typeof v.lastDismissedAt === 'number' && Number.isFinite(v.lastDismissedAt) ? v.lastDismissedAt : null;
    return { dismissCount, lastDismissedAt };
  } catch {
    return INITIAL_PUSH_PROMPT_STATE;
  }
}

/** The one line that ties the prompt to the thing that just happened. */
export function pushPromptLead(moment: PushMoment): string {
  switch (moment) {
    case 'request_sent':
      return "Your request is on its way. We'll tell you the moment they reply.";
    case 'request_received':
      return 'You have a request waiting. Turn on notifications so the next one never sits unseen.';
    case 'request_accepted':
      return "You're connected. We'll tell you when they message you or the next step is yours.";
    case 'project_started':
      return 'Your project has started. Each step needs both of you, so we can tell you when it is your move.';
  }
}
