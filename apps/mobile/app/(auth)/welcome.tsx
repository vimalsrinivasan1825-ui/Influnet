/**
 * First screen. The store listing is the marketing page, so this does one job:
 * say what Influnet is in a line and fork by who you are.
 *
 * Centred and mark-led, matching the launch animation that precedes it — the
 * logo lands in roughly the place it just animated to, so the app opens as one
 * continuous movement rather than a splash followed by an unrelated form.
 */
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, Sparkles } from 'lucide-react-native';
import { accents } from '@influnet/tokens';
import { useTheme } from '@/lib/theme';
import { AuthHeader } from '@/components/brand/auth-header';
import { Button, Card, Screen, Txt } from '@/components/ui';

function RoleCard({
  title,
  body,
  icon,
  accent,
  onPress,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
  accent: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <Card
          raised
          style={{
            borderColor: pressed ? accent : t.color.hairline,
            opacity: pressed ? 0.95 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.lg,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${accent}18`,
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="title3">{title}</Txt>
            <Txt variant="footnote" tone="muted">
              {body}
            </Txt>
          </View>
        </Card>
      )}
    </Pressable>
  );
}

export default function Welcome() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen style={{ paddingTop: insets.top + t.spacing['3xl'] }}>
      <View
        style={{
          flex: 1,
          justifyContent: 'space-between',
          paddingBottom: insets.bottom + t.spacing.xl,
        }}
      >
        <AuthHeader
          title="Influnet"
          subtitle="Where brands and creators run campaigns end to end — discovery, terms, delivery and payment in one place."
        />

        <View style={{ gap: t.spacing.md }}>
          <Txt
            variant="caption"
            tone="muted"
            center
            style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
          >
            Get started as
          </Txt>

          <RoleCard
            title="Creator"
            body="Get discovered, agree terms, get paid on time."
            accent={accents.creator.brand}
            icon={<Sparkles size={22} color={accents.creator.brand} />}
            onPress={() => router.push('/signup/creator')}
          />

          <RoleCard
            title="Business"
            body="Find creators who fit, and run the campaign."
            accent={accents.brand.brand}
            icon={<Building2 size={22} color={accents.brand.brand} />}
            onPress={() => router.push('/signup/business')}
          />
        </View>

        <Button
          label="I already have an account"
          variant="secondary"
          onPress={() => router.push('/login')}
        />
      </View>
    </Screen>
  );
}
