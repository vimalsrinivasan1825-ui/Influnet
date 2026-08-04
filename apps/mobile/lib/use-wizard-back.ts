/**
 * Keeps "back" inside a multi-step wizard instead of leaving it.
 *
 * The signup wizards are ONE expo-router screen that swaps its body per step,
 * so every back affordance the OS offers — the header chevron, the iOS swipe
 * gesture, the Android hardware button — popped the whole route from step 5 as
 * readily as from step 1. That dropped the user back on the welcome screen with
 * every answer gone, including a phone number they had just verified by SMS
 * (which is why signup then asked for a fresh OTP: `usePhoneOtp`'s token lives
 * in component state, and the component had been unmounted).
 *
 * All three affordances funnel through the navigator's `beforeRemove` event, so
 * intercepting there covers them together: past the first step it is cancelled
 * and turned into "one step back", and the screen never unmounts, so all
 * wizard state — OTP token included — survives untouched. On the first step it
 * is left alone, because leaving really is the right outcome there.
 */
import { useEffect } from 'react';
import { useNavigation } from 'expo-router';

export function useWizardBack(canStepBack: boolean, stepBack: () => void) {
  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: { preventDefault: () => void }) => {
      if (!canStepBack) return;
      e.preventDefault();
      stepBack();
    });
    return unsubscribe;
  }, [navigation, canStepBack, stepBack]);
}
