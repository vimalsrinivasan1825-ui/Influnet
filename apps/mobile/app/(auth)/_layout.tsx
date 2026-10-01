import { Stack } from 'expo-router';
import { palette } from '@influnet/tokens';
import { fontFor } from '@/lib/fonts';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.content,
        headerTitleStyle: { fontSize: 17, fontFamily: fontFor('700'), color: palette.content },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: palette.surface },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      {/* No header title on the two mark-led screens — the AuthHeader below it
          already names the screen, and printing it twice looked like chrome
          nobody designed. The bare chevron keeps the back gesture discoverable. */}
      {/* Welcome, the role choice and log in draw their own back chevron and
          follow light/dark themselves, so no native bar over them. */}
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ title: '' }} />
      <Stack.Screen name="signup/index" options={{ headerShown: false }} />
      <Stack.Screen name="signup/creator" options={{ title: '' }} />
      <Stack.Screen name="signup/business" options={{ title: '' }} />
      <Stack.Screen name="pending" options={{ headerShown: false }} />
    </Stack>
  );
}
