/**
 * The signed-out front door: four short slides, then the creator/business
 * choice (signup/index). Each slide shows one real piece of the product — a
 * brand request, live follower numbers, the both-sides sign-off, a payment —
 * with the official platform logos and a real photo; no illustrations.
 *
 * Follows the phone's light/dark setting (SchemeThemeProvider). Skip and
 * "Log in" are on every slide, so nobody is made to sit through it.
 */
import { useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SchemeThemeProvider, useTheme } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';
import { LogoLockup } from '@/components/brand/logo-lockup';
import { SoftGlow } from '@/components/onboarding/glow';
import { ART_HEIGHT, DealsArt, NumbersArt, PaidArt, SignOffArt } from '@/components/onboarding/intro-art';

const SLIDES = [
  {
    title: 'Brand deals,',
    accent: 'without the DM chaos.',
    body: 'Requests, terms, content and payment in one place.',
    Art: DealsArt,
  },
  {
    title: 'Real numbers,',
    accent: 'straight from your socials.',
    body: 'Connect Instagram, YouTube, Facebook or X. We pull followers and engagement for you.',
    Art: NumbersArt,
  },
  {
    title: 'Every stage,',
    accent: 'signed off by both sides.',
    body: 'Nothing moves until you and the brand both agree.',
    Art: SignOffArt,
  },
  {
    title: 'Get paid',
    accent: 'as the work moves.',
    body: 'An advance before you shoot, the rest when the brand approves.',
    Art: PaidArt,
  },
] as const;

function Intro() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // The art gives way on short phones (SE-class) so the buttons never fall
  // off the bottom; 470 is the copy + controls + header budget.
  const artH = Math.max(220, Math.min(ART_HEIGHT, height - insets.top - insets.bottom - 470));
  const artScale = artH / ART_HEIGHT;
  const pager = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const ground = t.scheme === 'dark' ? t.color.surface : t.color.surfaceCard;

  const goTo = (i: number) => {
    pager.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: ground }}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <SoftGlow />

      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.spacing.screen, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: insets.top + 56 }}>
        <LogoLockup size={26} />
        {!last ? (
          <Pressable onPress={() => router.push('/signup')} hitSlop={12} accessibilityRole="button">
            <Txt style={{ fontSize: 15, fontWeight: '600', color: t.color.contentSoft }}>Skip</Txt>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) void Haptics.selectionAsync();
          setIndex(i);
        }}
        style={{ flexGrow: 0 }}
      >
        {SLIDES.map(({ title, accent, body, Art }) => (
          <View key={title} style={{ width }}>
            <View style={{ height: artH, marginTop: t.spacing.md }}>
              <View style={{ transform: [{ scale: artScale }], transformOrigin: 'top' }}>
                <Art width={width} />
              </View>
            </View>
            <View style={{ paddingHorizontal: t.spacing.screen + 4, gap: 10, marginTop: t.spacing.lg }}>
              <Txt style={{ fontSize: 33, lineHeight: 37, fontWeight: '800', letterSpacing: -1.1 }}>
                {title}
                <Txt style={{ fontSize: 33, lineHeight: 37, fontWeight: '800', letterSpacing: -1.1, color: t.color.brand }}>{`\n${accent}`}</Txt>
              </Txt>
              <Txt tone="muted" style={{ fontSize: 15.5, lineHeight: 23 }}>
                {body}
              </Txt>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ flex: 1 }} />

      <View style={{ paddingHorizontal: t.spacing.screen, paddingBottom: insets.bottom + t.spacing.lg, gap: t.spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingLeft: 4 }} accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <Pressable key={s.title} onPress={() => goTo(i)} hitSlop={8}>
              <View style={{ height: 7, width: i === index ? 24 : 7, borderRadius: 4, backgroundColor: i === index ? t.color.brand : t.color.hairlineStrong }} />
            </Pressable>
          ))}
        </View>
        <Button
          label={last ? 'Get started' : 'Continue'}
          onPress={() => (last ? router.push('/signup') : goTo(index + 1))}
        />
        <Pressable onPress={() => router.push('/login')} hitSlop={8} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Txt tone="muted" style={{ fontSize: 14.5 }}>
            Already have an account? <Txt style={{ fontSize: 14.5, fontWeight: '700' }}>Log in</Txt>
          </Txt>
        </Pressable>
      </View>
    </View>
  );
}

export default function Welcome() {
  return (
    <SchemeThemeProvider>
      <Intro />
    </SchemeThemeProvider>
  );
}
