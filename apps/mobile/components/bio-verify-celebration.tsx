/**
 * Full-screen "you're verified" moment — the checkout-confirmation style
 * animation (Flipkart/Amazon order-placed) rather than a small inline card,
 * because this is the actual payoff of the bio-link flow and deserves the
 * whole screen, not a box competing with a scrollview around it.
 *
 * Three rings sonar out from a center disc, staggered, fading as they grow —
 * expo-blur territory this isn't; it's four Animated.Values, which every RN
 * app already has for free, so it ships over OTA the same as everything else
 * in this step.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

const RING_COUNT = 3;
const RING_STAGGER_MS = 260;
const RING_DURATION_MS = 1400;

function Ring({ delay, color }: { delay: number; color: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: RING_DURATION_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, delay]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.6] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: 96,
        height: 96,
        borderRadius: 48,
        borderWidth: 2,
        borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

export function BioVerifyCelebration({ visible, handle }: { visible: boolean; handle: string }) {
  const t = useTheme();
  const discScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (!visible) return;
    discScale.setValue(0);
    checkOpacity.setValue(0);
    textOpacity.setValue(0);
    textY.setValue(10);

    Animated.sequence([
      Animated.spring(discScale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
    Animated.parallel([
      Animated.timing(textOpacity, { toValue: 1, duration: 320, delay: 260, useNativeDriver: true }),
      Animated.timing(textY, { toValue: 0, duration: 320, delay: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    void import('expo-haptics').then((Haptics) =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    );
  }, [visible, discScale, checkOpacity, textOpacity, textY]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.color.surface, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
          {Array.from({ length: RING_COUNT }).map((_, i) => (
            <Ring key={i} delay={i * RING_STAGGER_MS} color={t.color.ok} />
          ))}
          <Animated.View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: t.color.ok,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: discScale }],
            }}
          >
            <Animated.View style={{ opacity: checkOpacity }}>
              <Check size={44} color={t.color.white} strokeWidth={3} />
            </Animated.View>
          </Animated.View>
        </View>

        <Animated.View
          style={{
            marginTop: t.spacing['3xl'],
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: t.spacing['3xl'],
            opacity: textOpacity,
            transform: [{ translateY: textY }],
          }}
        >
          <Txt variant="title2" center>
            @{handle.replace(/^@/, '')} is yours
          </Txt>
          <Txt variant="body" tone="muted" center>
            Verified from your bio. Taking you to the next step…
          </Txt>
        </Animated.View>
      </View>
    </Modal>
  );
}
