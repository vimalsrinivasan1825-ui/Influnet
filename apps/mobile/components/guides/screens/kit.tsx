/**
 * Mobile mock-UI primitives for guide screens. Built from `useTheme()` tokens so
 * they track the real app and both themes. Stylised, not the live UI — they
 * exist to be pointed at.
 *
 * `Tap` measures itself and registers with the player so the camera and finger
 * can find it; `Fill` fades in a beat's typed text.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect as SRect, Stop } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { useGuideRuntime } from '../runtime-context';

export interface GuideContext {
  name: string;
  handle: string;
  avatarUrl?: string | null;
  profileUrl: string;
  displayUrl: string;
  role: 'influencer' | 'business_owner' | 'admin' | null;
  plan: 'free' | 'pro';
}

export const DEFAULT_CONTEXT: GuideContext = {
  name: 'Priya Sharma',
  handle: 'priyacreates',
  avatarUrl: null,
  profileUrl: 'https://influnet.in/c/priya',
  displayUrl: 'influnet.in/c/priya',
  role: 'influencer',
  plan: 'free',
};

/** A tap / zoom target. Measures on layout and reports to the player. */
export function Tap({
  id,
  style,
  children,
}: {
  id: string;
  style?: ViewStyle | ViewStyle[];
  children?: ReactNode;
}) {
  const rt = useGuideRuntime();
  const t = useTheme();
  const ref = useRef<View>(null);

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) rt.register(id, { x, y, w, h });
      });
    });
  }, [id, rt]);

  const ring = useAnimatedStyle(() => ({ opacity: rt.flagKey.value === id ? 1 : 0 }));

  return (
    <View ref={ref} onLayout={measure} collapsable={false} style={style}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          ring,
          { borderWidth: 2, borderColor: t.color.brand, borderRadius: 10 },
        ]}
      />
    </View>
  );
}

/** Text that a beat's `type` value fades into. */
export function Fill({ id, placeholder, size = 10 }: { id: string; placeholder?: string; size?: number }) {
  const rt = useGuideRuntime();
  const t = useTheme();
  const w = rt.typed[id];
  const style = useAnimatedStyle(() => {
    if (!w) return { opacity: 1 };
    const p = (rt.t.value - w.start) / Math.max(1, w.end - w.start);
    return { opacity: p < 0 ? 0 : p > 1 ? 1 : p };
  });
  return (
    <Animated.Text style={[{ fontSize: size, color: t.color.content }, style]} numberOfLines={2}>
      {w ? w.text : placeholder ?? ''}
    </Animated.Text>
  );
}

export function StatusBar({ dark = false }: { dark?: boolean }) {
  const c = dark ? 'rgba(255,255,255,.95)' : undefined;
  const t = useTheme();
  return (
    <View style={styles.statusRow}>
      <Text style={{ fontSize: 9, fontWeight: '600', color: c ?? t.color.content }}>9:41</Text>
      <Text style={{ fontSize: 9, fontWeight: '600', color: c ?? t.color.content }}>▮▮ ⌁</Text>
    </View>
  );
}

export function TopBar({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.topBar, { borderColor: t.color.hairline }]}>
      <View style={[styles.chev, { borderColor: t.color.contentSoft }]} />
      <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: t.color.content }} numberOfLines={1}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

export function Key({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 7.5, fontWeight: '700', letterSpacing: 0.6, color: t.color.contentMuted, textTransform: 'uppercase' }}>
      {children}
    </Text>
  );
}

export function PrimaryBtn({ id, label }: { id: string; label: string }) {
  const t = useTheme();
  return (
    <Tap id={id} style={[styles.btn, { backgroundColor: t.color.brand, marginTop: 8 }]}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#fff' }}>{label}</Text>
    </Tap>
  );
}

export function GhostBtn({ id, label }: { id: string; label: string }) {
  const t = useTheme();
  return (
    <Tap id={id} style={[styles.btn, { borderWidth: 1, borderColor: t.color.hairlineStrong, backgroundColor: t.color.surfaceCard }]}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: t.color.content }}>{label}</Text>
    </Tap>
  );
}

export function Row({
  id,
  title,
  subtitle,
  leading,
  trailing,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const t = useTheme();
  const body = (
    <View style={[styles.row, { borderColor: t.color.hairline }]}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: t.color.content }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 8.5, color: t.color.contentMuted }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  return id ? <Tap id={id}>{body}</Tap> : body;
}

export function Avatar({ size = 22, uri }: { size?: number; uri?: string | null }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="gk-av" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#fb9ec3" />
          <Stop offset="52%" stopColor="#c286f0" />
          <Stop offset="100%" stopColor="#7c9cf5" />
        </LinearGradient>
        <ClipPath id="gk-avc">
          <Circle cx="32" cy="32" r="32" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#gk-avc)">
        <SRect width="64" height="64" fill="url(#gk-av)" />
        <Circle cx="32" cy="25" r="11.5" fill="#fff" fillOpacity={0.92} />
        <Path
          d="M32 39c-11 0-19.5 6.6-21.5 16.4A32 32 0 0032 64a32 32 0 0021.5-8.6C51.5 45.6 43 39 32 39z"
          fill="#fff"
          fillOpacity={0.92}
        />
      </G>
    </Svg>
  );
}

export function Tick({ size = 11 }: { size?: number }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill={t.color.verified}
      />
      <Path d="m9 12 2 2 4-4" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TT({ children, size = 9.5, weight = '400', tone, style }: {
  children: ReactNode;
  size?: number;
  weight?: '400' | '600' | '700' | '800';
  tone?: 'muted' | 'soft';
  style?: object;
}) {
  const t = useTheme();
  const color = tone === 'muted' ? t.color.contentMuted : tone === 'soft' ? t.color.contentSoft : t.color.content;
  return <Text style={[{ fontSize: size, fontWeight: weight, color }, style]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 6, height: 26 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderBottomWidth: 1 },
  chev: { width: 7, height: 7, borderLeftWidth: 2, borderBottomWidth: 2, transform: [{ rotate: '45deg' }] },
  btn: { height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  card: { borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 8, marginHorizontal: 12 },
  screen: { flex: 1 },
});
