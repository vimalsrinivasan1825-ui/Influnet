/**
 * Home's header. Bigger, quieter, and it says something.
 *
 * ── WHY HOME DOESN'T USE AppHeader ────────────────────────────────────
 *
 * `AppHeader` puts the signed-in person's NAME in the largest type on the
 * screen. That is right for Profile — you go there to look at yourself — and
 * wrong for Home, where the name is the one fact the user already has. It also
 * meant the biggest thing on the screen never changed, so the top of Home
 * carried no information at all.
 *
 * Here the name is demoted to the greeting line, where it does its actual job
 * (this is your account, we know who you are), and the large type is spent on
 * the ONE sentence that describes the state of the account right now. That
 * sentence changes; a name does not.
 *
 * ── THE SECOND LINE IS THE ACCENT ─────────────────────────────────────
 *
 * The headline breaks across two lines with the second in the role colour —
 * pink for a brand, purple for a creator (see accentForRole in
 * @influnet/tokens). It is the loudest use of the accent anywhere in the app
 * and it is load-bearing: this is the moment someone learns which colour
 * "their" side of the product is, and every button below inherits it.
 *
 * Splitting is by AUTHORED phrase, not by measuring text. A headline broken at
 * whatever word happens to fall past the container edge puts the accent on a
 * fragment ("today" alone in pink), and that reads as a rendering bug.
 */
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Search } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Avatar, Txt } from '@/components/ui';
import { Appear } from '@/components/ui/motion';
import { GuideLauncherButton } from '@/components/guides/guide-launcher';

export type HomeMood = 'first-run' | 'waiting' | 'active' | 'clear';

/**
 * The headline, chosen by what the account actually looks like.
 *
 * Ordered by urgency, and the order matters more than the wording: a person
 * with three decisions waiting must not be greeted with "let's build something
 * amazing", and a person on day one must not be told they are all caught up —
 * "caught up" on an empty account reads as sarcasm.
 */
function headline(mood: HomeMood, pending: number, isCreator: boolean): [string, string] {
  switch (mood) {
    case 'waiting':
      // Concrete and countable. "You have things to do" is anxiety; "3 things"
      // is a task list, and a number you can see the end of is one you start.
      return [
        pending === 1 ? 'One thing needs' : `${pending} things need`,
        'your attention',
      ];
    case 'first-run':
      // Forward-looking, and it names the goal rather than the emptiness.
      // "No projects yet" describes a hole; "your first collab" describes a
      // destination, and only one of those is worth walking toward.
      return isCreator
        ? ["Let's land your", 'first collab']
        : ["Let's find your", 'first creator'];
    case 'active':
      return ['Your work is', 'moving forward'];
    case 'clear':
    default:
      return ["Let's build something", 'amazing today'];
  }
}

export function HomeHeader({
  name,
  avatarUri,
  greeting,
  mood,
  pending,
  isCreator,
  unread,
}: {
  name: string | null;
  avatarUri?: string | null;
  greeting: string;
  mood: HomeMood;
  /** Total decisions waiting. Only read when `mood` is 'waiting'. */
  pending: number;
  isCreator: boolean;
  unread?: number;
}) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // First name only. A greeting is a greeting, not an address label — and the
  // full string is what used to force AppHeader down a type size and onto two
  // lines.
  const firstName = (name ?? '').trim().split(/\s+/)[0] || null;
  const [lead, accent] = headline(mood, pending, isCreator);

  return (
    <View
      style={{
        paddingTop: insets.top + t.spacing.sm,
        paddingBottom: t.spacing.lg,
        paddingHorizontal: t.spacing.screen,
        gap: t.spacing.md,
      }}
    >
      {/* ── Greeting + controls ──────────────────────────────────────
          One row, because these are all "who am I / where do I go" chrome and
          the headline below is the content. Separating them is what lets the
          headline start at the left margin at full width instead of being
          squeezed into whatever the icons leave over — which is the actual
          reason the old header could not run large type. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <Txt variant="callout" tone="soft" numberOfLines={1} style={{ flex: 1 }}>
          {greeting}
          {firstName ? (
            <Txt variant="callout" style={{ fontWeight: '700', color: t.color.content }}>
              {`, ${firstName} `}
            </Txt>
          ) : null}
          👋
        </Txt>

        <GuideLauncherButton />

        <Pressable
          onPress={() => router.push('/search')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Search for a creator"
          style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.5 : 1 })}
        >
          <Search size={22} color={t.color.contentSoft} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={
            unread ? `Notifications, ${unread} unread` : 'Notifications'
          }
          style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.5 : 1 })}
        >
          <Bell size={22} color={unread ? t.color.brand : t.color.contentSoft} />
          {/* A number, not a dot. "How many" is what decides whether you tap. */}
          {unread && unread > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                minWidth: 18,
                height: 18,
                paddingHorizontal: 4,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.color.brand,
                borderWidth: 2,
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

        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
        >
          <Avatar uri={avatarUri} name={name} size={40} />
        </Pressable>
      </View>

      {/* ── The headline ─────────────────────────────────────────────
          `allowFontScaling` stays on (accessibility), but the whole block is
          allowed to grow rather than being clamped to two lines — someone at
          200% text size gets four lines of readable headline instead of two
          lines of clipped one. */}
      <Appear distance={10}>
        <Txt variant="hero">
          {lead}
          {'\n'}
          <Txt variant="hero" style={{ color: t.color.brand }}>
            {accent}
          </Txt>
        </Txt>
      </Appear>
    </View>
  );
}
