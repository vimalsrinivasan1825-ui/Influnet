/**
 * "Add other handles" — the optional platforms, collapsed behind their own
 * logos until someone asks for one.
 *
 * Signup used to render five full handle fields at once, which made a step
 * whose only requirement is Instagram look like five requirements. Four of
 * those fields are optional and most creators fill none of them, so they now
 * start as a row of brand marks: tap YouTube and the YouTube field appears,
 * tap it again (while empty) and it goes away.
 *
 * A field holding a handle never collapses. The value would still be submitted,
 * and a hidden input that reaches the server is how someone signs up with a
 * handle they can no longer see or correct.
 *
 * The web signup has the same section (apps/web/src/components/signup/
 * social-disclosure.tsx) — same rules, same copy.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';
import { SOCIAL_ICONS, type SocialIconName } from '@/components/social-icons';

export interface SocialDisclosureItem {
  platform: SocialIconName;
  label: string;
  /** True when the field currently holds a handle — keeps it from collapsing. */
  filled: boolean;
  body: React.ReactNode;
}

export function SocialDisclosure({
  items,
  title = 'Add other handles',
  subtitle,
}: {
  items: SocialDisclosureItem[];
  title?: string;
  subtitle?: string;
}) {
  const t = useTheme();
  // Anything that already has a value opens on mount, so stepping back through
  // the wizard shows what was typed rather than an innocent-looking chip row.
  const [opened, setOpened] = useState<SocialIconName[]>(() =>
    items.filter((i) => i.filled).map((i) => i.platform),
  );

  const toggle = (item: SocialDisclosureItem) => {
    setOpened((prev) => {
      if (!prev.includes(item.platform)) return [...prev, item.platform];
      if (item.filled) return prev;
      return prev.filter((p) => p !== item.platform);
    });
  };

  return (
    <View style={{ gap: t.spacing.md }}>
      <View style={{ gap: 2 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? (
          <Txt variant="footnote" tone="muted">
            {subtitle}
          </Txt>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
        {items.map((item) => {
          const open = opened.includes(item.platform);
          const Icon = SOCIAL_ICONS[item.platform];
          return (
            <Pressable
              key={item.platform}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${open ? 'Hide' : 'Add'} ${item.label}`}
              onPress={() => toggle(item)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.sm,
                paddingVertical: 10,
                paddingHorizontal: t.spacing.md,
                borderRadius: t.radii.md,
                borderWidth: 1,
                borderColor: item.filled
                  ? t.color.ok
                  : open
                    ? t.color.brand
                    : t.color.hairlineStrong,
                backgroundColor: item.filled
                  ? t.color.okSoft
                  : open
                    ? t.color.brandSoft
                    : t.color.surfaceCard,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Icon size={17} />
              <Txt variant="footnote">{item.label}</Txt>
              {item.filled ? (
                <Check size={14} color={t.color.ok} />
              ) : (
                <Plus
                  size={14}
                  color={open ? t.color.brand : t.color.contentMuted}
                  style={{ transform: [{ rotate: open ? '45deg' : '0deg' }] }}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      {items
        .filter((item) => opened.includes(item.platform))
        .map((item) => (
          <View key={item.platform}>{item.body}</View>
        ))}
    </View>
  );
}
