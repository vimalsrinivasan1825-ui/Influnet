/**
 * In-app announcements the admin broadcast (migration 157).
 *
 * `banner` sits under the header until dismissed; `modal` takes the screen
 * once. `toast` is not handled here — those already arrive as notification
 * rows over Realtime and slide in through <NotificationToastHost />.
 *
 * Rendered once from the root layout. No-ops while signed out.
 */
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Megaphone, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Button, Card, Txt } from '@/components/ui';
import { endpoints } from '@/lib/api';
import { useSession } from '@/lib/session';
import { toMobileHref } from '@/lib/notification-link';

interface Announcement {
  broadcast_id: string;
  delivery_id: number;
  style: 'toast' | 'banner' | 'modal';
  title: string;
  body: string;
  image_url: string | null;
  deep_link: string | null;
  cta_label: string | null;
}

export function AnnouncementHost() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession((s) => s.session);
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!session) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await endpoints.announcements<{ announcements: Announcement[] }>();
      if (cancelled || !res.ok) return;
      const list = (res.data?.announcements ?? []).filter((a) => a.style !== 'toast');
      setItems(list);
      for (const a of list) {
        void endpoints.markAnnouncement(a.broadcast_id, 'seen');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const close = useCallback(
    (a: Announcement, action: 'dismissed' | 'clicked') => {
      setItems((prev) => prev.filter((x) => x.broadcast_id !== a.broadcast_id));
      void endpoints.markAnnouncement(a.broadcast_id, action);
      if (action === 'clicked' && a.deep_link) {
        const href = toMobileHref(a.deep_link);
        if (href) router.push(href);
      }
    },
    [router],
  );

  if (items.length === 0) return null;

  const modal = items.find((a) => a.style === 'modal');
  const banner = items.find((a) => a.style === 'banner');

  return (
    <>
      {banner ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 12,
            right: 12,
            zIndex: 40,
          }}
        >
          <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.color.brandSoft,
              }}
            >
              <Megaphone size={18} color={t.color.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong">{banner.title}</Txt>
              <Txt variant="footnote" tone="soft" style={{ marginTop: 2 }}>
                {banner.body}
              </Txt>
              {banner.deep_link ? (
                <Button
                  label={banner.cta_label || 'Take a look'}
                  inline
                  style={{ marginTop: 10 }}
                  onPress={() => close(banner, 'clicked')}
                />
              ) : null}
            </View>
            <Pressable onPress={() => close(banner, 'dismissed')} hitSlop={10} accessibilityLabel="Dismiss">
              <X size={16} color={t.color.contentMuted} />
            </Pressable>
          </Card>
        </View>
      ) : null}

      <Modal visible={!!modal} transparent animationType="fade" onRequestClose={() => modal && close(modal, 'dismissed')}>
        {modal ? (
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {modal.image_url ? (
                <Image source={{ uri: modal.image_url }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
              ) : null}
              <View style={{ padding: 20 }}>
                <Txt variant="title2">{modal.title}</Txt>
                <Txt variant="body" tone="soft" style={{ marginTop: 8 }}>
                  {modal.body}
                </Txt>
                <View style={{ marginTop: 18, gap: 8 }}>
                  {modal.deep_link ? (
                    <Button label={modal.cta_label || 'Take a look'} onPress={() => close(modal, 'clicked')} />
                  ) : null}
                  <Button label="Not now" variant="ghost" onPress={() => close(modal, 'dismissed')} />
                </View>
              </View>
            </Card>
          </View>
        ) : null}
      </Modal>
    </>
  );
}
