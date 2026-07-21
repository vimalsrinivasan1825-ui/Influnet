/**
 * Instagram ownership verification.
 *
 * Three states in one screen: not started, code issued (waiting for the user to
 * put it in their bio), and verified. The code step is where mobile beats the
 * web — copy the code, tap through to the Instagram app, come back, confirm.
 */
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { BadgeCheck, Copy, ExternalLink } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  ScreenScroll,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface ClaimState {
  status: string;
  verified_at?: string | null;
}

export default function VerificationScreen() {
  const t = useTheme();
  const profile = useSession((s) => s.profile);
  const loadProfile = useSession((s) => s.loadProfile);

  const [code, setCode] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, error, loading, refresh } = useFetch(() =>
    endpoints.checkOwnershipStatus<ClaimState>(), { cacheKey: 'verification' }
  );

  const verified = profile?.verified_badge || data?.status === 'verified';

  const initiate = useCallback(async () => {
    setBusy(true);
    setMessage(null);

    const res = await endpoints.checkOwnership<{ code: string; verify_url: string }>({
      action: 'initiate',
    });
    setBusy(false);

    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setCode(res.data?.code ?? null);
    setVerifyUrl(res.data?.verify_url ?? null);
  }, []);

  const confirm = useCallback(async () => {
    setBusy(true);
    setMessage(null);

    const res = await endpoints.checkOwnership<{ status: string }>({ action: 'confirm' });
    setBusy(false);

    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    if (res.data?.status === 'verified') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadProfile();
      refresh();
    } else {
      setMessage(
        "We couldn't find the code in your bio yet. Make sure your account is public and the code is saved, then try again."
      );
    }
  }, [loadProfile, refresh]);

  if (loading) {
    return (
      <ScreenScroll>
        <SkeletonCard />
      </ScreenScroll>
    );
  }

  if (error) {
    return (
      <ScreenScroll>
        <ErrorState message={error} onRetry={refresh} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing.lg, gap: t.spacing.lg }}>
      {verified ? (
        <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing['3xl'] }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.color.okSoft,
            }}
          >
            <BadgeCheck size={28} color={t.color.ok} />
          </View>
          <Txt variant="title2" center>
            You're verified
          </Txt>
          <Txt variant="callout" tone="muted" center>
            Your Instagram account is confirmed as yours. The badge shows on your
            public profile and everywhere brands see you.
          </Txt>
        </Card>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Txt variant="title1">Verify your Instagram</Txt>
            <Txt variant="body" tone="soft">
              Prove the account is yours by putting a one-time code in your bio.
              It takes about a minute and you can remove the code afterwards.
            </Txt>
          </View>

          {profile?.instagram_handle ? (
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="footnote" tone="muted">
                Account
              </Txt>
              <Txt variant="bodyStrong">@{profile.instagram_handle}</Txt>
            </Card>
          ) : (
            <Card style={{ backgroundColor: t.color.warnSoft, borderColor: t.color.warn }}>
              <Txt variant="footnote" tone="warn">
                Add your Instagram handle to your profile first — we need to know
                which account to check.
              </Txt>
            </Card>
          )}

          {!code ? (
            <Button
              label="Get my code"
              onPress={initiate}
              loading={busy}
              disabled={!profile?.instagram_handle}
            />
          ) : (
            <>
              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Step 1 — copy this
                </Txt>
                <View
                  style={{
                    backgroundColor: t.color.surfaceMuted,
                    borderRadius: t.radii.md,
                    padding: t.spacing.lg,
                    alignItems: 'center',
                  }}
                >
                  <Txt
                    variant="title2"
                    style={{ letterSpacing: 2, fontVariant: ['tabular-nums'] }}
                  >
                    {code}
                  </Txt>
                </View>

                <Button
                  label={copied ? 'Copied' : 'Copy code'}
                  variant="secondary"
                  icon={<Copy size={16} color={t.color.content} />}
                  onPress={async () => {
                    await Clipboard.setStringAsync(verifyUrl ?? code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                />
              </Card>

              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Step 2 — paste it in your bio
                </Txt>
                <Txt variant="callout" tone="soft">
                  Open Instagram, edit your profile, paste the code anywhere in
                  your bio and save. Keep your account public while we check.
                </Txt>
                <Button
                  label="Open Instagram"
                  variant="secondary"
                  icon={<ExternalLink size={16} color={t.color.content} />}
                  onPress={() => void Linking.openURL('instagram://user?username=self').catch(() => Linking.openURL('https://instagram.com'))}
                />
              </Card>

              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Step 3 — come back here
                </Txt>
                <Button label="I've added the code" onPress={confirm} loading={busy} />
              </Card>
            </>
          )}

          {data?.status && data.status !== 'none' && data.status !== 'verified' ? (
            <Badge label={`Status: ${data.status}`} tone="neutral" />
          ) : null}

          {message ? (
            <Card style={{ backgroundColor: t.color.warnSoft, borderColor: t.color.warn }}>
              <Txt variant="footnote" tone="warn">
                {message}
              </Txt>
            </Card>
          ) : null}
        </>
      )}
    </ScreenScroll>
  );
}
