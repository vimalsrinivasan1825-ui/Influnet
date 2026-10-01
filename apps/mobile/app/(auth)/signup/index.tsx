/**
 * Creator or business. The one place onboarding uses photographs: each side is
 * a real person doing that side's work — a creator filming, a shop owner with
 * his stock — so the choice reads at a glance, before any copy.
 *
 * Tapping a card selects it; the button names the choice ("Continue as a
 * creator") so nobody lands in the wrong wizard by a stray tap.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Check, ChevronLeft } from 'lucide-react-native';
import { SchemeThemeProvider, useTheme } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';
import { SoftGlow } from '@/components/onboarding/glow';
import { BuildStrip } from '@/components/build-strip';

const CREATOR = require('../../../assets/onboarding/creator.jpg');
const BUSINESS = require('../../../assets/onboarding/business.jpg');

type Role = 'creator' | 'business';

const OPTIONS: { role: Role; title: string; body: string; photo: number; alt: string }[] = [
  {
    role: 'creator',
    title: "I'm a creator",
    body: 'Get brand deals and get paid, stage by stage.',
    photo: CREATOR,
    alt: 'A creator filming herself on a phone',
  },
  {
    role: 'business',
    title: "I'm a business",
    body: 'Find creators and run every collab in one place.',
    photo: BUSINESS,
    alt: 'A shop owner with his products',
  },
];

function RoleChoice() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role>('creator');
  const ground = t.scheme === 'dark' ? t.color.surface : t.color.surfaceCard;

  return (
    <View style={{ flex: 1, backgroundColor: ground }}>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <SoftGlow height={420} />

      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: t.spacing.screen - 6, height: insets.top + 52, justifyContent: 'center' }}>
        {router.canGoBack() ? (
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, justifyContent: 'center' }}>
            <ChevronLeft size={26} color={t.color.content} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: t.spacing.screen + 2, gap: 8, marginTop: t.spacing.sm }}>
        <Txt style={{ fontSize: 33, lineHeight: 37, fontWeight: '800', letterSpacing: -1.1 }}>
          How will you
          <Txt style={{ fontSize: 33, lineHeight: 37, fontWeight: '800', letterSpacing: -1.1, color: t.color.brand }}>{'\nuse influnet?'}</Txt>
        </Txt>
        <Txt tone="muted" style={{ fontSize: 15.5, lineHeight: 23 }}>
          Each side gets its own tools. Pick the one you're on.
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: t.spacing.screen, marginTop: t.spacing['2xl'], flex: 1, maxHeight: 360 }}>
        {OPTIONS.map((o) => {
          const on = role === o.role;
          return (
            <Pressable
              key={o.role}
              onPress={() => {
                void Haptics.selectionAsync();
                setRole(o.role);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${o.title}. ${o.body}`}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 24,
                overflow: 'hidden',
                borderWidth: 2.5,
                borderColor: on ? t.color.brand : 'transparent',
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Image source={o.photo} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" accessibilityLabel={o.alt} />
              {/* A dark band behind the copy so it reads on any photo. */}
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: 'rgba(10,10,12,0.55)' }} />
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: '55%', height: 60, backgroundColor: 'rgba(10,10,12,0.25)' }} />
              <View
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: on ? 0 : 2,
                  borderColor: 'rgba(255,255,255,0.85)',
                  backgroundColor: on ? t.color.brand : 'rgba(0,0,0,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? <Check size={15} color="#fff" strokeWidth={3.2} /> : null}
              </View>
              <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14, gap: 4 }}>
                <Txt style={{ color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>{o.title}</Txt>
                <Txt style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12.5, lineHeight: 17 }}>{o.body}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ paddingHorizontal: t.spacing.screen, paddingBottom: insets.bottom + t.spacing.md, gap: t.spacing.md }}>
        <Button
          label={role === 'creator' ? 'Continue as a creator' : 'Continue as a business'}
          onPress={() => router.push(`/signup/${role}`)}
        />
        <Pressable onPress={() => router.push('/login')} hitSlop={8} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 4 }}>
          <Txt tone="muted" style={{ fontSize: 14.5 }}>
            Already have an account? <Txt style={{ fontSize: 14.5, fontWeight: '700' }}>Log in</Txt>
          </Txt>
        </Pressable>
        <BuildStrip />
      </View>
    </View>
  );
}

export default function SignupRoleFork() {
  return (
    <SchemeThemeProvider>
      <RoleChoice />
    </SchemeThemeProvider>
  );
}
