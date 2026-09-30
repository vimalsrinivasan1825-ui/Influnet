/**
 * Verify the business email — same flow as web Settings → Business email, and
 * the step shown right after a business signs up. One address is enough; a
 * company-domain address scores highest, a personal one is allowed but adds
 * nothing. Skippable: nothing in the app is gated on it.
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BadgeCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { Button, Field, ScreenScroll, Txt } from '@/components/ui';

interface EmailState {
  verification_email: string | null;
  account_email: string | null;
  email_verified: boolean;
  is_personal_email: boolean;
  matches_company: boolean;
  suggested_domain: string | null;
}

export default function VerifyBusinessEmailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { email: emailParam, onboarding } = useLocalSearchParams<{ email?: string; onboarding?: string }>();
  const fromSignup = onboarding === '1';

  const [state, setState] = useState<EmailState | null>(null);
  const [email, setEmail] = useState((emailParam ?? '').toString().trim().toLowerCase());
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSent = useRef(false);

  // After signup the destination is the `/` mapper, which decides between the
  // tabs and the pending-review screen; Settings just goes back.
  const leave = () => (fromSignup ? router.replace('/') : router.back());

  async function send(to: string) {
    setBusy(true);
    setError(null);
    const res = await endpoints.businessEmailAction<EmailState>({ action: 'initiate', email: to });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Could not send the code.');
      return;
    }
    setState(res.data);
    setCodeSent(true);
    setCode('');
  }

  useEffect(() => {
    void (async () => {
      const res = await endpoints.getBusinessEmail<EmailState>();
      // The screen still works without the prefetch.
      if (!res.ok || !res.data) return;
      setState(res.data);
      if (!email) setEmail(res.data.verification_email ?? '');
      if (fromSignup && email && !res.data.email_verified && !autoSent.current) {
        autoSent.current = true;
        await send(email);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await endpoints.businessEmailAction<EmailState & { verified?: boolean; message?: string }>({
      action: 'confirm',
      email,
      code,
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Could not verify the code.');
      return;
    }
    if (res.data.verified) {
      setState(res.data);
      setCodeSent(false);
      // Re-score now that the inbox is proven. Best effort.
      void endpoints.startVerification({}).catch(() => {});
      if (fromSignup) setTimeout(leave, 1500);
    } else {
      setError(res.data.message ?? 'That code is not right.');
    }
  }

  const verified = !!state?.email_verified;
  const sameAsSaved = email.trim().toLowerCase() === state?.verification_email;

  return (
    <ScreenScroll>
      <View style={{ gap: t.spacing.md }}>
        <Txt variant="title2">Verify your business email</Txt>
        <Txt tone="muted">
          Confirm one address to raise your verification score. An address on your company&apos;s own domain scores
          highest. A personal address works, but it does not add to your score.
        </Txt>

        {verified ? (
          <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}>
            <BadgeCheck size={18} color={t.color.ok} />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '600' }}>{state?.verification_email} is verified</Txt>
              <Txt variant="caption" tone="muted">
                {state?.matches_company
                  ? 'It matches your company domain, so it counts towards your verification score.'
                  : state?.is_personal_email
                    ? 'This is a personal address, so it does not add to your score. Verify a company address to raise it.'
                    : 'This domain does not match your company name or website, so it does not add to your score.'}
              </Txt>
            </View>
          </View>
        ) : null}

        {!codeSent ? (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              placeholder={state?.suggested_domain ? `you@${state.suggested_domain}` : 'you@yourcompany.com'}
            />
            <Button
              label={verified && sameAsSaved ? 'Re-send code' : 'Send code'}
              loading={busy}
              disabled={!/\S+@\S+\.\S+/.test(email)}
              onPress={() => void send(email.trim().toLowerCase())}
            />
            {state?.account_email && email.trim().toLowerCase() !== state.account_email.toLowerCase() ? (
              <Button
                variant="secondary"
                label={`No company email? Use ${state.account_email} (lower score)`}
                onPress={() => setEmail(state.account_email ?? '')}
              />
            ) : null}
          </>
        ) : (
          <>
            <Txt tone="soft">We sent a 6-digit code to {email}. It expires in 15 minutes.</Txt>
            <Field
              label="Code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              keyboardType="number-pad"
            />
            <Button label="Verify" loading={busy} disabled={code.length !== 6} onPress={() => void confirm()} />
            <Button variant="secondary" label="Use a different address" onPress={() => setCodeSent(false)} />
          </>
        )}

        {error ? <Txt tone="danger">{error}</Txt> : null}

        <Button variant="secondary" label={fromSignup ? 'Skip for now' : 'Done'} onPress={leave} />
      </View>
    </ScreenScroll>
  );
}
