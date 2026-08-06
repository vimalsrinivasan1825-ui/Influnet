/**
 * "You're verified" — the badge landing, shown once, on the way into the app.
 *
 * Distinct from BioVerifyCelebration, which fires mid-signup when a bio link
 * matches. That one marks a STEP passing. This one marks the actual outcome:
 * the pipeline finished, the badge is granted, and brands now see it next to
 * this creator's name. It arrives minutes to hours after the work that earned
 * it — usually while the app is closed — so without something like this the
 * only evidence is a small mark appearing on a profile screen nobody was
 * looking at.
 *
 * A `Modal` here, unlike the signup one: that had to stay inline because a
 * Modal's own native window layer covered the wizard's header and footer and
 * ate their touches. There is no such chrome to protect on Home, and this is a
 * thing you dismiss rather than something you scroll past.
 *
 * Colour is `verified`, not `ok` — see packages/tokens: the trust mark is
 * deliberately its own fixed pink, not the role accent and not generic success
 * green.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, View } from 'react-native';
import { BadgeCheck } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Button, Txt } from '@/components/ui';

const RING_COUNT = 3;
const RING_STAGGER_MS = 260;
const RING_DURATION_MS = 1400;
const DISC = 104;

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
    // Loops gently rather than firing once: this modal sits until it is
    // dismissed, and a still frame after one pulse looks like a bug.
    const loop = Animated.loop(anim);
    loop.start();
    return () => loop.stop();
  }, [progress, delay]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 2.4] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: DISC,
        height: DISC,
        borderRadius: DISC / 2,
        borderWidth: 2,
        borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

export function VerifiedCelebration({
  visible,
  name,
  onDismiss,
  onSeeProfile,
}: {
  visible: boolean;
  /** First name, for the one line that should feel addressed to a person. */
  name?: string | null;
  onDismiss: () => void;
  onSeeProfile: () => void;
}) {
  const t = useTheme();
  const discScale = useRef(new Animated.Value(0)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(12)).current;
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowActions(false);
      return;
    }
    discScale.setValue(0);
    markOpacity.setValue(0);
    textOpacity.setValue(0);
    textY.setValue(12);

    Animated.sequence([
      Animated.spring(discScale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
      Animated.timing(markOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    Animated.parallel([
      Animated.timing(textOpacity, { toValue: 1, duration: 320, delay: 280, useNativeDriver: true }),
      Animated.timing(textY, {
        toValue: 0,
        duration: 320,
        delay: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // Imported lazily for the same reason the signup celebration does it: this
    // component is on Home's render path and haptics are not.
    void import('expo-haptics').then((Haptics) =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );

    const reveal = setTimeout(() => setShowActions(true), 900);
    return () => clearTimeout(reveal);
  }, [visible, discScale, markOpacity, textOpacity, textY]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(9, 9, 20, 0.62)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: t.spacing.xl,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: t.color.surfaceCard,
            borderRadius: t.radii.lg,
            paddingVertical: t.spacing['3xl'],
            paddingHorizontal: t.spacing.xl,
            alignItems: 'center',
            ...t.shadows.pop,
          }}
        >
          <View style={{ width: DISC, height: DISC, alignItems: 'center', justifyContent: 'center' }}>
            {Array.from({ length: RING_COUNT }).map((_, i) => (
              <Ring key={i} delay={i * RING_STAGGER_MS} color={t.color.verified} />
            ))}
            <Animated.View
              style={{
                width: DISC,
                height: DISC,
                borderRadius: DISC / 2,
                backgroundColor: t.color.verified,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: discScale }],
              }}
            >
              <Animated.View style={{ opacity: markOpacity }}>
                <BadgeCheck size={48} color={t.color.white} strokeWidth={2.4} />
              </Animated.View>
            </Animated.View>
          </View>

          <Animated.View
            style={{
              marginTop: t.spacing['3xl'],
              alignItems: 'center',
              gap: 8,
              opacity: textOpacity,
              transform: [{ translateY: textY }],
            }}
          >
            <Txt variant="title1" center>
              {name ? `You're verified, ${name}` : "You're verified"}
            </Txt>
            <Txt variant="body" tone="soft" center>
              The badge now shows next to your name — on your public profile, in
              search, and on every request a brand sends you.
            </Txt>
          </Animated.View>

          {showActions ? (
            <View style={{ alignSelf: 'stretch', gap: t.spacing.sm, marginTop: t.spacing.xl }}>
              <Button label="See how brands see me" onPress={onSeeProfile} />
              <Button label="Not now" variant="ghost" size="md" onPress={onDismiss} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
