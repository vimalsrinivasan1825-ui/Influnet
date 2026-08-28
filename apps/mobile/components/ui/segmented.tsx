import { Pressable, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Optional count, e.g. unread requests. */
  count?: number;
}

/** In-screen switch — Incoming/Sent, Active/Completed. Never for navigation. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.color.surfaceMuted,
        borderRadius: t.radii.md,
        padding: 3,
        gap: 3,
      }}
    >
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <Pressable
            key={s.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(s.value)}
            style={{
              flex: 1,
              flexDirection: 'row',
              gap: 6,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 9,
              borderRadius: t.radii.sm,
              backgroundColor: active ? t.color.surfaceCard : 'transparent',
              // `thumb`, not `card` — see the note in @influnet/tokens. A card's
              // ambient falloff under a 30pt pill is a smudge.
              ...(active ? t.shadows.thumb : null),
            }}
          >
            <Txt variant="footnote" style={{ color: active ? t.color.content : t.color.contentSoft, fontWeight: active ? '600' : '400' }}>
              {s.label}
            </Txt>
            {s.count ? (
              <View
                style={{
                  minWidth: 18,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: t.radii.pill,
                  backgroundColor: active ? t.color.brand : t.color.hairlineStrong,
                  alignItems: 'center',
                }}
              >
                <Txt variant="caption" style={{ color: active ? t.color.white : t.color.contentSoft, fontSize: 11 }}>
                  {s.count}
                </Txt>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
