/**
 * Slides an incoming notification in at the top of the screen as a card, the
 * way the OS banner would for a push — but driven by the Realtime row, so it
 * works where push does not and without the poll lag. See lib/notification-toast.ts.
 *
 * One card at a time (the head of the queue). Tapping it marks that row read,
 * navigates where the notification points, and dismisses; the X or the 5s
 * timer just dismisses. Rendered once, from the root layout, over everything.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  BadgeCheck,
  Handshake,
  ListChecks,
  MessageCircle,
  Sparkles,
  X,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';
import { endpoints } from '@/lib/api';
import { toMobileHref } from '@/lib/notification-link';
import { useNotificationSummary } from '@/lib/notification-summary';
import { useNotificationToast, type ToastNotification } from '@/lib/notification-toast';

const VISIBLE_MS = 5000;
const TRUST_TYPES = new Set(['verification', 'nudge', 'upsell']);

function iconFor(type: string, color: string) {
  const props = { size: 18, color } as const;
  switch (type) {
    case 'verification':
      return <BadgeCheck {...props} />;
    case 'collab_request':
    case 'collab_accepted':
    case 'collab_declined':
      return <Handshake {...props} />;
    case 'project_stage':
    case 'project_cancel':
      return <ListChecks {...props} />;
    case 'message':
      return <MessageCircle {...props} />;
    case 'nudge':
    case 'upsell':
      return <Sparkles {...props} />;
    default:
      return <Bell {...props} />;
  }
}

function ToastCard({ item }: { item: ToastNotification }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dismiss = useNotificationToast((s) => s.dismiss);

  const anim = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(anim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => dismiss(item.id));
  }, [anim, dismiss, item.id]);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(close, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [anim, close]);

  const accent = TRUST_TYPES.has(item.type) ? t.color.verified : t.color.brand;
  const href = toMobileHref(item.link);

  const onPress = () => {
    // Opening the card is the read receipt — keep the badge honest without a
    // trip to the notifications screen.
    void endpoints
      .markNotificationsRead({ action: 'mark_read', notificationIds: [item.id] })
      .then(() => useNotificationSummary.getState().refresh())
      .catch(() => {});
    if (href) router.push(href);
    close();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 12,
        right: 12,
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-28, 0] }) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body ?? ''}`}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          backgroundColor: t.color.surfaceCard,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.color.hairline,
          paddingVertical: 13,
          paddingHorizontal: 14,
          ...t.shadows.raised,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent + '1A',
          }}
        >
          {iconFor(item.type, accent)}
        </View>

        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {item.title}
          </Txt>
          {item.body ? (
            <Txt variant="footnote" tone="muted" numberOfLines={2} style={{ marginTop: 2 }}>
              {item.body}
            </Txt>
          ) : null}
        </View>

        <Pressable hitSlop={10} onPress={close} style={{ marginTop: 1 }}>
          <X size={16} color={t.color.contentMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export function NotificationToastHost() {
  // Keyed render of the head item only: a new id remounts ToastCard, which is
  // what resets the slide-in animation and the auto-dismiss timer cleanly.
  const head = useNotificationToast((s) => s.queue[0]);
  if (!head) return null;
  return <ToastCard key={head.id} item={head} />;
}
