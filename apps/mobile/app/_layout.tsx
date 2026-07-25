import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palette } from '@influnet/tokens';
import { ThemeProvider } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { setUnauthorizedHandler } from '@/lib/api';
import { syncPushToken, usePushNotificationRouting } from '@/lib/push';
import { BrandSplash } from '@/components/brand/splash';

// Hold the native splash so the OS screen hands straight over to the animated
// one. Without this the app flashes its first route between the two.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const init = useSession((s) => s.init);
  const role = useSession((s) => s.profile?.role);
  const ready = useSession((s) => s.ready);
  const session = useSession((s) => s.session);
  const profile = useSession((s) => s.profile);
  const loadingProfile = useSession((s) => s.loadingProfile);

  const [introDone, setIntroDone] = useState(false);

  /**
   * The splash must outlast the *profile* fetch, not just the session read.
   *
   * `ready` only means the stored session has been unsealed. A signed-in user
   * still has a /api/profile round trip to go, and the entry gate renders a
   * bare ActivityIndicator for its duration — so exiting on `ready` handed a
   * polished logo straight over to a spinner. Waiting for the profile means the
   * first thing after the animation is the actual app.
   */
  const appReady = ready && !(session && !profile && loadingProfile);

  useEffect(() => init(), [init]);

  // Register (or re-register) this device's push token whenever a session
  // becomes active — covers first sign-in, a later app open with a stored
  // session, and switching accounts on the same device.
  useEffect(() => {
    if (session) void syncPushToken();
  }, [session]);

  usePushNotificationRouting(router, appReady);

  // Drop the native splash as soon as there is something of ours to show. The
  // animated splash stays on top until it has played out, so the session read
  // happens behind it rather than in front of a spinner.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  // A 401 from anywhere means the session died server-side. Clear it and send
  // the user to sign-in rather than leaving screens showing stale data.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void useSession.getState().signOut();
      router.replace('/login');
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* The whole app re-tints itself off the signed-in role. */}
        <ThemeProvider role={role}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerStyle: { backgroundColor: palette.surface },
              headerTitleStyle: { fontSize: 17, fontWeight: '600', color: palette.content },
              headerTintColor: palette.content,
              contentStyle: { backgroundColor: palette.surface },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
            <Stack.Screen name="activity" options={{ title: 'My activity' }} />
            <Stack.Screen name="connections" options={{ title: 'Connections' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            <Stack.Screen name="blocked-accounts" options={{ title: 'Blocked accounts' }} />
            <Stack.Screen name="verification" options={{ title: 'Verify Instagram' }} />
            <Stack.Screen name="creator/[id]" options={{ title: '' }} />
            <Stack.Screen name="requests/new" options={{ title: 'Send a request' }} />
            <Stack.Screen name="requests/[id]" options={{ title: 'Request' }} />
            <Stack.Screen name="conversations/[id]" options={{ title: '' }} />
            <Stack.Screen name="projects/[id]/index" options={{ title: 'Project' }} />
            <Stack.Screen name="projects/[id]/stage/[stage]" options={{ title: 'Stage' }} />
          </Stack>

          {/* Covers the first frame until the animation has played AND the
              stored session has been read, so no screen renders signed-out and
              then swaps to signed-in. */}
          {!introDone ? (
            <BrandSplash canExit={appReady} onDone={() => setIntroDone(true)} />
          ) : null}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
