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

async function getExpoPushToken(prompt: boolean): Promise<string | null> {
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
    // The OS shows its permission prompt ONCE; a "Don't allow" given without
    // context is permanent. So nothing asks here on app open: only the
    // explanation in components/push-prompt.tsx (shown after a meaningful
    // action) or the Settings switch passes `prompt: true`. Everyone who
    // already granted it, and every Android below 13, still registers silently.
    if (!prompt) return null;
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

/** The token this install last registered, so sign-out can switch off only this device. */
let registeredToken: string | null = null;

function deviceMeta() {
  return {
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined,
    appVersion: Constants.expoConfig?.version ?? undefined,
    osVersion: Device.osVersion ?? undefined,
  } as const;
}

/**
 * Registers this device's token with the server. Safe to call repeatedly — e.g.
 * on every app open, where it is SILENT: it registers only if permission was
 * already granted and never shows the OS prompt. Pass `{ prompt: true }` only
 * from a screen the person chose to turn notifications on from.
 */
export async function syncPushToken(opts: { prompt?: boolean } = {}): Promise<void> {
  const token = await getExpoPushToken(opts.prompt === true);
  if (!token) return;

  // The result was previously discarded, which hid the case where the column
  // is missing server-side — the app looked registered while the server had
  // nothing to push to.
  const res = await endpoints.registerPushToken<{ ok?: boolean; reason?: string }>(token, {
    ...deviceMeta(),
    permission: 'granted',
  });
  if (!res.ok || res.data?.ok !== true) {
    console.warn('[push] server did not store the push token:', res.data?.reason ?? res.error);
    return;
  }
  registeredToken = token;
  console.log('[push] registered device token with the server');
}

/**
 * Switches off THIS device server-side on sign-out, so a shared or reset
 * device stops receiving the previous account's pushes — without silencing the
 * same account's other phones (migration 156).
 *
 * Awaitable on purpose. Fired and forgotten, this request raced
 * supabase.auth.signOut() and usually reached the network *after* the token was
 * gone — so it neither cleared anything server-side nor authenticated, and the
 * resulting 401 was one of the strays that kept re-triggering sign-out.
 */
export async function clearPushToken(): Promise<void> {
  await endpoints.registerPushToken(null, registeredToken ? { deviceToken: registeredToken } : undefined);
  registeredToken = null;
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

    const handle = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data as
        | { link?: unknown; delivery_id?: unknown }
        | undefined;
      // Broadcast opens are reported back so the admin can see whether anyone
      // actually tapped (migration 157). Best-effort, never blocks navigation.
      const deliveryId = Number(data?.delivery_id);
      if (Number.isFinite(deliveryId) && deliveryId > 0) {
        void endpoints.markNotificationOpened(deliveryId).catch(() => {});
      }
      const link = data?.link;
      const href = typeof link === 'string' ? toMobileHref(link) : null;
      if (href) routerRef.current.push(href);
    };

    // Cold start: the app was launched BY tapping a notification.
    void Notifications.getLastNotificationResponseAsync().then(handle);

    // Warm: the app was already running (foreground or background).
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [ready]);
}

/** The OS-level state, reduced to what the app's rules and Settings row need. */
export async function getPushOsStatus(): Promise<'undetermined' | 'granted' | 'denied'> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' || status === 'denied' ? status : 'undetermined';
  } catch {
    return 'undetermined';
  }
}
