/**
 * Signup wizard shell.
 *
 * The web asks for everything on one long form. On a phone that's an abandoned
 * signup, so the same fields become one question per screen with a progress
 * rail, a sticky primary action, and no way to advance until the step is valid.
 */
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
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
  nextLabel = 'Continue',
  nextDisabled,
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
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  footer?: ReactNode;
}) {
  const t = useTheme();

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
