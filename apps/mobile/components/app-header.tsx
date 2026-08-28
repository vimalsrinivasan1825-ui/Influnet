import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Search } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Avatar, Txt } from '@/components/ui';
import { Logo } from '@/components/brand/logo';

/** Large-title header with the notification bell. Used on tab roots. */
export function AppHeader({
  title,
  subtitle,
  avatarUri,
  avatarName,
  showBell = true,
  showSearch = true,
  showLogo = true,
  unread,
}: {
  title: string;
  subtitle?: string | null;
  avatarUri?: string | null;
  avatarName?: string | null;
  showBell?: boolean;
  /** Look up a creator by username and view their public profile in-app. */
  showSearch?: boolean;
  /** The mark on the left. On by default — it's how the app signs its screens. */
  showLogo?: boolean;
  unread?: number;
}) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        /**
         * Clear of the status bar, not tight to it.
         *
         * This was `insets.top + 2`, on the reasoning that the large title
         * carries the weight so padding above it is wasted height. On a device
         * with a notch that is true; on the many Android phones whose top inset
         * is a bare status-bar height, the title lands hard against the clock
         * and the signal bars and the screen reads as clipped rather than as
         * dense. A fixed 10pt is the smallest gap that survives both.
         */
        paddingTop: insets.top + 10,
        paddingBottom: t.spacing.sm,
        paddingHorizontal: t.spacing.screen,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        // Deliberately transparent. An opaque fill here cut a grey band
        // straight through the screen's gradient wash.
      }}
    >
      {showLogo ? <Logo size={38} /> : null}

      <View style={{ flex: 1, gap: 2 }}>
        {subtitle ? (
          <Txt variant="footnote" tone="muted">
            {subtitle}
          </Txt>
        ) : null}
        {/* Long names get the next size down AND a second line rather than an
            ellipsis. A person's own name truncated to "Vimalsrinivasan Rangan…"
            in the largest type on the screen is the most conspicuous thing on
            it — two lines costs a little height and reads correctly. */}
        <Txt
          variant={title.length > 16 ? 'title2' : 'title1'}
          numberOfLines={2}
          style={{ letterSpacing: -0.4 }}
        >
          {title}
        </Txt>
      </View>

      {showSearch ? (
        <Pressable
          onPress={() => router.push('/search')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Search for a creator"
          style={{ padding: 6 }}
        >
          <Search size={22} color={t.color.contentSoft} />
        </Pressable>
      ) : null}

      {showBell ? (
        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={{ padding: 6 }}
        >
          <Bell size={22} color={unread ? t.color.brand : t.color.contentSoft} />
          {/* A number, not a 9px dot. The dot was easy to miss entirely next to
              the numbered tab-bar badges, and "how many" is the thing you want
              to know before deciding whether to tap. */}
          {unread && unread > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -1,
                right: -1,
                minWidth: 17,
                height: 17,
                paddingHorizontal: 4,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.color.brand,
                borderWidth: 1.5,
                borderColor: t.color.surface,
              }}
            >
              <Txt
                variant="caption"
                style={{ color: t.color.white, fontSize: 10, lineHeight: 12, fontWeight: '700' }}
              >
                {unread > 99 ? '99+' : unread}
              </Txt>
            </View>
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
