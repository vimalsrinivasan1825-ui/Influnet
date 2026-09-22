import { describe, it, expect } from 'vitest';
import {
  INITIAL_PUSH_PROMPT_STATE,
  PUSH_MAX_DISMISSALS,
  PUSH_REASK_AFTER_DAYS,
  afterPushDismissed,
  parsePushPromptState,
  pushPromptLead,
  shouldAskForPush,
  type PushMoment,
} from '@influnet/core';

/**
 * The OS allows ONE permission prompt; a "Don't allow" given without context
 * is permanent. These rules decide when the app spends that one chance.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 19, 12, 0, 0);
const base = { osStatus: 'undetermined' as const, isPhysicalDevice: true, state: INITIAL_PUSH_PROMPT_STATE, now: NOW };

describe('shouldAskForPush', () => {
  it('asks a fresh, undecided person on a real phone', () => {
    expect(shouldAskForPush(base)).toBe(true);
  });

  it('never asks when permission is already granted (registration is silent)', () => {
    expect(shouldAskForPush({ ...base, osStatus: 'granted' })).toBe(false);
  });

  it('never asks when the OS has denied it: the system will not show its prompt again', () => {
    expect(shouldAskForPush({ ...base, osStatus: 'denied' })).toBe(false);
  });

  it('never asks on a simulator or emulator', () => {
    expect(shouldAskForPush({ ...base, isPhysicalDevice: false })).toBe(false);
  });

  it('waits after "Not now", then asks again', () => {
    const state = afterPushDismissed(INITIAL_PUSH_PROMPT_STATE, NOW);
    expect(shouldAskForPush({ ...base, state, now: NOW + 1 * DAY })).toBe(false);
    expect(shouldAskForPush({ ...base, state, now: NOW + (PUSH_REASK_AFTER_DAYS - 1) * DAY })).toBe(false);
    expect(shouldAskForPush({ ...base, state, now: NOW + PUSH_REASK_AFTER_DAYS * DAY })).toBe(true);
  });

  it('gives up after the maximum number of "Not now"s', () => {
    let state = INITIAL_PUSH_PROMPT_STATE;
    for (let i = 0; i < PUSH_MAX_DISMISSALS; i++) state = afterPushDismissed(state, NOW);
    expect(shouldAskForPush({ ...base, state, now: NOW + 365 * DAY })).toBe(false);
  });
});

describe('afterPushDismissed', () => {
  it('counts and stamps without mutating the input', () => {
    const before = { dismissCount: 1, lastDismissedAt: 5 };
    const after = afterPushDismissed(before, 99);
    expect(after).toEqual({ dismissCount: 2, lastDismissedAt: 99 });
    expect(before).toEqual({ dismissCount: 1, lastDismissedAt: 5 });
  });
});

describe('parsePushPromptState', () => {
  it('round-trips what was saved', () => {
    const s = afterPushDismissed(INITIAL_PUSH_PROMPT_STATE, NOW);
    expect(parsePushPromptState(JSON.stringify(s))).toEqual(s);
  });

  it.each([[null], [undefined], [''], ['not json'], ['null'], ['[]'], ['{"dismissCount":"x","lastDismissedAt":"y"}'], ['{"dismissCount":-3}']])(
    'falls back to "never asked" for %j',
    (raw) => {
      expect(parsePushPromptState(raw as string | null | undefined)).toEqual(INITIAL_PUSH_PROMPT_STATE);
    },
  );
});

describe('pushPromptLead', () => {
  it.each<PushMoment>(['request_sent', 'request_received', 'request_accepted', 'project_started'])(
    'has a line for %s that says why, not just "allow notifications"',
    (moment) => {
      const line = pushPromptLead(moment);
      expect(line.length).toBeGreaterThan(20);
      expect(line).not.toMatch(/allow notifications/i);
    },
  );
});
