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
 * Rendered in normal layout flow, so the navigator reserves its height and no
 * screen has to add bottom padding to clear it.
 */
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: t.color.surface,
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
          t.shadows.raised,
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
