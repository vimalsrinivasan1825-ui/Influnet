import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { Button, Field, ScreenScroll, Txt } from '@/components/ui';

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  const loadProfile = useSession((s) => s.loadProfile);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      // Supabase returns the same message for a bad password and an unknown
      // account, on purpose — don't dress it up into something more specific.
      setError(
        authError.message === 'Invalid login credentials'
          ? 'That email and password combination did not match an account.'
          : authError.message
      );
      setBusy(false);
      return;
    }

    await loadProfile();
    setBusy(false);
    router.replace('/');
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing.xl, gap: t.spacing.lg }}>
        <Txt variant="title1">Welcome back</Txt>

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@company.com"
          textContentType="emailAddress"
        />

        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          placeholder="Your password"
          onSubmitEditing={() => canSubmit && void signIn()}
          returnKeyType="go"
          right={
            <Pressable
              onPress={() => setShow((v) => !v)}
              hitSlop={10}
              accessibilityLabel={show ? 'Hide password' : 'Show password'}
            >
              {show ? (
                <EyeOff size={19} color={t.color.contentMuted} />
              ) : (
                <Eye size={19} color={t.color.contentMuted} />
              )}
            </Pressable>
          }
        />

        {error ? (
          <View
            style={{
              backgroundColor: t.color.dangerSoft,
              borderRadius: t.radii.md,
              padding: t.spacing.md,
            }}
          >
            <Txt variant="footnote" tone="danger">
              {error}
            </Txt>
          </View>
        ) : null}

        <Button label="Sign in" onPress={signIn} loading={busy} disabled={!canSubmit} />

        <Button
          label="Create an account"
          variant="ghost"
          onPress={() => router.replace('/signup')}
        />
      </ScreenScroll>
    </KeyboardAvoidingView>
  );
}
