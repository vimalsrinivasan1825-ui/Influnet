import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, Sparkles } from 'lucide-react-native';
import { accents } from '@influnet/tokens';
import { useTheme } from '@/lib/theme';
import { Card, ScreenScroll, Txt } from '@/components/ui';
import { Pressable } from 'react-native';

export default function SignupRoleFork() {
  const t = useTheme();
  const router = useRouter();

  const options = [
    {
      role: 'creator' as const,
      title: 'I create content',
      body: 'Build a profile, receive brand requests, run campaigns.',
      accent: accents.creator.brand,
      icon: <Sparkles size={22} color={accents.creator.brand} />,
    },
    {
      role: 'business' as const,
      title: 'I represent a business',
      body: 'Discover creators and run campaigns. Reviewed before going live.',
      accent: accents.brand.brand,
      icon: <Building2 size={22} color={accents.brand.brand} />,
    },
  ];

  return (
    <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing.xl, gap: t.spacing.lg }}>
      <Txt variant="title1">Which best describes you?</Txt>

      <View style={{ gap: t.spacing.md }}>
        {options.map((o) => (
          <Pressable key={o.role} onPress={() => router.push(`/signup/${o.role}`)} accessibilityRole="button">
            {({ pressed }) => (
              <Card
                raised
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.lg,
                  borderColor: pressed ? o.accent : t.color.hairline,
                }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: `${o.accent}18`,
                  }}
                >
                  {o.icon}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="title3">{o.title}</Txt>
                  <Txt variant="footnote" tone="muted">
                    {o.body}
                  </Txt>
                </View>
              </Card>
            )}
          </Pressable>
        ))}
      </View>
    </ScreenScroll>
  );
}
