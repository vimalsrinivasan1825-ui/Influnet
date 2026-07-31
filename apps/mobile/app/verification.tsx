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

/**
 * From GET /api/verification — the trust/metrics pipeline, which is a DIFFERENT
 * thing from the bio-code ownership claim this screen is mostly about.
 * Ownership proves the account is yours; this checks the account itself is real
 * (live follower/activity signals via the Apify provider, plus review).
 *
 * Mobile only ever had the ownership half, so a creator whose verification came
 * back `needs_more_info` or `rejected` had no way to find that out — or to
 * re-run it — without opening the web app.
 */
interface PipelineState {
  status: 'unverified' | 'pending' | 'in_review' | 'verified' | 'needs_more_info' | 'rejected';
  verified_badge: boolean;
  latest_check: { status: string; ai_reason: string | null; created_at: string } | null;
}

const PIPELINE_BLURB: Record<PipelineState['status'], string> = {
  unverified:
    'Not run yet. We check your handle live — real followers, recent activity, and the platform’s own verified status. It runs in the background; nothing is blocked meanwhile.',
  pending: 'Running now. This won’t stop you using anything.',
  in_review: 'A reviewer is taking a look. No action needed.',
  verified: 'Your profile checks out. Businesses see this alongside your name.',
  needs_more_info:
    'We need a bit more detail. Fill out more of your profile — handles, bio, audience — then run it again.',
  rejected: 'We couldn’t verify this profile. Review your details and try again.',
};

const PIPELINE_TONE: Record<PipelineState['status'], 'ok' | 'warn' | 'danger' | 'neutral'> = {
  unverified: 'neutral',
  pending: 'warn',
  in_review: 'warn',
  verified: 'ok',
  needs_more_info: 'warn',
  rejected: 'danger',
};

const PIPELINE_LABEL: Record<PipelineState['status'], string> = {
  unverified: 'Not run',
  pending: 'Running',
  in_review: 'In review',
  verified: 'Verified',
  needs_more_info: 'Needs more info',
  rejected: 'Not verified',
};

export default function VerificationScreen() {
  const t = useTheme();
  const profile = useSession((s) => s.profile);
  const loadProfile = useSession((s) => s.loadProfile);

  const [code, setCode] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The claim is keyed on the handle, so every ownership call needs it. Cleaned
  // the same way the web panel does (strip a leading @) — the server lowercases
  // and normalises, but sending '@name' where it expects 'name' is a needless
  // round trip.
  const igHandle = (profile?.instagram_handle ?? '').trim().replace(/^@/, '');

  const { data, error, loading, refresh } = useFetch(
    async () => {
      // No handle on the profile yet — there is nothing to ask about, and
      // calling with an empty one returns a misleading 'none'. The UI already
      // tells the user to add their handle first.
      if (!igHandle) {
        return { ok: true, status: 200, error: null, data: { status: 'none' } as ClaimState };
      }
      return endpoints.checkOwnershipStatus<ClaimState>(igHandle);
    },
    // Keyed by handle: changing it in the profile must not read back the old
    // handle's claim from cache.
    { cacheKey: `verification:${igHandle || 'none'}` }
  );

  const { data: pipeline, refresh: refreshPipeline } = useFetch(() =>
    endpoints.getVerification<PipelineState>(), { cacheKey: 'verification-pipeline' }
  );
  const [pipelineBusy, setPipelineBusy] = useState(false);

  const pipelineStatus = pipeline?.status ?? 'unverified';
  // Re-running mid-flight would just queue a duplicate check.
  const canRunPipeline =
    !pipelineBusy && pipelineStatus !== 'pending' && pipelineStatus !== 'in_review';

  async function runPipeline() {
    setPipelineBusy(true);
    try {
      await endpoints.startVerification({});
      await loadProfile();
      refreshPipeline();
    } finally {
      setPipelineBusy(false);
    }
  }

  const verified = profile?.verified_badge || data?.status === 'verified';

  const initiate = useCallback(async () => {
    setBusy(true);
    setMessage(null);

    const res = await endpoints.checkOwnership<{ code: string; verify_url: string }>({
      action: 'initiate',
      handle: igHandle,
    });
    setBusy(false);

    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    setCode(res.data?.code ?? null);
    setVerifyUrl(res.data?.verify_url ?? null);
  }, [igHandle]);

  const confirm = useCallback(async () => {
    setBusy(true);
    setMessage(null);

    // The server answers { verified: boolean }, NOT { status }. Reading the
    // wrong field meant a successful confirm still fell into the "couldn't find
    // your code" branch — so even once the handle was being sent, the flow could
    // never report success. `message` carries the server's own wording for the
    // not-found case, which is more specific than the fallback below.
    const res = await endpoints.checkOwnership<{ verified: boolean; message?: string }>({
      action: 'confirm',
      handle: igHandle,
    });
    setBusy(false);

    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    if (res.data?.verified) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessage(
        'Ownership confirmed — you can remove the code from your bio now. Running your verification…'
      );
      // Ownership is only a PREREQUISITE for the badge: /api/verification is
      // what actually grants it, and it will not auto-verify until the
      // ownership claim exists (anti-impersonation). Web fires this on confirm;
      // mobile did not, so a creator who completed the handshake here sat at
      // "unverified" with nothing queued and no indication anything was
      // outstanding. Fire-and-forget, exactly as web does.
      void endpoints.startVerification({}).catch(() => {});
      await loadProfile();
      refresh();
      refreshPipeline();
    } else {
      setMessage(
        res.data?.message ??
          "We couldn't find the code in your bio yet. Make sure your account is public and the code is saved, then try again."
      );
    }
  }, [igHandle, loadProfile, refresh, refreshPipeline]);

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
      {/* Profile verification — separate from the ownership claim below. Shown
          first because a `rejected` / `needs_more_info` result here is the one
          thing a creator would otherwise never see on mobile. */}
      <Card style={{ gap: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.sm }}>
          <Txt variant="footnote" tone="muted">
            Profile verification
          </Txt>
          <Badge label={PIPELINE_LABEL[pipelineStatus]} tone={PIPELINE_TONE[pipelineStatus]} />
        </View>

        <Txt variant="footnote" tone="soft">
          {PIPELINE_BLURB[pipelineStatus]}
        </Txt>

        {pipeline?.latest_check?.ai_reason ? (
          <Card style={{ backgroundColor: t.color.surfaceMuted, gap: 2 }}>
            <Txt variant="caption" tone="muted">
              Last check
            </Txt>
            <Txt variant="footnote" tone="soft">
              {pipeline.latest_check.ai_reason}
            </Txt>
          </Card>
        ) : null}

        {canRunPipeline ? (
          <Button
            label={pipelineStatus === 'unverified' ? 'Run verification' : 'Run it again'}
            variant="secondary"
            size="md"
            onPress={runPipeline}
            loading={pipelineBusy}
          />
        ) : null}
      </Card>

      {verified ? (
        <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing['2xl'] }}>
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
          <Button
            label={busy ? "Refreshing..." : "Re-verify & Refresh Data"}
            size="md"
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await endpoints.refreshProfile();
                await loadProfile();
                refresh();
              } finally {
                setBusy(false);
              }
            }}
          />
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
