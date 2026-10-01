/**
 * The bottom tab bar, as a detached rounded bar that floats above the page
 * rather than a full-width strip pinned to the edge.
 *
 * Deliberately NOT glassmorphic: it sits on the app's solid card colour with a
 * hairline and the standard raised shadow. A real frosted blur needs the
 * expo-blur native module (a new store build, not an OTA update) and the app's
 * flat redesign is otherwise intact — see the note at the top of
 * app/(tabs)/home.tsx.
 *
 * ── WHY IT IS ABSOLUTELY POSITIONED ───────────────────────────────────
 *
 * In normal flow the bar is a sibling of the scene container in the
 * navigator's column, so it reserves its own band of the screen — and that
 * band had to be painted an opaque page-grey, which is a strip, not a floating
 * bar. Taking it out of flow lets the scene fill the whole screen and the page
 * run underneath, so the only opaque thing is the pill itself.
 *
 * Two consequences handled here:
 *  - `pointerEvents="box-none"` on the container, or the transparent margin
 *    around the pill would swallow taps meant for the content behind it.
 *  - The real measured height is reported through
 *    BottomTabBarHeightCallbackContext, which is what feeds
 *    BottomTabBarHeightContext — ScreenScroll reads it to keep the last card
 *    clear of the bar. A custom tabBar that never reports leaves that context
 *    on the library's estimate for a bar we do not render.
 */
import { useContext, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

const SLOT = 48;
const GAP = 4;
const PAD = 9;
const ICON = 21;

/**
 * v2 "liquid" pill bar.
 *
 * One pink pill travels between tabs. Its leading edge (`head`, a quick
 * spring) runs ahead of its trailing edge (`tail`, a softer one), so on a
 * change the pill stretches toward the new tab and then draws itself in —
 * the liquid feel — instead of the old tab popping off and the new one
 * popping on.
 *
 * The tabs' widths are a continuous function of the same motion: each tab is
 * a 48pt circle plus a share of the spare width proportional to how close the
 * pill is to it. The shares always sum to one, so the row's total width never
 * changes mid-flight and nothing jumps; the label and the icon colour fade in
 * with that share.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const [innerW, setInnerW] = useState(0);
  const n = state.routes.length;
  const extra = Math.max(0, innerW - n * SLOT - (n - 1) * GAP);

  const head = useSharedValue(state.index);
  const tail = useSharedValue(state.index);
  useEffect(() => {
    head.value = withSpring(state.index, { damping: 20, stiffness: 260, mass: 0.7 });
    tail.value = withSpring(state.index, { damping: 22, stiffness: 120, mass: 0.9 });
  }, [state.index, head, tail]);

  const pillStyle = useAnimatedStyle(() => {
    const lo = Math.min(head.value, tail.value);
    const hi = Math.max(head.value, tail.value);
    return {
      left: PAD + lo * (SLOT + GAP),
      width: (hi - lo) * (SLOT + GAP) + SLOT + extra,
    };
  });

  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => reportHeight?.(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        paddingHorizontal: t.spacing.screen,
        paddingTop: t.spacing.sm,
        // The home-indicator gap on a notched phone; a fixed cushion elsewhere.
        paddingBottom: insets.bottom > 0 ? insets.bottom : t.spacing.md,
      }}
    >
      <View
        onLayout={(e) => setInnerW(e.nativeEvent.layout.width - PAD * 2)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: GAP,
          height: 66,
          borderRadius: 33,
          paddingHorizontal: PAD,
          backgroundColor: t.color.surfaceCard,
          // Content scrolls BEHIND the bar, so the separation has to read
          // around the sides and top, not be thrown off the bottom edge.
          shadowColor: '#111114',
          shadowOpacity: 0.16,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
        }}
      >
        {innerW > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: (66 - SLOT) / 2, height: SLOT, borderRadius: SLOT / 2, backgroundColor: t.color.brand }, pillStyle]}
          />
        ) : null}

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const badge = options.tabBarBadge;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

          return (
            <TabItem
              key={route.key}
              index={index}
              head={head}
              extra={extra}
              focused={isFocused}
              label={label}
              badge={badge != null && badge !== '' ? String(badge) : null}
              renderIcon={(color) => options.tabBarIcon?.({ focused: isFocused, color, size: ICON })}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  index,
  head,
  extra,
  focused,
  label,
  badge,
  renderIcon,
  onPress,
  onLongPress,
}: {
  index: number;
  head: SharedValue<number>;
  extra: number;
  focused: boolean;
  label: string;
  badge: string | null;
  renderIcon: (color: string) => React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useTheme();

  // 1 when the pill is on this tab, 0 when it's a tab or more away.
  const box = useAnimatedStyle(() => {
    const w = Math.max(0, 1 - Math.abs(head.value - index));
    return { width: SLOT + extra * w };
  });
  const circle = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, 1 - Math.abs(head.value - index)) }));
  const iconPos = useAnimatedStyle(() => {
    const w = Math.max(0, 1 - Math.abs(head.value - index));
    return { left: interpolate(w, [0, 1], [(SLOT - ICON) / 2, 15]) };
  });
  const on = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(head.value - index)) }));
  const off = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, 1 - Math.abs(head.value - index)) }));
  const labelStyle = useAnimatedStyle(() => {
    const w = Math.max(0, 1 - Math.abs(head.value - index));
    return { opacity: interpolate(w, [0.4, 1], [0, 1], 'clamp') };
  });

  return (
    <Animated.View style={[{ height: SLOT }, box]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? `${label}, ${badge} new` : label}
        hitSlop={4}
        style={{ flex: 1, borderRadius: SLOT / 2, overflow: 'hidden' }}
      >
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: SLOT, height: SLOT, borderRadius: SLOT / 2, backgroundColor: t.color.surface }, circle]} />
        <Animated.View style={[{ position: 'absolute', top: (SLOT - ICON) / 2, width: ICON, height: ICON }, iconPos]}>
          <Animated.View style={[{ position: 'absolute' }, off]}>{renderIcon(t.color.contentSoft)}</Animated.View>
          <Animated.View style={[{ position: 'absolute' }, on]}>{renderIcon(t.color.white)}</Animated.View>
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 15 + ICON + 8, top: 0, bottom: 0, justifyContent: 'center' }, labelStyle]}>
          <Txt numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: t.color.white }}>
            {label}
          </Txt>
        </Animated.View>
      </Pressable>
      {badge && !focused ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 3,
            left: 28,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 4,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.color.brand2,
            borderWidth: 2,
            borderColor: t.color.surfaceCard,
          }}
        >
          <Txt style={{ color: t.color.white, fontSize: 9, lineHeight: 11, fontWeight: '800' }}>{badge}</Txt>
        </View>
      ) : null}
    </Animated.View>
  );
}
