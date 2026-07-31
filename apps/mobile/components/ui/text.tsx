/**
 * Typography primitive. Every piece of text in the app goes through this so
 * the scale stays honest — no ad-hoc fontSize values scattered across screens.
 */
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

type Variant = keyof ReturnType<typeof useTheme>['typography'];
type Tone = 'default' | 'soft' | 'muted' | 'brand' | 'ok' | 'warn' | 'danger' | 'inverse';

export interface TxtProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

export function Txt({
  variant = 'body',
  tone = 'default',
  center,
  style,
  ...rest
}: TxtProps) {
  const t = useTheme();

  const toneColor: Record<Tone, string> = {
    default: t.color.content,
    soft: t.color.contentSoft,
    muted: t.color.contentMuted,
    brand: t.color.brand,
    ok: t.color.ok,
    warn: t.color.warn,
    danger: t.color.danger,
    inverse: t.color.white,
  };

  return (
    <RNText
      style={[
        t.typography[variant] as TextStyle,
        { color: toneColor[tone] },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    />
  );
}

/**
 * Money and counts. Tabular figures so digits don't jitter when a number
 * updates in place, and tighter tracking because large numerals read loose.
 */
export function Numeral({ style, ...rest }: TxtProps) {
  return (
    <Txt
      variant="title1"
      style={[{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }, style]}
      {...rest}
    />
  );
}
