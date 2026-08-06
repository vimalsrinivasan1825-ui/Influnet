import { useState, useRef, type ReactNode } from 'react';
import { TextInput, View, Pressable, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';
import { useRevealFocusedInput } from './keyboard-avoider';

export interface FieldProps extends TextInputProps {
  label?: string;
  /** Error text. Present means the field renders in its error state. */
  error?: string | null;
  /** Neutral helper line; hidden while an error is showing. */
  hint?: string | null;
  right?: ReactNode;
  /** Leading adornment — platform marks on the social fields, mostly. */
  left?: ReactNode;
  containerStyle?: ViewStyle;
}

export function Field({
  label,
  error,
  hint,
  right,
  left,
  containerStyle,
  style,
  multiline,
  ...rest
}: FieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const revealFocusedInput = useRevealFocusedInput();

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

      <Pressable
        onPress={() => inputRef.current?.focus()}
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
        {left ? <View style={{ marginRight: t.spacing.sm }}>{left}</View> : null}
        <TextInput
          ref={inputRef}
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
          // The caret itself, and the highlight drawn behind selected text.
          // Android takes both from the system accent when unset, which against
          // a white field left nothing visible to aim with.
          cursorColor={t.color.brand}
          selectionColor={t.color.brand}
          /**
           * The drag handle — Android's teardrop under the caret — is hidden.
           *
           * Tapping already puts the caret where you tapped, so the handle adds
           * a large coloured blob over the text in exchange for a second way to
           * do the same thing. Transparent rather than unset: leaving it out
           * falls back to the system accent, which differs by device and is the
           * very thing that made this invisible in the first place. Hidden is
           * not disabled — it still drags, it just isn't painted.
           */
          selectionHandleColor="transparent"
          onFocus={(e) => {
            setFocused(true);
            // Moving between two fields with the keyboard already up fires no
            // keyboard event, so the scroller would otherwise never learn that
            // the thing it needs to keep visible has changed. The delay lets
            // focus settle and any layout the field does on focus land first.
            revealFocusedInput(120);
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
      </Pressable>

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
