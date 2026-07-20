import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palette } from '@influnet/tokens';
import { ThemeProvider } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { setUnauthorizedHandler } from '@/lib/api';

export default function RootLayout() {
  const router = useRouter();
  const init = useSession((s) => s.init);
  const role = useSession((s) => s.profile?.role);

  useEffect(() => init(), [init]);

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
            <Stack.Screen name="verification" options={{ title: 'Verify Instagram' }} />
            <Stack.Screen name="creator/[username]" options={{ title: '' }} />
            <Stack.Screen name="requests/new" options={{ title: 'Send a request' }} />
            <Stack.Screen name="requests/[id]" options={{ title: 'Request' }} />
            <Stack.Screen name="conversations/[id]" options={{ title: '' }} />
            <Stack.Screen name="projects/[id]/index" options={{ title: 'Project' }} />
            <Stack.Screen name="projects/[id]/stage/[stage]" options={{ title: 'Stage' }} />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
