/**
 * Bottom tabs, resolved by role.
 *
 * The web sidebar shows eight destinations. Five is the mobile ceiling, so the
 * daily drivers get tabs and the maintenance surfaces (connections, activity,
 * settings, verification) live under Profile as pushed screens.
 *
 * Both roles get the same five, because a collaboration request is one object
 * seen from two ends — creators read the inbox, brands read the outbox. There
 * is no Discover tab: the web has that feature switched off too (see
 * business-home.tsx), and shipping a search surface here that the product
 * doesn't stand behind would put mobile ahead of web on the one flow they
 * must agree on.
 */
import { useEffect } from 'react';
import { Pressable, type GestureResponderEvent } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  FolderKanban,
  Home,
  MessageSquare,
  Send,
  UserRound,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { useNotificationSummary } from '@/lib/notification-summary';
import { useAccountSheet } from '@/lib/use-account-sheet';
import { AccountSwitcher } from '@/components/account-switcher';
import { startRealtime, stopRealtime } from '@/lib/realtime';

export default function TabsLayout() {
  const t = useTheme();
  const role = useSession((s) => s.profile?.role);
  const ready = useSession((s) => s.ready);
  const session = useSession((s) => s.session);
  const switching = useSession((s) => s.switching);
  const isCreator = role === 'influencer';
  const signedOut = ready && !session && !switching;
  // Mid account-switch: bounce to the entry gate so this whole tree unmounts
  // and then remounts CLEAN on the new session — otherwise the tabs keep their
  // mounted state and their cached data belongs to the previous account.
  const midSwitch = switching;

  // Badge counts, polled on a slow cadence by the shared store so the header
  // bell on Home reads the same numbers these tabs do. Not started (and torn
  // down immediately) once there is no session — a poll without a token is a
  // request nobody can answer.
  const summary = useNotificationSummary((s) => s.summary);
  const start = useNotificationSummary((s) => s.start);
  useEffect(() => {
    if (signedOut) return;
    return start();
  }, [start, signedOut]);

  /**
   * Supabase Realtime, sharing the poll's lifecycle. The poll above is now the
   * fallback rather than the only path: a badge that used to take up to 60s to
   * move updates as soon as the row is written, and the requests/projects
   * screens refetch themselves instead of waiting for a navigation.
   *
   * Not torn down here on sign-out — signOut() in lib/session.ts already calls
   * stopRealtime() while the token is still valid, which is the only ordering
   * that avoids a channel reconnecting against a dead session. The cleanup
   * below is for the ordinary unmount (this whole tree also unmounts on
   * sign-out, so a second stopRealtime() is a harmless no-op).
   */
  const userId = useSession((s) => s.session?.user.id);
  useEffect(() => {
    if (signedOut || !userId) return;
    startRealtime(userId);
    return () => stopRealtime();
  }, [userId, signedOut]);

  /**
   * The tab tree must not survive its session. Sign-out from a screen that is
   * itself a tab would otherwise leave all five mounted behind the new route,
   * each one revalidating on focus with no token. Unmounting the whole group
   * the moment the session goes is what makes "no stray requests after
   * sign-out" structural rather than a matter of getting every screen right.
   */
  if (signedOut || midSwitch) return <Redirect href="/" />;

  const badge = (n?: number) => (n && n > 0 ? (n > 99 ? '99+' : String(n)) : undefined);

  return (
    <>
    <Tabs
      // A tick under the thumb on every tab change. Selection feedback is the
      // lightest haptic there is — right for something you do constantly.
      screenListeners={{
        tabPress: () => {
          void Haptics.selectionAsync();
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.color.brand,
        tabBarInactiveTintColor: t.color.contentMuted,
        tabBarStyle: {
          backgroundColor: t.color.surfaceCard,
          borderTopColor: t.color.hairline,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarBadgeStyle: {
          backgroundColor: t.color.brand,
          color: t.color.white,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="requests"
        options={{
          title: isCreator ? 'Requests' : 'Sent',
          // Both roles get this tab now that Discover has gone: creators read
          // the inbox, brands read their outbox. The badge stays creator-only —
          // it counts requests awaiting *your* reply, and a brand's own
          // outgoing requests are never waiting on them.
          tabBarBadge: isCreator ? badge(summary?.pending_requests_count) : undefined,
          tabBarIcon: ({ color, size }) => <Send color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: badge(summary?.unread_messages_count),
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, size }) => <FolderKanban color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />,
          // Long-press the Profile tab → open the account switcher, wherever
          // you are. A normal tap still navigates to the tab.
          tabBarButton: (props) => (
            <Pressable
              {...(props as any)}
              onLongPress={(e: GestureResponderEvent) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                useAccountSheet.getState().open();
              }}
              delayLongPress={300}
            />
          ),
        }}
      />
    </Tabs>

    {/* Mounted once, driven by useAccountSheet — opened from here (long-press
        Profile) and from the "Switch account" row in Profile. */}
    <AccountSwitcher />
    </>
  );
}
