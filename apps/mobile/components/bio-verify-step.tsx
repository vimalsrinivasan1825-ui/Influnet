/**
 * Signup step: prove the Instagram handle is yours by putting your Influnet
 * profile link in its bio, before the account is created.
 *
 * The link is built from the username chosen earlier in the wizard, so the
 * string each person is asked for is unique to them — see the route at
 * apps/web/src/app/api/auth/verify-instagram-bio/route.ts for why that
 * matters and for what this check deliberately does NOT grant (the Verified
 * badge still needs the single-use code flow post-signup).
 */
import { useState } from 'react';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Check, Copy, ExternalLink } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { publicProfileUrl, publicProfileUrlDisplay } from '@/lib/site';
import { Button, Txt } from '@/components/ui';
import { BioVerifyGuideVideo, WatchGuideButton } from '@/components/bio-verify-guide-video';
import { BioVerifyCelebration } from '@/components/bio-verify-celebration';

export type BioVerifyStatus = 'idle' | 'checking' | 'verified' | 'missing' | 'private' | 'error';

export function useBioVerification(handle: string, username: string) {
  const [status, setStatus] = useState<BioVerifyStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function verify() {
    const cleanHandle = handle.replace(/^@/, '').trim();
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanHandle || !cleanUsername) return;

    setStatus('checking');
    setMessage(null);

    const res = await endpoints.verifyInstagramBio<{
      verified?: boolean;
      reason?: string;
      message?: string;
    }>({ handle: cleanHandle, username: cleanUsername });

    if (!res.ok) {
      setStatus('error');
      setMessage(res.error ?? "We couldn't reach Instagram just now. Try again in a moment.");
      return;
    }
    if (res.data?.verified) {
      setStatus('verified');
      setMessage(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    setStatus(res.data?.reason === 'private' ? 'private' : 'missing');
    setMessage(res.data?.message ?? "We couldn't find your link in that bio yet.");
  }

  /** A changed handle or username invalidates a pass against the old one. */
  function reset() {
    setStatus('idle');
    setMessage(null);
  }

  return { status, message, verify, reset };
}

// A pass here is the last gate before the wizard moves on by itself — see
// the auto-advance timer in the creator/business screens, keyed off this
// same `verified` status. The celebration below is full-screen
// (BioVerifyCelebration, a Modal) rather than an inline card: this is the
// actual payoff of the whole bio-link flow, and a small box competing with a
// scrollview around it undersold that. Its own timing finishes well inside
// the auto-advance window, so it never looks like it's racing the step
// change.

export function BioVerifyStep({
  handle,
  username,
  status,
  message,
  onVerify,
}: {
  handle: string;
  username: string;
  status: BioVerifyStatus;
  message: string | null;
  onVerify: () => void;
}) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const link = publicProfileUrl(username);

  async function copy() {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2000);
  }

  if (status === 'verified') {
    return <BioVerifyCelebration visible handle={handle} />;
  }

  return (
    <View style={{ gap: t.spacing.lg }}>
      <WatchGuideButton onPress={() => setGuideOpen(true)} />
      <BioVerifyGuideVideo
        visible={guideOpen}
        onClose={() => setGuideOpen(false)}
        link={publicProfileUrlDisplay(username)}
        handle={handle}
      />

      <View style={{ gap: t.spacing.sm }}>
        <Txt variant="footnote" tone="soft">
          1. Copy your profile link
        </Txt>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            padding: t.spacing.md,
            borderRadius: t.radii.md,
            borderWidth: 1,
            borderColor: t.color.hairlineStrong,
            backgroundColor: t.color.surfaceCard,
          }}
        >
          <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
            {publicProfileUrlDisplay(username)}
          </Txt>
          {copied ? (
            <Check size={18} color={t.color.ok} />
          ) : (
            <Copy size={18} color={t.color.contentMuted} />
          )}
        </View>
        <Button
          label={copied ? 'Copied' : 'Copy link'}
          variant="secondary"
          size="md"
          onPress={copy}
        />
      </View>

      <View style={{ gap: t.spacing.sm }}>
        <Txt variant="footnote" tone="soft">
          2. Paste it into your Instagram bio
        </Txt>
        <Button
          label="Open Instagram"
          variant="secondary"
          size="md"
          icon={<ExternalLink size={16} color={t.color.content} />}
          onPress={() => {
            // The app deep link falls back to the web profile when Instagram
            // isn't installed, so this never dead-ends.
            void Linking.openURL(`https://instagram.com/${handle.replace(/^@/, '')}`);
          }}
        />
      </View>

      <View style={{ gap: t.spacing.sm }}>
        <Txt variant="footnote" tone="soft">
          3. Check it
        </Txt>
        <Button
          label={status === 'checking' ? 'Checking your bio…' : "I've added it — verify"}
          onPress={onVerify}
          loading={status === 'checking'}
          disabled={status === 'checking'}
        />
        {message ? (
          <Txt variant="footnote" tone={status === 'error' ? 'muted' : 'danger'}>
            {message}
          </Txt>
        ) : (
          <Txt variant="footnote" tone="muted">
            Instagram can take a few seconds to save a bio change. If it doesn't
            work first time, wait a moment and try again.
          </Txt>
        )}
      </View>
    </View>
  );
}
