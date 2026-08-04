import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palette } from '@influnet/tokens';
import { ThemeProvider } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { setUnauthorizedHandler } from '@/lib/api';
import { logger } from '@/lib/logger';
import { syncPushToken, usePushNotificationRouting } from '@/lib/push';
import { BrandSplash } from '@/components/brand/splash';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppUpdateBanner } from '@/components/app-update-banner';
import { identify, installGlobalErrorHandler, resetIdentity } from '@/lib/analytics';

// Hold the native splash so the OS screen hands straight over to the animated
// one. Without this the app flashes its first route between the two.
void SplashScreen.preventAutoHideAsync();

// Chain the JS crash handler at module scope so it is installed before any
// screen mounts — an error thrown during the very first render is exactly the
// kind we most need reported. No-op unless EXPO_PUBLIC_SENTRY_DSN is set.
installGlobalErrorHandler();

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

  // Attach analytics events to the signed-in user, and detach on sign-out so
  // the next account on a shared device is not merged into the previous one.
  // No-op unless EXPO_PUBLIC_POSTHOG_KEY is set.
  useEffect(() => {
    if (profile?.id) identify(profile.id, profile.role);
    else resetIdentity();
  }, [profile?.id, profile?.role]);

  usePushNotificationRouting(router, appReady);

  // Drop the native splash as soon as there is something of ours to show. The
  // animated splash stays on top until it has played out, so the session read
  // happens behind it rather than in front of a spinner.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  /**
   * A 401 on a request that carried a token means the session died server-side.
   * Clear it and send the user back through the entry gate rather than leaving
   * screens showing stale data.
   *
   * Three guards, because a dying session produces a *burst* of 401s (every
   * mounted screen revalidates at once) and the naive version turned each one
   * into its own sign-out + navigation — the flicker loop:
   *
   *   1. handling — at most one teardown is ever in flight.
   *   2. no session — if the store is already empty we are either mid-sign-out
   *      or signed out, and there is nothing left to react to.
   *   3. same session — the rejected token must still be the one we are using.
   *
   * Guard 3 is the subtle one. "Is there a session?" is not the same question as
   * "is it *this* session?". A request issued just before sign-out can take
   * seconds to come back; by then the next account may already be signed in, and
   * that stale 401 would sign the innocent new session out — a user who just
   * logged in gets bounced to the welcome screen for a request that was never
   * theirs. Comparing the token the request actually carried against the current
   * one makes the handler act only on its own session's failure.
   *
   * Destination is '/', not '/login': app/index.tsx is the single place that
   * decides where a given auth state belongs (signed out -> /welcome, pending
   * business -> /pending). Hard-coding a second destination here is what made
   * '/welcome' and '/login' fight each other. Sign-out completes *before* the
   * navigation so the gate reads a settled store — and the navigation is in
   * `finally`, because signOut() clears the store whether or not it throws, so
   * skipping the replace would strand the user on a session-less screen.
   *
   * The `catch` is not decoration. `try/finally` without one re-throws, so the
   * version that had only `finally` still produced the unhandled rejection it
   * was meant to remove — and inside a `void (async …)` there is nothing above
   * it to catch. Swallowed *and* logged: the navigation has to happen anyway,
   * but a teardown failure nobody can see is one nobody will fix.
   */
  const handlingUnauthorized = useRef(false);
  useEffect(() => {
    setUnauthorizedHandler((token: string) => {
      if (handlingUnauthorized.current) return;
      const session = useSession.getState().session;
      if (!session) return;
      if (session.access_token !== token) return;

      handlingUnauthorized.current = true;
      void (async () => {
        try {
          await useSession.getState().signOut();
        } catch (err) {
          logger.error('sign out after 401 failed', { err });
        } finally {
          router.replace('/');
          handlingUnauthorized.current = false;
        }
      })();
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* The whole app re-tints itself off the signed-in role. */}
        <ThemeProvider role={role}>
          <StatusBar style="dark" />
          {/* Inside ThemeProvider so the fallback screen is themed, and around
              the navigator so a render error in any screen is contained
              instead of unmounting the whole app. */}
          <ErrorBoundary label="root">
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
              <Stack.Screen name="verification-guide" options={{ title: 'How to verify' }} />
              <Stack.Screen name="search" options={{ title: 'Search' }} />
              <Stack.Screen name="creator/[username]" options={{ title: '' }} />
              <Stack.Screen name="portfolio/add" options={{ title: 'Add past work' }} />
              <Stack.Screen name="requests/new" options={{ title: 'Send a request' }} />
              <Stack.Screen name="requests/[id]" options={{ title: 'Request' }} />
              <Stack.Screen name="conversations/[id]" options={{ title: '' }} />
              <Stack.Screen name="projects/[id]/index" options={{ title: 'Project' }} />
              <Stack.Screen name="projects/[id]/stage/[stage]" options={{ title: 'Stage' }} />
              <Stack.Screen name="projects/[id]/change-requests" options={{ title: 'Change requests' }} />
              <Stack.Screen name="projects/[id]/activity" options={{ title: 'Activity' }} />
              <Stack.Screen name="projects/deleted" options={{ title: 'Deleted Projects' }} />
              <Stack.Screen name="edit-profile" options={{ title: 'Edit profile' }} />
              {/* Directory route: the screen name is the file path, so
                  app/support/index.tsx registers as "support/index" — same
                  convention as projects/[id]/index above. */}
              <Stack.Screen name="support/index" options={{ title: 'Help & support' }} />
              <Stack.Screen name="support/[id]" options={{ title: 'Conversation' }} />
              <Stack.Screen name="feedback" options={{ title: 'Send feedback' }} />
            </Stack>
          </ErrorBoundary>

          {/* Covers the first frame until the animation has played AND the
              stored session has been read, so no screen renders signed-out and
              then swaps to signed-in. */}
          {!introDone ? (
            <BrandSplash canExit={appReady} onDone={() => setIntroDone(true)} />
          ) : null}

          {/* Only after the intro has played — a download nudge fighting the
              splash animation for attention is the wrong first impression. */}
          <AppUpdateBanner enabled={introDone} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
