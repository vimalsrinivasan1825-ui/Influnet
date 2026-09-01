import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useTheme } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { AuthHeader } from '@/components/brand/auth-header';
import { Button, Field, KeyboardAvoider, ScreenScroll, Txt } from '@/components/ui';

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const adding = add === '1';
  const activateSession = useSession((s) => s.activateSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
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

    /**
     * Seed the store from the session we were just handed, rather than waiting
     * for onAuthStateChange to deliver it.
     *
     * This used to read only `error` and navigate straight away, which is a
     * race the user loses more often than not:
     *
     *   1. signInWithPassword resolves; the auth listener has NOT fired yet, so
     *      the store's `session` is still null.
     *   2. loadProfile() early-returns on `!get().session` — so no profile is
     *      fetched either, and it silently looks like it worked.
     *   3. router.replace('/') renders the gate, which sees `ready === true`
     *      (set at startup) and `session === null`, and redirects to /welcome.
     *
     * The symptom is the confusing one: a CORRECT password shows no error at
     * all and dumps you back on the Creator/Business chooser, because nothing
     * failed — the app simply asked "is there a session?" a few milliseconds
     * too early. Setting it explicitly makes the hand-off deterministic; the
     * listener firing afterwards with the same session is a harmless no-op.
     */
    if (!data.session) {
      // Only reachable if the project starts requiring email confirmation.
      // Better a plain sentence than a silent bounce back to the chooser.
      setError('Your email address has not been confirmed yet. Check your inbox and try again.');
      setBusy(false);
      return;
    }

    // `adding` = a second account was signed in while another was live. That
    // path has to tear the previous account's caches/connections down and
    // remount, or the app keeps showing the old account's data.
    await activateSession(data.session, adding);
    setBusy(false);
    router.replace('/');
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <KeyboardAvoider>
      <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing['2xl'], gap: t.spacing.lg }}>
        <AuthHeader
          title={adding ? 'Add an account' : 'Welcome back'}
          subtitle={
            adding
              ? 'Sign in to another account — you can switch between them any time.'
              : 'Sign in to pick up where you left off.'
          }
          compact
        />

        <View style={{ height: t.spacing.sm }} />

        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          // No keyboardType. "email-address" was the only thing that made this
          // field differ from the password field below — same component, same
          // everything else — and it was the one where the caret went missing
          // and text could not be repositioned. Android maps it to
          // TYPE_TEXT_VARIATION_EMAIL_ADDRESS, which third-party keyboards
          // handle inconsistently. The cost is the dedicated "@" key; autofill
          // and lower-casing still work via autoComplete/autoCapitalize.
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
          label="Forgot password?"
          variant="ghost"
          onPress={() => router.push('/forgot-password')}
        />

        <Button
          label="Create an account"
          variant="ghost"
          onPress={() => (adding ? router.push('/signup') : router.replace('/signup'))}
        />
      </ScreenScroll>
    </KeyboardAvoider>
  );
}
