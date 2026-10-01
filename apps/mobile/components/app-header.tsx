import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, Search } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useIsCreator } from '@/lib/session';
import { Txt } from '@/components/ui';
import { Logo } from '@/components/brand/logo';
import { GuideLauncherButton } from '@/components/guides/guide-launcher';
import { ProfileAvatarButton } from '@/components/profile-avatar-button';

/** Large-title header with the notification bell. Used on tab roots. */
export function AppHeader({
  title,
  subtitle,
  showBell = true,
  showSearch = true,
  // v2: the big title carries the screen; a mark beside it was a second
  // headline. Kept as an option for screens that have no other identity.
  showLogo = false,
  showAvatar = true,
  showBack = false,
  unread,
}: {
  title: string;
  subtitle?: string | null;
  showBell?: boolean;
  /**
   * The creator-lookup affordance. Businesses only — a creator has no reason
   * to look creators up, and the platform publishes no roster to browse, so
   * for them this button led to a screen with nothing to do. Passing `true`
   * does NOT force it on for a creator; see the render below.
   */
  showSearch?: boolean;
  /** The mark on the left. On by default — it's how the app signs its screens. */
  showLogo?: boolean;
  /**
   * The profile avatar on the right. On by default — since the Profile tab was
   * removed, this is how every tab root reaches Profile (tap) and the account
   * switcher (long-press). Off on Profile itself.
   */
  showAvatar?: boolean;
  /**
   * A back chevron on the far left, for screens pushed over the tabs that own
   * their header instead of the native Stack bar (Profile).
   */
  showBack?: boolean;
  unread?: number;
}) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isCreator = useIsCreator();

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
        paddingTop: insets.top + 12,
        paddingBottom: t.spacing.md,
        paddingHorizontal: t.spacing.screen,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        // Deliberately transparent. An opaque fill here cut a grey band
        // straight through the screen's gradient wash.
      }}
    >
      {showBack ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.color.surfaceCard, alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={21} color={t.color.content} />
        </Pressable>
      ) : null}

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
          variant={title.length > 16 ? 'title1' : 'hero'}
          numberOfLines={2}
        >
          {title}
        </Txt>
      </View>

      {showSearch && !isCreator ? (
        <Pressable
          onPress={() => router.push('/search')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Search for a creator"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.color.surfaceCard, alignItems: 'center', justifyContent: 'center' }}
        >
          <Search size={20} color={t.color.content} />
        </Pressable>
      ) : null}

      <GuideLauncherButton />

      {showBell ? (
        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.color.surfaceCard, alignItems: 'center', justifyContent: 'center' }}
        >
          <Bell size={20} color={t.color.content} />
          {/* A number, not a 9px dot. The dot was easy to miss entirely next to
              the numbered tab-bar badges, and "how many" is the thing you want
              to know before deciding whether to tap. */}
          {unread && unread > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 4,
                right: 2,
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

      {showAvatar ? <ProfileAvatarButton size={44} /> : null}
    </View>
  );
}
