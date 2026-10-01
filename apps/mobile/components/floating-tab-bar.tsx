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
import { useContext } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

/**
 * v2 pill bar: the current tab is a labelled pink pill; the others are quiet
 * grey circles. The label only appears where you are, so five destinations fit
 * without five cramped captions — and the pill growing into place on a tab
 * change (LinearTransition) is the bar's one bit of motion.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);

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
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 66,
          borderRadius: 33,
          paddingHorizontal: 9,
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
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused ? t.color.white : t.color.contentSoft;
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

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Animated.View key={route.key} layout={LinearTransition.springify().damping(18).stiffness(180)}>
              <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={badge ? `${label}, ${badge} new` : label}
                hitSlop={4}
                style={{
                  height: 48,
                  minWidth: 48,
                  borderRadius: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingLeft: isFocused ? 15 : 0,
                  paddingRight: isFocused ? 18 : 0,
                  backgroundColor: isFocused ? t.color.brand : t.color.surface,
                }}
              >
                {options.tabBarIcon?.({ focused: isFocused, color, size: 21 })}
                {isFocused ? (
                  <Txt numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 18, fontWeight: '700', color: t.color.white }}>
                    {label}
                  </Txt>
                ) : null}
                {!isFocused && badge != null && badge !== '' ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 2,
                      minWidth: 17,
                      height: 17,
                      paddingHorizontal: 4,
                      borderRadius: 9,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: t.color.brand2,
                      borderWidth: 2,
                      borderColor: t.color.surface,
                    }}
                  >
                    <Txt style={{ color: t.color.white, fontSize: 9, lineHeight: 11, fontWeight: '800' }}>
                      {badge}
                    </Txt>
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}
