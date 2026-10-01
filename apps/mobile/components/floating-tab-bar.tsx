/**
 * The bottom tab bar: a detached glass pill that floats above the page.
 *
 * ── THE GLASS, AND WHY THERE ARE THREE OF IT ───────────────────────────
 *
 * React Native is not a browser: there is no `backdrop-filter`, so a view
 * cannot blur what is behind it with a style. Lowering the background's
 * opacity alone only shows the page through, sharp and busy. Real blur needs
 * a native view, and which one depends on the phone:
 *
 *  1. iOS 26+ → `GlassView` (expo-glass-effect), Apple's own Liquid Glass.
 *  2. Everything else with expo-blur in the binary → `BlurView`. iOS draws it
 *     natively; Android blurs a `BlurTargetView`, which must WRAP the content
 *     and must not contain the bar — so every tab screen is wrapped in
 *     `TabBlurTarget` (see app/(tabs)/_layout.tsx) and the bar blurs the
 *     focused one.
 *  3. A binary built before expo-blur was added → translucent white, no blur.
 *     JS reaches those phones over the air, and rendering a native view the
 *     binary does not have would crash, so blur is used only when the module
 *     is actually present (`requireOptionalNativeModule`).
 *
 * The recipe on top of the blur is the landing page nav's: 65% white, a
 * bright 70% white rim, and a soft lifted shadow (`boxShadow`, which like CSS
 * draws only outside the box — an Android `elevation` would show through the
 * glass as a grey smudge).
 *
 * ── MOTION ───────────────────────────────────────────────────────────
 *
 * Reanimated CSS transitions, the same curves as the approved web mock-up:
 * the focused tab's width grows over 450ms on cubic-bezier(.34,1.3,.64,1)
 * while the one it left shrinks on the same curve, so the row's total width
 * holds; the pink fills over 250ms; the label fades in 150ms after the tab
 * starts to open. Only width, colour, opacity and a 1.5pt nudge animate.
 *
 * ── WHY IT IS ABSOLUTELY POSITIONED ───────────────────────────────────
 *
 * In normal flow the bar is a sibling of the scene container in the
 * navigator's column, so it reserves its own band of the screen — and that
 * band had to be painted an opaque page-grey, which is a strip, not a floating
 * bar. Taking it out of flow lets the scene fill the whole screen and the page
 * run underneath, so the only thing over the content is the pill itself.
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
import {
  createRef,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requireOptionalNativeModule } from 'expo';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurTargetView, BlurView } from 'expo-blur';
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
const BAR_H = 66;
/** How far the bar sits above where it used to — the approved 6pt. */
const LIFT = 6;

const LIQUID = Platform.OS === 'ios' && isLiquidGlassAvailable();
const BLUR = requireOptionalNativeModule('ExpoBlur') != null;

const GROW = cubicBezier(0.34, 1.3, 0.64, 1);
/** Unselected tab circle: a neutral tint that reads on glass, not a solid grey. */
const IDLE_FILL = 'rgba(118,118,128,0.12)';

// ── Blur targets (Android) ─────────────────────────────────────────────
// One per tab screen, keyed by route. The bar re-renders when one mounts or
// unmounts so a BlurView never points at a target that is not there yet.
const targets = new Map<string, RefObject<View | null>>();
const listeners = new Set<() => void>();
let version = 0;
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getVersion = () => version;

/**
 * Wraps one tab screen so the bar can blur it on Android. A plain pass-through
 * where the blur does not need a target (iOS) or does not exist.
 */
export function TabBlurTarget({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const needed = BLUR && !LIQUID && Platform.OS === 'android';
  const [ref] = useState(() => {
    const r = createRef<View>();
    if (needed) targets.set(routeKey, r);
    return r;
  });
  useEffect(() => {
    if (!needed) return;
    targets.set(routeKey, ref);
    bump();
    return () => {
      if (targets.get(routeKey) === ref) targets.delete(routeKey);
      bump();
    };
  }, [needed, routeKey, ref]);

  if (!needed) return <>{children}</>;
  return (
    <BlurTargetView ref={ref} style={{ flex: 1 }} collapsable={false}>
      {children}
    </BlurTargetView>
  );
}

/** The glass behind the tabs, by what this phone can draw. See the top. */
function Glass({ routeKey }: { routeKey: string }) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const fill = [StyleSheet.absoluteFill, { borderRadius: BAR_H / 2, overflow: 'hidden' as const }];

  if (LIQUID) {
    return <GlassView style={fill} glassEffectStyle="regular" colorScheme="light" pointerEvents="none" />;
  }
  if (BLUR) {
    return (
      <View style={fill} pointerEvents="none">
        <BlurView
          style={StyleSheet.absoluteFill}
          tint="light"
          intensity={Platform.OS === 'android' ? 90 : 60}
          blurMethod="dimezisBlurView"
          blurTarget={Platform.OS === 'android' ? targets.get(routeKey) : undefined}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.45)' }]} />
      </View>
    );
  }
  return <View style={[fill, { backgroundColor: 'rgba(255,255,255,0.88)' }]} pointerEvents="none" />;
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const [innerW, setInnerW] = useState(0);
  const n = state.routes.length;
  const extra = Math.max(0, innerW - n * SLOT - (n - 1) * GAP);

  // No transition for the first measurement — the focused tab should open at
  // launch already open, not grow in.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (!innerW || animate) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [innerW, animate]);

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
        // The home-indicator gap on a notched phone (a fixed cushion
        // elsewhere), plus the lift.
        paddingBottom: (insets.bottom > 0 ? insets.bottom : t.spacing.md) + LIFT,
      }}
    >
      <View
        onLayout={(e) => setInnerW(e.nativeEvent.layout.width - PAD * 2)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: GAP,
          height: BAR_H,
          borderRadius: BAR_H / 2,
          paddingHorizontal: PAD,
          borderWidth: LIQUID ? 0 : 1,
          borderColor: 'rgba(255,255,255,0.7)',
          boxShadow: '0 12px 40px -12px rgba(23,20,29,0.28)',
        }}
      >
        <Glass routeKey={state.routes[state.index].key} />

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
              width={isFocused ? SLOT + extra : SLOT}
              animate={animate}
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
  width,
  animate,
  focused,
  label,
  badge,
  renderIcon,
  onPress,
  onLongPress,
}: {
  width: number;
  animate: boolean;
  focused: boolean;
  label: string;
  badge: string | null;
  renderIcon: (color: string) => ReactNode;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useTheme();
  const on = focused ? 1 : 0;
  const ms = (d: number) => (animate ? d : 0);

  return (
    <Animated.View
      style={{
        height: SLOT,
        width,
        borderRadius: SLOT / 2,
        backgroundColor: focused ? t.color.brand : IDLE_FILL,
        transitionProperty: ['width', 'backgroundColor'],
        transitionDuration: [ms(450), ms(250)],
        transitionTimingFunction: [GROW, 'ease'],
      }}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? `${label}, ${badge} new` : label}
        hitSlop={4}
        style={{ flex: 1, borderRadius: SLOT / 2, overflow: 'hidden' }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: (SLOT - ICON) / 2,
            left: (SLOT - ICON) / 2,
            width: ICON,
            height: ICON,
            transform: [{ translateX: on * (15 - (SLOT - ICON) / 2) }],
            transitionProperty: 'transform',
            transitionDuration: ms(450),
            transitionTimingFunction: GROW,
          }}
        >
          <Animated.View style={{ position: 'absolute', opacity: 1 - on, transitionProperty: 'opacity', transitionDuration: ms(250) }}>
            {renderIcon(t.color.contentSoft)}
          </Animated.View>
          <Animated.View style={{ position: 'absolute', opacity: on, transitionProperty: 'opacity', transitionDuration: ms(250) }}>
            {renderIcon(t.color.white)}
          </Animated.View>
        </Animated.View>
        <Animated.View
          style={{
            position: 'absolute',
            left: 15 + ICON + 8,
            top: 0,
            bottom: 0,
            justifyContent: 'center',
            opacity: on,
            transitionProperty: 'opacity',
            transitionDuration: ms(200),
            transitionDelay: focused ? ms(150) : 0,
          }}
        >
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
