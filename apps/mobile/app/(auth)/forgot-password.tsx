/**
 * Forgot password.
 *
 * The login screen had no way out of a forgotten password at all — the web app
 * has had /reset-password since launch, but on mobile a locked-out user's only
 * option was to go find the website themselves.
 *
 * The email's link deliberately lands on the WEB reset page
 * (`${API_BASE_URL}/reset-password`) rather than deep-linking back into the
 * app. Setting a new password needs the recovery token from the email to be
 * exchanged for a session, and the web page already does exactly that,
 * correctly. Routing it through a mobile deep link would mean reimplementing
 * that exchange plus universal-link setup on both platforms, for a flow a user
 * hits once. Sending them to a working page beats a half-built one.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { supabase, API_BASE_URL } from '@/lib/supabase';
import { AuthHeader } from '@/components/brand/auth-header';
import { Button, Card, Field, KeyboardAvoider, ScreenScroll, Txt } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const t = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendResetLink() {
    setBusy(true);
    setError(null);

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${API_BASE_URL}/reset-password`,
    });

    setBusy(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    // Deliberately not distinguishing "sent" from "no such account" — that
    // difference would let anyone probe which emails are registered.
    setSent(true);
  }

  const canSubmit = EMAIL_RE.test(email.trim()) && !busy;

  return (
    <KeyboardAvoider>
      <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing['2xl'], gap: t.spacing.lg }}>
        <AuthHeader
          title="Reset your password"
          subtitle="We'll email you a link to set a new one."
          compact
        />

        <View style={{ height: t.spacing.sm }} />

        {sent ? (
          <>
            <Card style={{ gap: t.spacing.sm, alignItems: 'center' }}>
              <MailCheck size={30} color={t.color.ok} />
              <Txt variant="bodyStrong" center>
                Check your email
              </Txt>
              <Txt variant="footnote" tone="muted" center>
                If an account exists for {email.trim()}, a reset link is on its way. Open it on
                any device to choose a new password, then come back here and sign in.
              </Txt>
            </Card>
            <Button label="Back to sign in" onPress={() => router.replace('/login')} />
          </>
        ) : (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (error) setError(null);
              }}
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@company.com"
              textContentType="emailAddress"
              onSubmitEditing={() => canSubmit && void sendResetLink()}
              returnKeyType="go"
              error={error}
            />

            <Button
              label="Send reset link"
              onPress={sendResetLink}
              loading={busy}
              disabled={!canSubmit}
            />

            <Button label="Back to sign in" variant="ghost" onPress={() => router.replace('/login')} />
          </>
        )}
      </ScreenScroll>
    </KeyboardAvoider>
  );
}
