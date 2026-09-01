/**
 * Who viewed your profile — the identified list, gated by plan.
 *
 * Data has existed since migration 018 (creator_profile_views). Free sees the
 * most-recent few identified plus a locked count; Pro sees everyone. It's a
 * READ gate on the server (GET /api/profile/viewers returns less), never a
 * 402 — the screen always renders.
 */
import { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, Lock, Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { useEntitlements } from '@/lib/use-entitlements';
import { timeAgo } from '@/lib/format';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ScreenScroll,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface Viewer {
  businessId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  viewCount: number;
  lastViewedAt: string;
}
interface Payload {
  viewers: Viewer[];
  total: number;
  shown: number;
  locked: number;
}

export default function ProfileViewersScreen() {
  const t = useTheme();
  const router = useRouter();
  const { isPro } = useEntitlements();

  const { data, loading, error, refreshing, refresh } = useFetch<Payload>(
    useCallback(() => endpoints.profileViewers<Payload>(), []),
    { cacheKey: 'profile-viewers' },
  );

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh} contentContainerStyle={{ gap: t.spacing.sm }}>
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !data || data.total === 0 ? (
        <EmptyState
          icon={<Eye size={22} color={t.color.brand} />}
          title="No profile views yet"
          body="When a brand opens your profile, they'll show up here."
        />
      ) : (
        <>
          {data.viewers.map((v) => (
            <Card
              key={v.businessId}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
            >
              <Avatar name={v.name} seed={v.businessId} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>{v.name ?? 'A brand'}</Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {v.username ? `@${v.username} · ` : ''}
                  {timeAgo(v.lastViewedAt)}
                  {v.viewCount > 1 ? ` · viewed ${v.viewCount}×` : ''}
                </Txt>
              </View>
            </Card>
          ))}

          {data.locked > 0 && (
            <Card style={{ gap: t.spacing.sm, borderColor: t.color.hairlineStrong }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Lock size={16} color={t.color.contentMuted} />
                <Txt variant="footnote" style={{ fontWeight: '700', flex: 1 }}>
                  {data.locked} more {data.locked === 1 ? 'brand' : 'brands'} viewed your profile
                </Txt>
              </View>
              <Txt variant="caption" tone="muted">
                Free shows your {data.shown} most recent viewers.
                {isPro ? '' : ' Upgrade to Pro to see everyone.'}
              </Txt>
              {!isPro && (
                <Button
                  label="Upgrade to Pro"
                  size="md"
                  icon={<Sparkles size={16} color={t.color.white} />}
                  onPress={() => router.push('/billing' as any)}
                />
              )}
            </Card>
          )}
        </>
      )}
    </ScreenScroll>
  );
}
