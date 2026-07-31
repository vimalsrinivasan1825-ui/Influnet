/**
 * Expo push notifications.
 *
 * Without this the app is read-mostly in a very specific way: notifyUser()
 * (apps/web/src/lib/notify.ts) already computes exactly who needs to hear
 * about what — a stage advanced, terms were proposed, an advance payment
 * landed — and used to only ever write a row nobody sees until they happen to
 * reopen the app. This registers the device so the same call also reaches the
 * lock screen, and routes a tap on it to the same in-app screen a
 * notification row already resolves to (see notification-link.ts).
 *
 * Push needs a development build or a standalone/TestFlight build — Expo Go
 * (SDK 53+) can no longer receive remote pushes, only local ones — so
 * registration quietly no-ops there instead of throwing.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { ImperativeRouter } from 'expo-router';
import { endpoints } from './api';
import { toMobileHref } from './notification-link';

// Foreground behaviour: still show something (banner + sound) rather than the
// default of swallowing it silently just because the app happens to be open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getExpoPushToken(): Promise<string | null> {
  // Simulators/emulators have no push service to register with.
  if (!Device.isDevice) {
    console.warn('[push] not a physical device — push tokens are unavailable here');
    return null;
  }

  if (Platform.OS === 'android') {
    // MAX, not DEFAULT. Android only shows a heads-up banner for HIGH and
    // above; at DEFAULT a new message lands silently in the shade, which for a
    // chat notification reads as nothing having happened at all.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Messages and updates',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    console.warn(`[push] notification permission not granted (status: ${status})`);
    return null;
  }

  const projectId: string | undefined =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[push] no EAS projectId configured — cannot request a push token');
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (err) {
    /**
     * The three ways this realistically fails, all silent until now:
     *   - Expo Go on SDK 53+, which can no longer receive remote pushes;
     *   - an Android build with no FCM credentials (no google-services.json /
     *     no `expo.android.googleServicesFile`), so there is no FCM sender to
     *     register with;
     *   - iOS without an APNs key on the build.
     * Each leaves expo_push_token NULL server-side, and the only visible
     * symptom is "pushes don't arrive" — so name it loudly here.
     */
    console.warn('[push] could not get an Expo push token:', err);
    return null;
  }
}

/** Registers this device's token with the server. Safe to call repeatedly — e.g. on every app open. */
export async function syncPushToken(): Promise<void> {
  const token = await getExpoPushToken();
  if (!token) return;

  // The result was previously discarded, which hid the case where the column
  // is missing server-side — the app looked registered while the server had
  // nothing to push to.
  const res = await endpoints.registerPushToken<{ ok?: boolean; reason?: string }>(token);
  if (!res.ok || res.data?.ok !== true) {
    console.warn('[push] server did not store the push token:', res.data?.reason ?? res.error);
    return;
  }
  console.log('[push] registered device token with the server');
}

/**
 * Clears the server-side token on sign-out, so a shared or reset device stops
 * receiving the previous account's pushes.
 *
 * Awaitable on purpose. Fired and forgotten, this request raced
 * supabase.auth.signOut() and usually reached the network *after* the token was
 * gone — so it neither cleared anything server-side nor authenticated, and the
 * resulting 401 was one of the strays that kept re-triggering sign-out.
 */
export async function clearPushToken(): Promise<void> {
  await endpoints.registerPushToken(null);
}

/**
 * Wires tapping a push notification to the same in-app route a notification
 * row already resolves to. Call once from the root layout with the router
 * from useRouter().
 *
 * `ready` gates the cold-start case: index.tsx's auth redirect hasn't run yet
 * while the stored session is still being read, and pushing a route before it
 * settles would race the initial `<Redirect>`. The warm-start listener isn't
 * gated — the app is already past that point by the time it can fire.
 */
export function usePushNotificationRouting(router: ImperativeRouter, ready: boolean) {
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!ready) return;

    // Cold start: the app was launched BY tapping a notification.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const link = response?.notification.request.content.data?.link;
      const href = typeof link === 'string' ? toMobileHref(link) : null;
      if (href) routerRef.current.push(href);
    });

    // Warm: the app was already running (foreground or background).
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const link = response.notification.request.content.data?.link;
      const href = typeof link === 'string' ? toMobileHref(link) : null;
      if (href) routerRef.current.push(href);
    });
    return () => subscription.remove();
  }, [ready]);
}
