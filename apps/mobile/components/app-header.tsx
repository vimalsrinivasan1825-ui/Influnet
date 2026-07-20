import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Avatar, Txt } from '@/components/ui';

/** Large-title header with the notification bell. Used on tab roots. */
export function AppHeader({
  title,
  subtitle,
  avatarUri,
  avatarName,
  showBell = true,
  unread,
}: {
  title: string;
  subtitle?: string | null;
  avatarUri?: string | null;
  avatarName?: string | null;
  showBell?: boolean;
  unread?: number;
}) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + t.spacing.sm,
        paddingBottom: t.spacing.md,
        paddingHorizontal: t.spacing.screen,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        backgroundColor: t.color.surface,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        {subtitle ? (
          <Txt variant="footnote" tone="muted">
            {subtitle}
          </Txt>
        ) : null}
        <Txt variant="title1" numberOfLines={1} style={{ letterSpacing: -0.4 }}>
          {title}
        </Txt>
      </View>

      {showBell ? (
        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={{ padding: 6 }}
        >
          <Bell size={22} color={t.color.contentSoft} />
          {unread && unread > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: t.color.brand,
                borderWidth: 1.5,
                borderColor: t.color.surface,
              }}
            />
          ) : null}
        </Pressable>
      ) : null}

      {avatarName !== undefined || avatarUri ? (
        <Pressable onPress={() => router.push('/profile')} accessibilityLabel="Your profile">
          <Avatar uri={avatarUri} name={avatarName} size={38} />
        </Pressable>
      ) : null}
    </View>
  );
}
