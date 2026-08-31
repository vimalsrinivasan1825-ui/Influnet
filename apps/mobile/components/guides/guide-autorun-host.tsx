/**
 * Contextual auto-run (mobile). First time this device lands on a section with a
 * guide, a small card slides up: "New here? See how this works." Showing it
 * marks the guide seen — strictly once per section. `reduce-motion` suppresses
 * the auto-card; the launcher still works.
 */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { CirclePlay, X } from 'lucide-react-native';
import { guidesForRoute } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { Txt } from '@/components/ui';
import { useGuides } from './use-guides';

const APPEAR_DELAY = 1400;

export function GuideAutoRunHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const role = useSession((s) => s.profile?.role ?? null);
  const { openId, loaded, hasSeen, markSeen, open } = useGuides();

  const [candidate, setCandidate] = useState<{ id: string; title: string } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    setCandidate(null);
    if (timer.current) clearTimeout(timer.current);
    if (!loaded || !pathname || role === 'admin' || reduceMotion) return;

    const menuRole = role === 'influencer' || role === 'business_owner' ? role : null;
    const guide = guidesForRoute(pathname, menuRole)[0];
    if (!guide || hasSeen(guide.id)) return;

    timer.current = setTimeout(() => {
      if (useGuides.getState().openId) return;
      if (useGuides.getState().hasSeen(guide.id)) return;
      markSeen(guide.id);
      setCandidate({ id: guide.id, title: guide.title });
    }, APPEAR_DELAY);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname, role, loaded, reduceMotion, hasSeen, markSeen]);

  useEffect(() => {
    if (openId) setCandidate(null);
  }, [openId]);

  if (!candidate) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(180)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + (Platform.OS === 'ios' ? 64 : 56),
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 16,
          padding: 12,
          backgroundColor: t.color.surfaceCard,
          borderWidth: 1,
          borderColor: t.color.hairline,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Pressable
          onPress={() => {
            open(candidate.id, 'autorun');
            setCandidate(null);
          }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: t.color.brandSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CirclePlay size={20} color={t.color.brandStrong} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">New here?</Txt>
            <Txt variant="caption" tone="muted" numberOfLines={1}>
              See how “{candidate.title}” works
            </Txt>
          </View>
        </Pressable>
        <Pressable onPress={() => setCandidate(null)} hitSlop={10} style={{ padding: 4 }}>
          <X size={16} color={t.color.contentMuted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
