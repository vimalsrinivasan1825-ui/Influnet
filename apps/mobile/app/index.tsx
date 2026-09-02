/**
 * Entry gate. Holds a spinner until the stored session has been read, then
 * routes once — signed out to the welcome screen, signed in to the tabs.
 *
 * Also the place a half-finished registration gets repaired. See below.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { palette, spacing } from '@influnet/tokens';
import { useSession, useSignOutAction } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { Button, Screen, Txt } from '@/components/ui';

type Recovery = 'idle' | 'running' | 'failed';

export default function Index() {
  const {
    session,
    profile,
    ready,
    authStranded,
    loadingProfile,
    switching,
    loadProfile,
    retryAuth,
    discardStrandedAuth,
  } = useSession();
  const { signOut, signingOut } = useSignOutAction();
  const router = useRouter();

  const [recovery, setRecovery] = useState<Recovery>('idle');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

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
   * One attempt only: a retry loop against a genuinely unrecoverable account
   * (metadata missing, or mobile verification that can't be inherited) would
   * spin forever behind a spinner.
   *
   * ── WHY THE GUARDS ARE REFS AND NOT `recovery` ────────────────────────
   *
   * `recovery` used to be BOTH the guard and a dependency of this effect, so
   * the effect's own `setRecovery('running')` re-ran it: React tore down the
   * first invocation (flipping its `cancelled` flag), and the re-run bailed on
   * `recovery !== 'idle'`. When the POST finally resolved it hit
   * `if (cancelled) return` and *nothing* ever moved `recovery` off 'running'.
   * The gate's spinner condition includes `recovery === 'running'`, so the app
   * sat on "Getting things ready…" forever — the effect cancelled its own work
   * by starting it.
   *
   * It only took a slow /api/profile (a cold API on the first launch of the
   * day) to reach this path at all, which is why force-closing "fixed" it: on
   * the next launch the warm API returned a profile in time and recovery never
   * ran.
   *
   * So: `recoveryStarted` makes once-only independent of render state, and only
   * a real unmount aborts. A dependency changing under an in-flight request
   * must never silently strand it.
   */
  const recoveryStarted = useRef(false);
  const unmounted = useRef(false);
  useEffect(
    () => () => {
      unmounted.current = true;
    },
    [],
  );

  useEffect(() => {
    if (recoveryStarted.current) return;
    if (!ready || !session || profile || loadingProfile) return;

    recoveryStarted.current = true;
    setRecovery('running');

    void (async () => {
      // Bounded. 'running' has no other exit, so a request that never comes
      // back has to still land somewhere the user can act on. The API client
      // aborts at 15s of its own; this covers the token read in front of it
      // and anything else that might not return.
      const TIMED_OUT = Symbol('timeout');
      const raced = await Promise.race([
        endpoints.register({}),
        new Promise<typeof TIMED_OUT>((r) => setTimeout(() => r(TIMED_OUT), 25_000)),
      ]);
      if (unmounted.current) return;

      if (raced === TIMED_OUT) {
        setRecoveryError(
          'We could not reach the server. Check your connection and open the app again.',
        );
        setRecovery('failed');
        return;
      }

      const res = raced;

      if (res.ok) {
        // Kick verification as the wizard would have, then re-read the profile
        // so the redirect below has something to route on.
        void endpoints.startVerification({}).catch(() => {});
        await loadProfile();
        if (unmounted.current) return;
        // Register said OK but the profile STILL won't load — one attempt, then
        // stop. `recoveryStarted` keeps 'idle' from re-firing this effect on the
        // unchanged (profile === null) state, which would be an infinite loop.
        if (useSession.getState().profile) {
          setRecovery('idle');
        } else {
          setRecoveryError(
            'We could not load your account. Check your connection and open the app again — or sign out and back in.',
          );
          setRecovery('failed');
        }
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
  }, [ready, session, profile, loadingProfile, loadProfile]);

  /**
   * Stranded auth: credentials on disk, no live session — a refresh that could
   * not get through on a cold network. supabase-js holds a 60s cooldown after a
   * failed refresh (keyed by the refresh token, so it survives inside this
   * process), which is why an instant retry no-ops and why the fastest real
   * fix is still a force-close: a fresh process has no cooldown. We retry once
   * automatically just past that window; the background auto-refresh ticker
   * also keeps trying. A success from either path flips `authStranded` off
   * through the auth listener and this screen routes on by itself.
   */
  useEffect(() => {
    if (!authStranded || session) return;
    const timer = setTimeout(() => {
      void retryAuth();
    }, 63_000);
    return () => clearTimeout(timer);
  }, [authStranded, session, retryAuth]);

  const onRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    await retryAuth();
    setRetrying(false);
  };

  if (ready && !session && authStranded) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
          <Txt variant="title1">Reconnecting…</Txt>
          <Txt variant="body" tone="soft">
            You’re still signed in — we just couldn’t reach the server. Check
            your connection. If this sticks, fully close the app and open it
            again.
          </Txt>
          <Button label="Try again" onPress={onRetry} loading={retrying} />
          <Button
            label="Sign in instead"
            variant="ghost"
            onPress={() => {
              void discardStrandedAuth();
              router.replace('/welcome');
            }}
          />
        </View>
      </Screen>
    );
  }

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
          gap: spacing.md,
          backgroundColor: palette.surface,
        }}
      >
        <ActivityIndicator color={palette.verified} />
        <Txt variant="footnote" tone="muted">
          {switching ? 'Switching account…' : 'Getting things ready…'}
        </Txt>
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
