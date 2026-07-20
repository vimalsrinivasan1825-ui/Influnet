/**
 * Bottom tabs, resolved by role.
 *
 * The web sidebar shows eight destinations. Five is the mobile ceiling, so the
 * daily drivers get tabs and the maintenance surfaces (connections, activity,
 * settings, verification) live under Profile as pushed screens.
 *
 * Creators get Requests — inbound demand is their job. Businesses get Discover
 * — outbound search is theirs. Everything else is shared.
 */
import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import {
  Compass,
  FolderKanban,
  Home,
  MessageSquare,
  Send,
  UserRound,
} from 'lucide-react-native';
import type { NotificationSummary } from '@influnet/types';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';

export default function TabsLayout() {
  const t = useTheme();
  const role = useSession((s) => s.profile?.role);
  const isCreator = role === 'influencer';

  const [summary, setSummary] = useState<NotificationSummary | null>(null);

  // Badge counts, polled on a slow cadence. Push (Phase 4 of the plan) will
  // eventually make this event-driven; until then a 60s refresh is enough to
  // keep the dots honest without draining the battery.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await endpoints.notificationSummary();
      if (alive && res.ok) setSummary(res.data as NotificationSummary);
    };
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const badge = (n?: number) => (n && n > 0 ? (n > 99 ? '99+' : String(n)) : undefined);

  return (
    <Tabs
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
        name="discover"
        options={{
          title: 'Discover',
          // Creators don't search for creators.
          href: isCreator ? null : '/discover',
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} />,
        }}
      />

      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          href: isCreator ? '/requests' : null,
          tabBarBadge: badge(summary?.pending_requests_count),
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
