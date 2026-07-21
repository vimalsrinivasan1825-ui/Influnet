import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Full-width by default — the usual mobile case. */
  inline?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  /** Fires a light tap on press. On for primary actions, off for list rows. */
  haptic?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  loading,
  inline,
  icon,
  style,
  haptic = true,
  disabled,
  onPress,
  ...rest
}: ButtonProps) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary: t.color.brand,
    secondary: t.color.surfaceCard,
    ghost: 'transparent',
    danger: t.color.danger,
  };
  const fg: Record<Variant, string> = {
    primary: t.color.white,
    secondary: t.color.content,
    ghost: t.color.brand,
    danger: t.color.white,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={(e) => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          height: size === 'lg' ? 52 : 44,
          borderRadius: t.radii.md,
          paddingHorizontal: t.spacing.xl,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: t.spacing.sm,
          backgroundColor: bg[variant],
          alignSelf: inline ? 'flex-start' : 'stretch',
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: t.color.hairlineStrong,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
          // Scale rather than a hover state — the finger covers the button, so
          // the feedback has to be visible around the edges.
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} size="small" />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Txt variant="bodyStrong" style={{ color: fg[variant] }}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}
