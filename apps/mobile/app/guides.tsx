/**
 * The guide list. Opened from the play icon in the app headers. Every
 * walkthrough, grouped by category, with a dot on the ones not watched yet.
 * Tapping one opens the shared guide modal.
 */

import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CirclePlay } from 'lucide-react-native';
import { CATEGORY_LABEL, guidesForMenu, timeline } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { ScreenScroll, Txt } from '@/components/ui';
import { useGuides } from '@/components/guides/use-guides';

export default function GuidesScreen() {
  const t = useTheme();
  const router = useRouter();
  const role = useSession((s) => s.profile?.role ?? null);
  const { seen, open } = useGuides();

  const menuRole = role === 'influencer' || role === 'business_owner' ? role : null;
  const sections = useMemo(() => guidesForMenu(menuRole), [menuRole]);

  return (
    <>
      <Stack.Screen options={{ title: 'How things work' }} />
      <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing.md, gap: t.spacing.lg }}>
        <Txt variant="footnote" tone="muted">
          Short walkthroughs — the interface does the talking. Each one plays once on its own the
          first time you open that section.
        </Txt>

        {sections.map((section) => (
          <View key={section.category} style={{ gap: 8 }}>
            <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {CATEGORY_LABEL[section.category]}
            </Txt>
            <View
              style={{
                borderRadius: t.radii.lg,
                borderWidth: 1,
                borderColor: t.color.hairline,
                backgroundColor: t.color.surfaceCard,
                overflow: 'hidden',
              }}
            >
              {section.guides.map((g, i) => {
                const secs = Math.round(timeline(g).total / 1000);
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => {
                      open(g.id, 'launcher');
                      // Close this list so the modal sits over the app, not the list.
                      router.back();
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderColor: t.color.hairline,
                      backgroundColor: pressed ? t.color.surfaceMuted : 'transparent',
                    })}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 11,
                        backgroundColor: t.color.brandSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CirclePlay size={18} color={t.color.brandStrong} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt variant="body" style={{ fontWeight: '600' }}>
                          {g.title}
                        </Txt>
                        {!seen.includes(g.id) ? (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.color.brand }} />
                        ) : null}
                      </View>
                      <Txt variant="caption" tone="muted" numberOfLines={1}>
                        {g.blurb}
                      </Txt>
                    </View>
                    <Txt variant="caption" tone="muted">
                      {secs}s
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScreenScroll>
    </>
  );
}
