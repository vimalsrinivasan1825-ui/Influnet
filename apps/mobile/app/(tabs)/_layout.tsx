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
import { Tabs } from 'expo-router';
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

export default function TabsLayout() {
  const t = useTheme();
  const role = useSession((s) => s.profile?.role);
  const isCreator = role === 'influencer';

  // Badge counts, polled on a slow cadence by the shared store so the header
  // bell on Home reads the same numbers these tabs do.
  const summary = useNotificationSummary((s) => s.summary);
  const start = useNotificationSummary((s) => s.start);
  useEffect(() => start(), [start]);

  const badge = (n?: number) => (n && n > 0 ? (n > 99 ? '99+' : String(n)) : undefined);

  return (
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
        }}
      />
    </Tabs>
  );
}
