/**
 * The four intro compositions. Each one is built from the product's own
 * pieces — a real request card, the both-sides sign-off, a payment — plus the
 * official platform logos and one real photo, never icons or illustrations.
 *
 * Motion is deliberately small: cards drift a few points on slow loops and
 * the sign-off knob nudges once in a while. Reduce Motion stills all of it.
 */
import { useEffect, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Check, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

const CREATOR = require('../../assets/onboarding/creator.jpg');
const THALI = require('../../assets/onboarding/thali.jpg');
const IG = require('../../assets/social/instagram.png');
const YT = require('../../assets/social/youtube.png');
const FB = require('../../assets/social/facebook.png');
const X = require('../../assets/social/x.png');

export const ART_HEIGHT = 340;

/** A slow vertical drift. Different delays keep neighbours out of step. */
function Float({ delay = 0, amp = 6, children, style }: { delay?: number; amp?: number; children: ReactNode; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, [v, delay, reduced]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: -amp * v.value }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Surface for a floating product card: white in light, raised grey in dark. */
function useCardStyle(): ViewStyle {
  const t = useTheme();
  return {
    backgroundColor: t.color.surfaceCard,
    borderRadius: 20,
    borderWidth: t.scheme === 'dark' ? 1 : 0,
    borderColor: t.color.hairline,
    ...t.shadows.raised,
    shadowOpacity: t.scheme === 'dark' ? 0.5 : 0.12,
  };
}

function BrandTile({ label, bg, size = 34 }: { label: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Txt style={{ color: '#fff', fontSize: size * 0.34, fontWeight: '800' }}>{label}</Txt>
    </View>
  );
}

/* ── 1 · Brand deals, without the DM chaos ─────────────────────────────── */
export function DealsArt({ width }: { width: number }) {
  const t = useTheme();
  const card = useCardStyle();
  const photoW = 196;
  return (
    <View style={{ width, height: ART_HEIGHT }}>
      <Float amp={4} style={{ position: 'absolute', left: (width - photoW) / 2, top: 6 }}>
        <View style={{ width: photoW, height: 290, borderRadius: 26, overflow: 'hidden', transform: [{ rotate: '-2deg' }], ...t.shadows.pop }}>
          <Image source={CREATOR} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel="A creator filming herself on a phone" />
          <View style={{ position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.94)' }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.color.brand2 }} />
            <Txt style={{ fontSize: 12, fontWeight: '700', color: '#111114' }}>Filming for Kadai Foods</Txt>
          </View>
        </View>
      </Float>

      <Float delay={500} style={{ position: 'absolute', left: 14, top: 26 }}>
        <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingRight: 12 }]}>
          <Image source={THALI} style={{ width: 40, height: 40, borderRadius: 12 }} />
          <View style={{ gap: 1 }}>
            <Txt style={{ fontSize: 13, fontWeight: '700' }}>Kadai Foods</Txt>
            <Txt tone="muted" style={{ fontSize: 11.5 }}>wants 2 Reels</Txt>
          </View>
          <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: t.color.brandSoft, justifyContent: 'center' }}>
            <Txt style={{ fontSize: 12, fontWeight: '800', color: t.color.brand }}>₹25K</Txt>
          </View>
        </View>
      </Float>

      <Float delay={1300} style={{ position: 'absolute', right: 14, top: 228 }}>
        <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, paddingRight: 14 }]}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.color.ok, alignItems: 'center', justifyContent: 'center' }}>
            <Check size={17} color="#fff" strokeWidth={3} />
          </View>
          <View style={{ gap: 1 }}>
            <Txt style={{ fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>₹12,500</Txt>
            <Txt style={{ fontSize: 11.5, fontWeight: '600', color: t.color.ok }}>advance paid</Txt>
          </View>
        </View>
      </Float>
    </View>
  );
}

/* ── 2 · Real numbers, straight from your socials ──────────────────────── */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt style={{ fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.4 }}>{value}</Txt>
      <Txt tone="muted" style={{ fontSize: 11.5 }}>{label}</Txt>
    </View>
  );
}

export function NumbersArt({ width }: { width: number }) {
  const t = useTheme();
  const card = useCardStyle();
  const logo = { position: 'absolute' as const };
  return (
    <View style={{ width, height: ART_HEIGHT }}>
      <Float delay={0} style={{ ...logo, left: width / 2 - 38, top: 4 }}>
        <Image source={IG} style={{ width: 76, height: 76, transform: [{ rotate: '-6deg' }] }} accessibilityLabel="Instagram" />
      </Float>
      <Float delay={700} style={{ ...logo, left: 30, top: 54 }}>
        <Image source={YT} style={{ width: 66, height: 46, transform: [{ rotate: '-10deg' }] }} accessibilityLabel="YouTube" />
      </Float>
      <Float delay={1200} style={{ ...logo, right: 34, top: 44 }}>
        <Image source={FB} style={{ width: 54, height: 54, transform: [{ rotate: '9deg' }] }} accessibilityLabel="Facebook" />
      </Float>
      <Float delay={400} style={{ ...logo, right: 46, top: 268 }}>
        <Image source={X} style={{ width: 34, height: 34, transform: [{ rotate: '8deg' }] }} tintColor={t.color.content} accessibilityLabel="X" />
      </Float>

      <View style={[card, { position: 'absolute', left: 36, right: 36, top: 120, padding: 16, gap: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={IG} style={{ width: 36, height: 36 }} />
          <View style={{ flex: 1, gap: 1 }}>
            <Txt style={{ fontSize: 14.5, fontWeight: '700' }}>@yourhandle</Txt>
            <Txt tone="muted" style={{ fontSize: 12 }}>Instagram · connected</Txt>
          </View>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.color.ok }} />
        </View>
        <View style={{ height: 1, backgroundColor: t.color.hairline }} />
        <View style={{ flexDirection: 'row' }}>
          <Stat value="24.6K" label="followers" />
          <Stat value="4.8%" label="engagement" />
          <Stat value="142" label="posts" />
        </View>
      </View>

      <View style={{ position: 'absolute', left: 36, top: 276, flexDirection: 'row', alignItems: 'center', gap: 7, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: t.color.surfaceCard, borderWidth: 1, borderColor: t.color.hairline }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.color.ok }} />
        <Txt style={{ fontSize: 12.5, fontWeight: '600' }}>Pulled live, no screenshots</Txt>
      </View>
    </View>
  );
}

/* ── 3 · Every stage, signed off by both sides ─────────────────────────── */
function SignerRow({ tile, name, status, done }: { tile: ReactNode; name: string; status: string; done?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: t.color.surface }}>
      {tile}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt style={{ fontSize: 13.5, fontWeight: '700' }}>{name}</Txt>
        <Txt style={{ fontSize: 12, fontWeight: '700', color: done ? t.color.ok : t.color.brand }}>{status}</Txt>
      </View>
      {done ? <Check size={18} color={t.color.ok} strokeWidth={2.8} /> : null}
    </View>
  );
}

export function SignOffArt({ width }: { width: number }) {
  const t = useTheme();
  const card = useCardStyle();
  const reduced = useReducedMotion();
  const knob = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    knob.value = withRepeat(
      withSequence(
        withDelay(1400, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
    );
  }, [knob, reduced]);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value * 24 }] }));

  return (
    <View style={{ width, height: ART_HEIGHT }}>
      <Float amp={4} style={{ position: 'absolute', left: 30, right: 30, top: 16 }}>
        <View style={[card, { padding: 16, gap: 10 }]}>
          <View style={{ gap: 2, marginBottom: 2 }}>
            <Txt tone="muted" style={{ fontSize: 12, fontWeight: '600' }}>Stage 4 of 12</Txt>
            <Txt style={{ fontSize: 18, fontWeight: '800', letterSpacing: -0.3 }}>Content Planning</Txt>
          </View>
          <SignerRow tile={<BrandTile label="KF" bg="#e2703a" />} name="Kadai Foods" status="Signed · 2h ago" done />
          <SignerRow tile={<BrandTile label="You" bg={t.color.brand} />} name="You" status="Your turn" />
          <View style={{ height: 54, borderRadius: 27, backgroundColor: t.color.brand, flexDirection: 'row', alignItems: 'center', paddingLeft: 64, marginTop: 2 }}>
            <Animated.View style={[{ position: 'absolute', left: 4, top: 4, width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, knobStyle]}>
              <Check size={20} color={t.color.brand} strokeWidth={2.8} />
            </Animated.View>
            <Txt style={{ fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 }}>Slide to sign off</Txt>
            <ChevronRight size={18} color="rgba(255,255,255,0.7)" style={{ marginRight: 16 }} />
          </View>
        </View>
      </Float>
    </View>
  );
}

/* ── 4 · Get paid as the work moves ────────────────────────────────────── */
const BARS = [36, 44, 30, 62, 74, 96];

export function PaidArt({ width }: { width: number }) {
  const t = useTheme();
  const card = useCardStyle();
  return (
    <View style={{ width, height: ART_HEIGHT }}>
      <Float amp={4} style={{ position: 'absolute', left: 30, right: 30, top: 16 }}>
        <View style={[card, { padding: 16, gap: 14 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Image source={THALI} style={{ width: 42, height: 42, borderRadius: 13 }} />
            <View style={{ flex: 1, gap: 1 }}>
              <Txt style={{ fontSize: 14.5, fontWeight: '700' }}>Festive thali reels</Txt>
              <Txt tone="muted" style={{ fontSize: 12 }}>Kadai Foods · ₹25,000</Txt>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Txt style={{ flex: 1, fontSize: 13.5, fontWeight: '600' }}>Advance</Txt>
              <Txt style={{ fontSize: 13.5, fontWeight: '800', fontVariant: ['tabular-nums'], marginRight: 8 }}>₹12,500</Txt>
              <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: t.color.okSoft, justifyContent: 'center' }}>
                <Txt style={{ fontSize: 11, fontWeight: '800', color: t.color.ok }}>Paid</Txt>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Txt tone="muted" style={{ flex: 1, fontSize: 13.5, fontWeight: '600' }}>Final</Txt>
              <Txt tone="muted" style={{ fontSize: 13.5, fontWeight: '700', fontVariant: ['tabular-nums'], marginRight: 8 }}>₹12,500</Txt>
              <Txt tone="muted" style={{ fontSize: 11, fontWeight: '600' }}>after approval</Txt>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: t.color.hairline }} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 100 }}>
            {BARS.map((h, i) => (
              <View key={i} style={{ width: 30, height: h, borderRadius: 15, backgroundColor: i === BARS.length - 1 ? t.color.brand : t.scheme === 'dark' ? 'rgba(255,255,255,0.1)' : '#ececf1' }} />
            ))}
          </View>
        </View>
      </Float>
    </View>
  );
}
