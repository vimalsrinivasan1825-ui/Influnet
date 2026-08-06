/**
 * "Watch how it works" for the signup ownership step.
 *
 * This is the SAME animation Settings → How to verify plays
 * (components/verification/verify-guide-animation.tsx): a measured camera
 * panning over a phone that copies the link, switches to Instagram, edits the
 * bio, pastes, saves, comes back and verifies. It replaces an earlier
 * signup-only walkthrough built from six flat mini-scenes, which taught the
 * same steps far less clearly and looked like a different product.
 *
 * There is deliberately no second implementation here: the animation is
 * imported, not re-drawn, so the signup and post-signup guides can never drift
 * apart again. The only difference is where the details come from — Settings
 * reads them off the session, and here they are passed in from the wizard,
 * because at this point in signup there is no account yet.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Play, Pause, ShieldCheck, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';
import {
  GUIDE_STEPS,
  VerifyGuideAnimation,
} from '@/components/verification/verify-guide-animation';

export function BioVerifyGuideModal({
  visible,
  onClose,
  displayUrl,
  handle,
  name,
}: {
  visible: boolean;
  onClose: () => void;
  /** Display form of the link the copy button copies, e.g. influnet.in/c/priya. */
  displayUrl: string;
  handle: string;
  name: string;
}) {
  const t = useTheme();
  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);

  const cleanHandle = handle.replace(/^@/, '') || 'yourhandle';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={{ flex: 1, backgroundColor: t.color.surface }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.lg,
            paddingBottom: t.spacing.md,
          }}
        >
          <ShieldCheck size={20} color={t.color.brand} />
          <Txt variant="bodyStrong" style={{ flex: 1 }}>
            How to verify your handle
          </Txt>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: t.color.surfaceMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} color={t.color.contentSoft} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing['3xl'],
            gap: t.spacing.lg,
          }}
        >
          <Txt variant="footnote" tone="muted">
            Step {step + 1} of {GUIDE_STEPS.length} · {GUIDE_STEPS[step]?.label}
          </Txt>

          {/* Mounted only while the sheet is open. The animation runs a frame
              callback for as long as it exists, and this sits inside the
              signup wizard — there is no reason to burn frames behind a
              closed sheet for the rest of the flow. */}
          {visible ? (
            <VerifyGuideAnimation
              displayUrl={displayUrl}
              handle={cleanHandle}
              name={name.trim() || 'Your name'}
              playing={playing}
              onStep={setStep}
            />
          ) : null}

          <View style={{ flexDirection: 'row', gap: 6 }}>
            {GUIDE_STEPS.map((s, i) => (
              <View
                key={s.t}
                style={{
                  height: 6,
                  borderRadius: 3,
                  width: i === step ? 24 : 6,
                  backgroundColor: i === step ? t.color.brand : t.color.hairlineStrong,
                }}
              />
            ))}
          </View>

          <Pressable
            onPress={() => setPlaying((v) => !v)}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'flex-start',
              paddingVertical: 6,
            }}
          >
            {playing ? (
              <Pause size={15} color={t.color.contentSoft} />
            ) : (
              <Play size={15} color={t.color.contentSoft} />
            )}
            <Txt variant="footnote" tone="soft">
              {playing ? 'Pause' : 'Play'}
            </Txt>
          </Pressable>

          <View
            style={{
              backgroundColor: t.color.surfaceMuted,
              borderRadius: t.radii.md,
              padding: t.spacing.md,
            }}
          >
            <Txt variant="footnote" tone="soft">
              Your profile link is what proves the account is yours. Leave it in your links —
              it&apos;s the page you want brands to land on, and we can re-check it later.
            </Txt>
          </View>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: t.spacing.lg,
            paddingBottom: t.spacing['2xl'],
            paddingTop: t.spacing.sm,
            borderTopWidth: 1,
            borderColor: t.color.hairline,
          }}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={{
              height: 48,
              borderRadius: t.radii.md,
              backgroundColor: t.color.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt variant="bodyStrong" style={{ color: t.color.white }}>
              Got it
            </Txt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Small, quiet trigger button — sits above the copy-link field on the step. */
export function WatchGuideButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        padding: t.spacing.md,
        borderRadius: t.radii.md,
        borderWidth: 1,
        borderColor: t.color.brand,
        backgroundColor: t.color.brandSoft,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 9,
          backgroundColor: t.color.brand,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Play size={16} color={t.color.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="footnote" style={{ color: t.color.brandStrong, fontWeight: '600' }}>
          Watch how it works — 30 seconds
        </Txt>
        <Txt variant="footnote" tone="muted" style={{ fontSize: 12 }}>
          Copy · paste into your links · verify
        </Txt>
      </View>
    </Pressable>
  );
}
