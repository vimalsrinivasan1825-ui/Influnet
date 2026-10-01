/**
 * Slide to confirm — for the one action in the app that binds both sides: a
 * stage sign-off. A tap is too cheap a gesture for "I agree this stage is
 * done"; dragging the knob across makes it deliberate without a second
 * "are you sure?" dialog.
 *
 * Releasing before 85% springs the knob back. The knob also returns when
 * `busy` clears, so a failed request leaves the control usable again rather
 * than stuck at the far end. Screen readers get a plain "activate" action —
 * a drag is not something VoiceOver/TalkBack users can be asked to do.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Check, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

const KNOB = 50;
const PAD = 4;

export function SlideToConfirm({
  label,
  onConfirm,
  busy,
  disabled,
  tone = 'brand',
}: {
  label: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** `ink` for use on a pink surface, where a pink track would disappear. */
  tone?: 'brand' | 'ink';
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(0, width - KNOB - PAD * 2);
  const x = useSharedValue(0);
  const track = tone === 'ink' ? t.color.content : t.color.brand;

  const fire = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };

  // Back to the start once the request settles (success re-renders the screen
  // anyway; failure needs the knob home so the person can try again).
  useEffect(() => {
    if (!busy) x.value = withSpring(0, { damping: 18, stiffness: 180 });
  }, [busy, x]);

  const pan = Gesture.Pan()
    .enabled(!busy && !disabled && max > 0)
    .activeOffsetX(4)
    .onUpdate((e) => {
      x.value = Math.min(max, Math.max(0, e.translationX));
    })
    .onEnd(() => {
      if (x.value > max * 0.85) {
        x.value = withTiming(max, { duration: 120 });
        runOnJS(fire)();
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 180 });
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: max > 0 ? interpolate(x.value, [0, max * 0.6], [1, 0], 'clamp') : 1,
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + KNOB + PAD * 2 }));

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !busy && !disabled) fire();
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        height: KNOB + PAD * 2,
        borderRadius: (KNOB + PAD * 2) / 2,
        backgroundColor: track,
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {/* The travelled part brightens as you drag — progress you can feel. */}
      <Animated.View
        style={[
          { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: (KNOB + PAD * 2) / 2, backgroundColor: 'rgba(255,255,255,0.16)' },
          fillStyle,
        ]}
      />
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', paddingLeft: KNOB + PAD * 2 + 10, paddingRight: 16 }, labelStyle]}>
        <Txt numberOfLines={1} style={{ flex: 1, color: '#fff', fontSize: 15.5, fontWeight: '700' }}>{label}</Txt>
        <ChevronRight size={17} color="rgba(255,255,255,0.75)" />
        <ChevronRight size={17} color="rgba(255,255,255,0.45)" style={{ marginLeft: -9 }} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: PAD,
              top: PAD,
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            },
            knobStyle,
          ]}
        >
          {busy ? <ActivityIndicator color={track} /> : <Check size={22} color={track} strokeWidth={2.8} />}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
