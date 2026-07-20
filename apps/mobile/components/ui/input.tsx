import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

export interface FieldProps extends TextInputProps {
  label?: string;
  /** Error text. Present means the field renders in its error state. */
  error?: string | null;
  /** Neutral helper line; hidden while an error is showing. */
  hint?: string | null;
  right?: ReactNode;
  containerStyle?: ViewStyle;
}

export function Field({
  label,
  error,
  hint,
  right,
  containerStyle,
  style,
  multiline,
  ...rest
}: FieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? t.color.danger
    : focused
      ? t.color.brand
      : t.color.hairlineStrong;

  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? (
        <Txt variant="footnote" tone="soft">
          {label}
        </Txt>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          borderWidth: 1,
          borderColor,
          borderRadius: t.radii.md,
          backgroundColor: t.color.surfaceCard,
          paddingHorizontal: t.spacing.md,
          // A focus ring the finger doesn't hide.
          ...(focused && !error ? { shadowColor: t.color.brand, shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } } : null),
        }}
      >
        <TextInput
          style={[
            {
              flex: 1,
              minHeight: multiline ? 96 : 50,
              paddingVertical: multiline ? t.spacing.md : 0,
              color: t.color.content,
              fontSize: t.typography.body.fontSize,
            },
            style,
          ]}
          placeholderTextColor={t.color.contentMuted}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...rest}
        />
        {right ? <View style={{ marginLeft: t.spacing.sm }}>{right}</View> : null}
      </View>

      {error ? (
        <Txt variant="footnote" tone="danger">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="footnote" tone="muted">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}
