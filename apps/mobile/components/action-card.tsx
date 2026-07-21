/**
 * The action queue's unit.
 *
 * Home leads with these on purpose: the single thing mobile does better than
 * the desktop dashboard is turn "something needs your decision" into a ten
 * second interaction. Each card names the decision and goes straight to it.
 */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

export function ActionCard({
  icon,
  title,
  body,
  tone = 'brand',
  onPress,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  tone?: 'brand' | 'warn' | 'ok';
  onPress: () => void;
}) {
  const t = useTheme();

  const tones = {
    brand: { fg: t.color.brand, bg: t.color.brandSoft },
    warn: { fg: t.color.warn, bg: t.color.warnSoft },
    ok: { fg: t.color.ok, bg: t.color.okSoft },
  } as const;
  const c = tones[tone];

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            backgroundColor: t.color.surfaceCard,
            borderRadius: t.radii.lg,
            borderWidth: 1,
            borderColor: c.fg + '40',
            padding: t.spacing.lg,
            opacity: pressed ? 0.9 : 1,
          }}
        >
          {/* Colour bar rather than a tinted card — the accent marks urgency
              without making a wall of cards shout in unison. */}
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.bg,
            }}
          >
            {icon}
          </View>

          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">{title}</Txt>
            <Txt variant="footnote" tone="muted">
              {body}
            </Txt>
          </View>

          <ChevronRight size={18} color={t.color.contentMuted} />
        </View>
      )}
    </Pressable>
  );
}
