/**
 * "How to verify" — the guide animation full-screen, with the two actions it
 * teaches wired to the real thing. Reached from the verification screen and
 * from Settings. Presented as a modal (see app/_layout.tsx).
 */
import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Pause, Play, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { publicProfileUrl, publicProfileUrlDisplay } from '@/lib/site';
import { GUIDE_STEPS, VerifyGuideAnimation } from '@/components/verification/verify-guide-animation';
import { Button, ScreenScroll, Txt } from '@/components/ui';

export default function VerificationGuideScreen() {
  const t = useTheme();
  const router = useRouter();
  const profile = useSession((s) => s.profile);

  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const username = profile?.username ?? '';
  const profileUrl = username ? publicProfileUrl(username) : '';
  const displayUrl = username ? publicProfileUrlDisplay(username) : 'influnet.in/yourname';
  const handle = (profile?.instagram_handle ?? 'yourhandle').replace(/^@/, '');

  const copy = useCallback(async () => {
    if (!profileUrl) return;
    await Clipboard.setStringAsync(profileUrl);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [profileUrl]);

  return (
    <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing.lg, gap: t.spacing.lg }}>
      <View style={{ gap: 4 }}>
        <Txt variant="title2">How to verify</Txt>
        <Txt variant="footnote" tone="muted">
          Step {step + 1} of {GUIDE_STEPS.length} · {GUIDE_STEPS[step]?.label}
        </Txt>
      </View>

      <VerifyGuideAnimation
        displayUrl={displayUrl}
        handle={handle}
        name={profile?.name ?? 'Your name'}
        playing={playing}
        onStep={setStep}
      />

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {GUIDE_STEPS.map((s, i) => (
          <View
            key={s.t}
            style={{
              height: 6,
              borderRadius: 3,
              width: i === step ? 24 : 6,
              backgroundColor: i === step ? t.color.brand : t.color.hairlineStrong,
            }}
          />
        ))}
      </View>

      <Pressable
        onPress={() => setPlaying((v) => !v)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          paddingVertical: 6,
        }}
      >
        {playing ? (
          <Pause size={15} color={t.color.contentSoft} />
        ) : (
          <Play size={15} color={t.color.contentSoft} />
        )}
        <Txt variant="footnote" tone="soft">{playing ? 'Pause' : 'Play'}</Txt>
      </Pressable>

      <View style={{ backgroundColor: t.color.surfaceMuted, borderRadius: t.radii.md, padding: t.spacing.md }}>
        <Txt variant="footnote" tone="soft">
          Your profile link is what proves the account is yours. Leave it in your bio — it&apos;s
          the page you want brands to land on, and we can re-check it later.
        </Txt>
      </View>

      <View style={{ gap: t.spacing.sm }}>
        <Button
          label={copied ? 'Copied' : 'Copy my link'}
          variant="secondary"
          icon={<Copy size={16} color={t.color.content} />}
          onPress={copy}
          disabled={!profileUrl}
        />
        <Button
          label="Open Instagram"
          variant="secondary"
          onPress={() =>
            void Linking.openURL('instagram://user?username=self').catch(() =>
              Linking.openURL('https://instagram.com'),
            )
          }
        />
        <Button
          label="Verify now"
          icon={<ShieldCheck size={16} color={t.color.white} />}
          onPress={() => router.replace('/verification')}
        />
      </View>
    </ScreenScroll>
  );
}
