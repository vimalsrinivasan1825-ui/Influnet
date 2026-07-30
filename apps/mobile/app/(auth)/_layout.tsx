import { Stack } from 'expo-router';
import { palette } from '@influnet/tokens';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.content,
        headerTitleStyle: { fontSize: 17, fontWeight: '600', color: palette.content },
        contentStyle: { backgroundColor: palette.surface },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      {/* No header title on the two mark-led screens — the AuthHeader below it
          already names the screen, and printing it twice looked like chrome
          nobody designed. The bare chevron keeps the back gesture discoverable. */}
      <Stack.Screen name="login" options={{ title: '' }} />
      <Stack.Screen name="forgot-password" options={{ title: '' }} />
      <Stack.Screen name="signup/index" options={{ title: '' }} />
      <Stack.Screen name="signup/creator" options={{ title: 'Creator sign-up' }} />
      <Stack.Screen name="signup/business" options={{ title: 'Business sign-up' }} />
      <Stack.Screen name="pending" options={{ headerShown: false }} />
    </Stack>
  );
}
