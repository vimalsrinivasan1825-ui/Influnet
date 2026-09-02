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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

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
        paddingHorizontal: t.spacing.md,
        paddingTop: t.spacing.sm,
        // The home-indicator gap on a notched phone; a fixed cushion elsewhere.
        paddingBottom: insets.bottom > 0 ? insets.bottom : t.spacing.md,
      }}
    >
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            height: 60,
            borderRadius: 24,
            paddingHorizontal: t.spacing.xs,
            backgroundColor: t.color.surfaceCard,
            borderWidth: 1,
            borderColor: t.color.hairline,
          },
          // A touch heavier than `shadows.raised`, and with a small offset
          // rather than a big downward one: content now scrolls BEHIND this,
          // so the separation has to read around the sides and top — a shadow
          // thrown mostly downward is thrown off the bottom of the screen.
          {
            shadowColor: '#0f172a',
            shadowOpacity: 0.14,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 4 },
            elevation: 12,
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused ? t.color.brand : t.color.contentMuted;
          const label =
            typeof options.title === 'string' ? options.title : route.name;
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
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                paddingVertical: 6,
              }}
            >
              <View>
                {options.tabBarIcon?.({ focused: isFocused, color, size: 22 })}
                {badge != null && badge !== '' ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -5,
                      right: -10,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 4,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: t.color.brand,
                      borderWidth: 1.5,
                      borderColor: t.color.surfaceCard,
                    }}
                  >
                    <Txt
                      style={{
                        color: t.color.white,
                        fontSize: 9,
                        lineHeight: 11,
                        fontWeight: '700',
                      }}
                    >
                      {badge}
                    </Txt>
                  </View>
                ) : null}
              </View>
              <Txt
                numberOfLines={1}
                style={{ fontSize: 10, lineHeight: 13, fontWeight: '600', color }}
              >
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
