/**
 * The local half of the verification nudge: whether this device has already
 * shown what it is about to show.
 *
 * The decision itself — celebrate / action / progress / none — lives in
 * @influnet/core so web and mobile cannot drift on it and so it can be tested.
 * Two pieces of "have we already done this?" state belong here instead:
 *
 *  - the badge celebration must fire ONCE. It marks a transition, and a
 *    transition re-announced on every cold start is an annoyance, not a moment.
 *  - the progress card is dismissible, but only until something changes.
 *
 * Deliberately AsyncStorage and not a column. The equivalent server-side flag
 * would need a migration, and migrations on this project reach the hosted
 * databases well after the code does — a client reading a column that is not
 * there yet is a broken Home screen for everyone. The cost is that a creator
 * with two devices may see the celebration twice, which is the right way round
 * for something whose failure mode is a repeated congratulation.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  decideVerificationNudge,
  verificationStateKey,
  type VerificationNudge,
} from '@influnet/core';
import type { VerificationSummary } from '@/components/verification-status-card';

const CELEBRATED_PREFIX = 'influnet:verified-celebrated:';
const DISMISSED_PREFIX = 'influnet:verification-card-dismissed:';

export function useVerificationNudge(
  userId: string | null | undefined,
  summary: VerificationSummary | null | undefined,
) {
  // `null` while unread: rendering the celebration before storage answers would
  // flash it at someone who has already seen it.
  const [celebrated, setCelebrated] = useState<boolean | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setCelebrated(null);
      setDismissedKey(null);
      return;
    }
    void (async () => {
      const [seen, dismissed] = await Promise.all([
        AsyncStorage.getItem(CELEBRATED_PREFIX + userId).catch(() => null),
        AsyncStorage.getItem(DISMISSED_PREFIX + userId).catch(() => null),
      ]);
      if (cancelled) return;
      setCelebrated(seen === '1');
      setDismissedKey(dismissed);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markCelebrated = useCallback(() => {
    setCelebrated(true);
    if (userId) void AsyncStorage.setItem(CELEBRATED_PREFIX + userId, '1').catch(() => {});
  }, [userId]);

  const dismiss = useCallback(() => {
    if (!summary) return;
    const key = verificationStateKey(summary);
    setDismissedKey(key);
    if (userId) void AsyncStorage.setItem(DISMISSED_PREFIX + userId, key).catch(() => {});
  }, [userId, summary]);

  // Nothing at all until storage has answered — see `celebrated === null`.
  let nudge: VerificationNudge = 'none';
  if (celebrated !== null && summary) {
    nudge = decideVerificationNudge(summary, { celebrated });
    // A dismissal applies to the state it was made against, not forever.
    if (nudge === 'progress' && dismissedKey === verificationStateKey(summary)) {
      nudge = 'none';
    }
  }

  return { nudge, markCelebrated, dismiss };
}
