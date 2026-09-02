/**
 * The "something just happened for the first time" card.
 *
 * Visually the loudest thing Home ever shows, and deliberately so: it appears
 * at most four times in an account's whole life (see lib/use-first-milestone.ts)
 * and each appearance is the first proof that a part of the product works.
 *
 * ── WHY IT IS NOT A TOAST ─────────────────────────────────────────────
 *
 * A toast is the obvious shape for "you got a new view" and it is the wrong
 * one. Toasts are interruptions that expire, so they arrive while the user is
 * mid-task and are gone before they mean anything — and this event usually
 * happens while the app is shut, so there is no moment to interrupt.
 *
 * A card at the top of Home is the opposite: it waits. The user finds it on
 * their own terms, on the screen where the number it is about also lives, and
 * it stays until they acknowledge it. After that the fact does not disappear —
 * it carries on living in the "At a glance" tile, which now has a real number
 * in it instead of a dash. The card is the announcement; the tile is the
 * record.
 *
 * ── AND WHY IT IS DISMISSED BY THE POSITIVE ACTION ────────────────────
 *
 * Both buttons acknowledge. There is no "×" that means "never mind" — a
 * celebration with a reject affordance reads as an ad. The quiet option is
 * "Got it", the loud one takes them to the thing, and either way the milestone
 * is marked seen.
 *
 * ── THE FIRST-PAYMENT VARIANT ─────────────────────────────────────────
 *
 * `first_payment` is the one milestone that gets its own treatment: the 3D
 * wallet illustration bleeding off the bottom-right corner, matching the
 * reference the founder signed off. Everything else keeps the animated
 * Sparkles roundel below. The card colours are still the role token
 * (`brand` / `brandSoft` / `brandRing`), not a hard-coded purple.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import type { Milestone } from '@/lib/use-first-milestone';
import { Button, Card, Txt } from '@/components/ui';

const WALLET = require('../assets/wallet-image.png');
/** Intrinsic aspect of wallet-image.png (trimmed), width ÷ height. */
const WALLET_RATIO = 760 / 514;

export function HomeMilestoneCard({
  milestone,
  onAcknowledge,
}: {
  milestone: Milestone;
  onAcknowledge: () => void;
}) {
  const t = useTheme();
  const router = useRouter();

  const goToThing = () => {
    // Acknowledge on the way out. Someone who followed the card to the thing it
    // is about has unambiguously seen it, and leaving it un-acknowledged would
    // greet them with it again on the way back.
    onAcknowledge();
    router.push(milestone.href as never);
  };

  const goButton = (
    <Button label={milestone.cta} size="md" onPress={goToThing} style={{ flex: 1 }} />
  );
  const gotItButton = (
    <Button
      label="Got it"
      variant="secondary"
      size="md"
      onPress={onAcknowledge}
      style={{ flex: 1 }}
    />
  );

  // ── First payment: the wallet card ───────────────────────────────
  // `visual` is set only for a creator's first payment; the business side and
  // every other milestone fall through to the Sparkles card below.
  if (milestone.visual === 'wallet') {
    // Positive action leads, matching the signed-off reference.
    const actions = (
      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        {goButton}
        {gotItButton}
      </View>
    );
    return (
      <Card
        raised
        style={{
          gap: t.spacing.lg,
          backgroundColor: t.color.brandSoft,
          borderColor: t.color.brandRing,
        }}
      >
        {/* Bleeds off the bottom-right; the Card's inner view already clips to
            the radius. Behind the content and non-interactive. */}
        <Image
          source={WALLET}
          contentFit="contain"
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -18,
            bottom: -14,
            width: 146,
            height: 146 / WALLET_RATIO,
          }}
        />
        {/* A couple of floating dots, in the role accent — the reference has
            them and they cost nothing. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 14,
            right: 18,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: t.color.brand,
            opacity: 0.35,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 30,
            right: 44,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: t.color.brand,
            opacity: 0.22,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: t.color.brand,
            }}
          >
            <Txt style={{ color: t.color.white, fontSize: 21, fontWeight: '700' }}>₹</Txt>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="title3">{milestone.title} 🎉</Txt>
            <Txt variant="footnote" tone="soft" style={{ paddingRight: 72 }}>
              {milestone.body}
            </Txt>
          </View>
        </View>

        {/* Kept off the full width so the wallet stays visible to their right. */}
        <View style={{ maxWidth: '74%' }}>{actions}</View>
      </Card>
    );
  }

  // Every other milestone keeps the original order: quiet option first.
  return (
    <MilestoneSparklesCard
      milestone={milestone}
      actions={
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          {gotItButton}
          {goButton}
        </View>
      }
    />
  );
}

/**
 * The original design — an animated Sparkles roundel — for every milestone
 * except the first payment.
 */
function MilestoneSparklesCard({
  milestone,
  actions,
}: {
  milestone: Milestone;
  actions: React.ReactNode;
}) {
  const t = useTheme();

  // Two motions, both on the icon and neither on the card. Animating the whole
  // card would move the text under a reading eye; confining it to a 46pt
  // roundel gives the screen a focal point without making anything harder to
  // read.
  const pop = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    // A single overshoot on arrival — the card is already new, so this only has
    // to point at where to look first.
    pop.value = withTiming(1, { duration: 420, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
    // Then a slow, twice-only breath. An indefinite pulse on a static screen is
    // a distraction with no end state; twice reads as alive and then settles.
    shimmer.value = withDelay(
      420,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        2,
        false,
      ),
    );
  }, [pop, shimmer]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + pop.value * 0.4 + shimmer.value * 0.06 }],
    opacity: pop.value,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + shimmer.value * 0.35,
    transform: [{ scale: 1 + shimmer.value * 0.18 }],
  }));

  return (
    <Card
      raised
      style={{
        gap: t.spacing.lg,
        // The role accent at its softest, with a real border rather than a
        // hairline. This is the one card that should look different from every
        // other card on the screen.
        backgroundColor: t.color.brandSoft,
        borderColor: t.color.brandRing,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.lg }}>
        <View style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: t.color.brand,
              },
              haloStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.color.brand,
              },
              iconStyle,
            ]}
          >
            <Sparkles size={19} color={t.color.white} />
          </Animated.View>
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="title3">{milestone.title}</Txt>
          <Txt variant="footnote" tone="soft">
            {milestone.body}
          </Txt>
        </View>
      </View>

      {actions}
    </Card>
  );
}
