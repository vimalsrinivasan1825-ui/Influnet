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
import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Check, ChevronDown, ChevronRight, Copy, ExternalLink, HelpCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { publicProfileUrl, publicProfileUrlDisplay } from '@/lib/site';
import { Button, Txt } from '@/components/ui';

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

/**
 * Collapsed by default: the three numbered actions below are enough for most
 * people, and an always-open seven-line walkthrough would push the actual
 * buttons off a phone screen. Anyone who needs it can open it in one tap.
 */
const GUIDE_STEPS = [
  'Tap "Copy link" below — your Influnet link goes to the clipboard.',
  'Tap "Open Instagram". Instagram opens on your profile.',
  'Tap "Edit profile" on your Instagram profile.',
  'Tap the "Bio" field.',
  'Press and hold in the box, then choose "Paste".',
  'Save the change (tap ✓ or "Done").',
  'Come back here and tap "I\'ve added it — verify".',
];

function Guide() {
  const t = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View
      style={{
        borderRadius: t.radii.md,
        borderWidth: 1,
        borderColor: t.color.hairlineStrong,
        backgroundColor: t.color.surfaceMuted,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          padding: t.spacing.md,
        }}
      >
        <HelpCircle size={18} color={t.color.brand} />
        <Txt variant="footnote" style={{ flex: 1, color: t.color.brandStrong, fontWeight: '600' }}>
          Show me how, step by step
        </Txt>
        {open ? (
          <ChevronDown size={18} color={t.color.contentMuted} />
        ) : (
          <ChevronRight size={18} color={t.color.contentMuted} />
        )}
      </Pressable>

      {open ? (
        <View style={{ paddingHorizontal: t.spacing.md, paddingBottom: t.spacing.md, gap: t.spacing.sm }}>
          {GUIDE_STEPS.map((line, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <Txt variant="footnote" tone="muted" style={{ width: 16 }}>
                {i + 1}.
              </Txt>
              <Txt variant="footnote" tone="soft" style={{ flex: 1 }}>
                {line}
              </Txt>
            </View>
          ))}
          <Txt variant="footnote" tone="muted" style={{ marginTop: 2 }}>
            You can remove the link from your bio once you're verified.
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A pass here is the last gate before the wizard moves on by itself — see the
 * auto-advance timer in the creator/business screens, keyed off this same
 * `verified` status. The animation's own timing (spring in, then the text)
 * finishes well inside that window, so it never looks like it's racing the
 * step change.
 */
function VerifiedHero({ handle }: { handle: string }) {
  const t = useTheme();
  const scale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
    Animated.timing(checkOpacity, {
      toValue: 1,
      duration: 180,
      delay: 120,
      useNativeDriver: true,
    }).start();
    Animated.timing(textOpacity, {
      toValue: 1,
      duration: 300,
      delay: 220,
      useNativeDriver: true,
    }).start();
  }, [checkOpacity, scale, textOpacity]);

  return (
    <View
      style={{
        gap: t.spacing.md,
        padding: t.spacing.xl,
        borderRadius: t.radii.md,
        borderWidth: 1,
        borderColor: t.color.ok,
        backgroundColor: t.color.surfaceCard,
        alignItems: 'center',
      }}
    >
      <Animated.View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: t.color.ok,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
        }}
      >
        <Animated.View style={{ opacity: checkOpacity }}>
          <Check size={30} color={t.color.white} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={{ opacity: textOpacity, alignItems: 'center', gap: 4 }}>
        <Txt variant="bodyStrong">@{handle.replace(/^@/, '')} is yours</Txt>
        <Txt variant="footnote" tone="muted" style={{ textAlign: 'center' }}>
          Verified from your bio. Taking you to the next step…
        </Txt>
      </Animated.View>
    </View>
  );
}

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
  const link = publicProfileUrl(username);

  async function copy() {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2000);
  }

  if (status === 'verified') {
    return <VerifiedHero handle={handle} />;
  }

  return (
    <View style={{ gap: t.spacing.lg }}>
      <Guide />

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
