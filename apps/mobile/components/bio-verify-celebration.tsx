/**
 * "You're verified" moment — the checkout-confirmation style animation
 * (Flipkart/Amazon order-placed): three rings sonar out from a center disc,
 * staggered, fading as they grow.
 *
 * Deliberately NOT a `Modal`. The first version was — full-screen, felt
 * "biggest possible" — but a Modal renders into its own native window layer
 * ABOVE everything else, including the wizard's own header (back/next
 * chevrons) and footer (Continue button), which live in the parent
 * `WizardStep` outside this component's tree. That didn't just look wrong;
 * on iOS it also ate the touches meant for those controls, so if the
 * auto-advance timer in the parent screen ever missed for any reason —
 * a slow render, a backgrounded app — there was no way to leave the screen
 * at all. This renders inline instead, sized tall via useWindowDimensions to
 * still dominate the screen, with the wizard's own nav staying reachable the
 * entire time as a fallback that costs nothing to keep.
 *
 * It also carries its OWN "Continue" button rather than trusting the parent's
 * auto-advance timer. Same reasoning one level down: the timer is a nicety, and
 * a screen whose only exit is a timer is a screen that is stuck the one time
 * the timer doesn't fire. The button appears a beat after the animation lands
 * so it never competes with the moment it is celebrating.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { ArrowRight, Check } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';

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

export function BioVerifyCelebration({
  visible,
  handle,
  onContinue,
}: {
  visible: boolean;
  handle: string;
  /** Moves the wizard on. Also driven by the parent's timer; whichever lands first wins. */
  onContinue?: () => void;
}) {
  const t = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const discScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(10)).current;
  const [showAction, setShowAction] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowAction(false);
      return;
    }
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

    const revealAction = setTimeout(() => setShowAction(true), 1200);
    return () => clearTimeout(revealAction);
  }, [visible, discScale, checkOpacity, textOpacity, textY]);

  if (!visible) return null;

  return (
    <View
      style={{
        // Tall enough to dominate the screen the way the checkout-confirmation
        // animations this is modeled on do, without a Modal's own window layer
        // — the wizard's header/footer stay visible and tappable above and
        // below this the entire time.
        minHeight: windowHeight * 0.58,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
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
          Verified from your profile link. Taking you to the next step…
        </Txt>
      </Animated.View>

      {showAction && onContinue ? (
        <View style={{ alignSelf: 'stretch', marginTop: t.spacing.xl, paddingHorizontal: t.spacing['3xl'] }}>
          <Button
            label="Continue"
            onPress={onContinue}
            icon={<ArrowRight size={16} color={t.color.white} />}
          />
        </View>
      ) : null}
    </View>
  );
}
