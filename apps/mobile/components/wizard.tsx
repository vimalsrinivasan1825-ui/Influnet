/**
 * Signup wizard shell.
 *
 * The web asks for everything on one long form. On a phone that's an abandoned
 * signup, so the same fields become one question per screen with a progress
 * rail, a sticky primary action, and no way to advance until the step is valid.
 */
import { useLayoutEffect, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Button, ScreenScroll, StickyFooter, Txt } from '@/components/ui';

/** Segmented progress rail — filled segments, not a percentage. */
export function WizardProgress({ step, total }: { step: number; total: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginBottom: t.spacing.lg }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: i <= step ? t.color.brand : t.color.hairlineStrong,
          }}
        />
      ))}
    </View>
  );
}

export function WizardStep({
  step,
  total,
  title,
  subtitle,
  children,
  onNext,
  onBack,
  nextLabel = 'Continue',
  nextDisabled,
  /**
   * True on the last step, where onNext creates the account rather than just
   * advancing. That's a bigger commitment than "next question" and gets its
   * own explicit, clearly-labeled tap — the header arrow is withheld there on
   * purpose, so "Create account" can only be triggered from the full-width
   * button a thumb has to deliberately land on.
   */
  isLastStep,
  busy,
  error,
  footer,
}: {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onNext: () => void;
  /**
   * Steps back one question. Omitted on the first step, where the only way
   * back is out of the wizard entirely, and the navigator's own default back
   * button already does exactly that.
   */
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isLastStep?: boolean;
  busy?: boolean;
  error?: string | null;
  footer?: ReactNode;
}) {
  const t = useTheme();
  const navigation = useNavigation();

  // Both directions live in the header, driven by explicit custom buttons —
  // not the navigator's default back chevron plus a `beforeRemove`
  // interception (useWizardBack), which is what this used to be. That works
  // on Android, but native-stack's iOS back button is presented and
  // dismissed by UIKit itself; the JS-side `beforeRemove` listener can lose
  // the race against the native pop, so a tap occasionally went straight
  // through to the previous SCREEN (out of the wizard entirely) instead of
  // being caught. A custom headerLeft that calls onBack directly has no race
  // to lose — it's just a button, same mechanism as the Next arrow already
  // used here. useWizardBack stays wired in the parent for the edge-swipe
  // gesture, which a header button can't intercept.
  //
  // `headerBackVisible: false` is not belt-and-braces, it is the half of this
  // that makes it true on iOS. native-stack only passes `hideBackButton` to
  // the native header when this option is explicitly false (see
  // useHeaderConfigProps: `hideBackButton: headerBackVisible === false`);
  // leaving it undefined means UIKit is still free to present its own back
  // button — the one labelled with the PREVIOUS SCREEN's title ("Welcome"),
  // which pops the whole wizard back to the role picker and throws away every
  // answer. Saying it outright removes that button entirely, so the only
  // chevron on the screen is the one that steps back a question.
  useLayoutEffect(() => {
    navigation.setOptions({
      // Kept on the first step, where there is no onBack and leaving the
      // wizard really is what "back" should do.
      headerBackVisible: !onBack,
      headerLeft: onBack
        ? () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              hitSlop={8}
              style={{ padding: 10 }}
            >
              <ChevronLeft size={24} color={t.color.content} />
            </Pressable>
          )
        : undefined,
      headerRight: () =>
        isLastStep ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next"
            accessibilityState={{ disabled: !!nextDisabled || !!busy }}
            disabled={nextDisabled || busy}
            onPress={onNext}
            hitSlop={8}
            style={{ padding: 10, opacity: nextDisabled || busy ? 0.3 : 1 }}
          >
            <ChevronRight size={24} color={t.color.brand} />
          </Pressable>
        ),
    });
  }, [navigation, onBack, onNext, nextDisabled, busy, isLastStep, t.color.brand, t.color.content]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing.lg, gap: t.spacing.lg }}>
        <WizardProgress step={step} total={total} />

        <View style={{ gap: 6 }}>
          <Txt variant="title1">{title}</Txt>
          {subtitle ? (
            <Txt variant="callout" tone="muted">
              {subtitle}
            </Txt>
          ) : null}
        </View>

        {children}

        {error ? (
          <View
            style={{
              backgroundColor: t.color.dangerSoft,
              borderRadius: t.radii.md,
              padding: t.spacing.md,
            }}
          >
            <Txt variant="footnote" tone="danger">
              {error}
            </Txt>
          </View>
        ) : null}
      </ScreenScroll>

      <StickyFooter>
        <Button label={nextLabel} onPress={onNext} disabled={nextDisabled} loading={busy} />
        {footer}
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}
