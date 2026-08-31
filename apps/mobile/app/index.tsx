/**
 * Entry gate. Holds a spinner until the stored session has been read, then
 * routes once — signed out to the welcome screen, signed in to the tabs.
 *
 * Also the place a half-finished registration gets repaired. See below.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { palette, spacing } from '@influnet/tokens';
import { useSession, useSignOutAction } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { Button, Screen, Txt } from '@/components/ui';

type Recovery = 'idle' | 'running' | 'failed';

export default function Index() {
  const { session, profile, ready, loadingProfile, switching, loadProfile } = useSession();
  const { signOut, signingOut } = useSignOutAction();

  const [recovery, setRecovery] = useState<Recovery>('idle');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  /**
   * Signed in with no profile row — repair it rather than routing into an app
   * that has nobody home.
   *
   * How you get here: with email confirmation on, signUp returns no session, so
   * the profile can't be created at signup time. Mobile's completeSignup()
   * returns `needsConfirmation` and drops the wizard answers on the floor; web
   * stashes them in localStorage, which doesn't help if you confirm the email on
   * your phone. Either way you come back, log in, and have an auth user with no
   * profile — and this screen used to redirect you straight to /home, where
   * every screen reads a null profile and shows blanks.
   *
   * The answers survive on the auth user as user_metadata (both wizards pass
   * them to signUp as `options.data`), so an empty POST to /api/auth/register
   * asks the server to rebuild from those. It's idempotent, so a race with a
   * profile that just appeared is harmless.
   *
   * One attempt, gated on `recovery === 'idle'`: a retry loop against a
   * genuinely unrecoverable account (metadata missing, or mobile verification
   * that can't be inherited) would spin forever behind a spinner.
   */
  useEffect(() => {
    if (!ready || !session || profile || loadingProfile || recovery !== 'idle') return;

    let cancelled = false;
    setRecovery('running');

    (async () => {
      const res = await endpoints.register({});
      if (cancelled) return;

      if (res.ok) {
        // Kick verification as the wizard would have, then re-read the profile
        // so the redirect below has something to route on.
        void endpoints.startVerification({}).catch(() => {});
        await loadProfile();
        if (!cancelled) setRecovery('idle');
        return;
      }

      setRecoveryError(
        res.status === 403
          ? 'Your mobile verification expired before you confirmed your email. Please sign up again to re-verify your number.'
          : (res.error ??
            "We couldn't finish setting up your account. Please sign up again."),
      );
      setRecovery('failed');
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, session, profile, loadingProfile, recovery, loadProfile]);

  if (recovery === 'failed') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xl }}>
          <Txt variant="title1">We couldn’t finish your signup</Txt>
          <Txt variant="body" tone="soft">
            {recoveryError}
          </Txt>
          <Button label="Sign out" onPress={signOut} loading={signingOut} />
        </View>
      </Screen>
    );
  }

  if (!ready || switching || (session && !profile && (loadingProfile || recovery === 'running'))) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.surface,
        }}
      >
        <ActivityIndicator color={palette.contentMuted} />
      </View>
    );
  }

  if (!session) return <Redirect href="/welcome" />;

  // No approval gate here any more. Sending a collab request stopped being
  // blocked on admin approval on 2026-07-30 — the creator sees the sender's
  // approval status on the incoming request instead — and web gives an
  // unapproved business the whole dashboard behind a dismissible banner. This
  // redirect meant the same account was a full product on the desktop and a
  // locked door on the phone.
  //
  // It was wrong the other way too: it only caught `pending_review`, so a
  // REJECTED business (a real negative decision, and the one the server still
  // refuses outreach for) fell through to the tabs with no warning at all.
  //
  // Both states now surface as <ApprovalBanner /> in the tab shell, matching web.
  return <Redirect href="/home" />;
}
