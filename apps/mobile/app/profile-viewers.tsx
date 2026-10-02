/**
 * Who viewed your profile — LinkedIn-style, gated by plan.
 *
 * GET /api/profile/viewers returns every signed-in visitor, brands AND
 * creators. The first few (billing_settings.free_profile_viewers on Free) come
 * back named; the rest come back in `hidden`, described but never identified —
 * "A brand in Food & Beverage from Bengaluru". It's a READ gate on the server,
 * never a 402: the screen always renders.
 *
 * `hidden` and `thisWeek` are newer than this app's first release; an older
 * server simply omits them and the screen falls back to the locked count.
 */
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
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
import { HIDE_PRO_PURCHASE } from '@/lib/use-upgrade';

type Role = 'business_owner' | 'influencer' | null;

interface Viewer {
  businessId: string;
  viewerId?: string;
  role?: Role;
  descriptor?: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  viewCount: number;
  lastViewedAt: string;
}
interface HiddenViewer {
  key: string;
  role: Role;
  descriptor: string;
  viewCount: number;
  lastViewedAt: string;
}
interface Payload {
  viewers: Viewer[];
  hidden?: HiddenViewer[];
  total: number;
  shown: number;
  locked: number;
  thisWeek?: number;
}

function roleLabel(role: Role | undefined): string | null {
  if (role === 'business_owner') return 'Brand';
  if (role === 'influencer') return 'Creator';
  return null;
}

function profileHref(v: Viewer): Href | null {
  if (!v.username) return null;
  if (v.role === 'influencer') return { pathname: '/creator/[username]', params: { username: v.username } };
  // Older servers only ever returned brands, with no role.
  return { pathname: '/business/[username]', params: { username: v.username } };
}

function seenLine(lastViewedAt: string, viewCount: number): string {
  return `${timeAgo(lastViewedAt)}${viewCount > 1 ? ` · ${viewCount} visits` : ''}`;
}

export default function ProfileViewersScreen() {
  const t = useTheme();
  const router = useRouter();
  const { isPro } = useEntitlements();

  const { data, loading, error, refreshing, refresh } = useFetch<Payload>(
    useCallback(() => endpoints.profileViewers<Payload>(), []),
    { cacheKey: 'profile-viewers' },
  );

  const hidden = data?.hidden ?? [];
  // An older server sends only a count for the rest; show it as one line.
  const unlistedLocked = data ? Math.max(0, data.locked - hidden.length) : 0;
  const canUpsell = !isPro && !HIDE_PRO_PURCHASE;

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh} contentContainerStyle={{ gap: t.spacing.md }}>
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
          body="When a brand or creator opens your profile, they'll show up here. Share your link to get seen."
        />
      ) : (
        <>
          {/* Summary — the number first, like LinkedIn's "who's viewed your profile". */}
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: t.color.brandSoft ?? t.color.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Eye size={22} color={t.color.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt style={{ fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6 }}>
                {data.total}
              </Txt>
              <Txt variant="caption" tone="muted">
                {data.total === 1 ? 'person viewed your profile' : 'people viewed your profile'}
                {typeof data.thisWeek === 'number' && data.thisWeek > 0 ? ` · ${data.thisWeek} this week` : ''}
              </Txt>
            </View>
          </Card>

          <View style={{ gap: t.spacing.sm }}>
            {data.viewers.map((v) => {
              const href = profileHref(v);
              const label = roleLabel(v.role);
              return (
                <Pressable
                  key={v.viewerId ?? v.businessId}
                  disabled={!href}
                  onPress={href ? () => router.push(href) : undefined}
                  accessibilityRole={href ? 'button' : undefined}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                    <Avatar uri={v.avatarUrl} name={v.name} seed={v.viewerId ?? v.businessId} size={46} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {v.name ?? v.descriptor ?? 'A brand'}
                        </Txt>
                        {label ? (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: t.color.surface }}>
                            <Txt style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: t.color.contentSoft }}>{label}</Txt>
                          </View>
                        ) : null}
                      </View>
                      {v.descriptor && v.name ? (
                        <Txt variant="caption" tone="muted" numberOfLines={1}>{v.descriptor}</Txt>
                      ) : null}
                      <Txt variant="caption" tone="muted" numberOfLines={1}>
                        {v.username ? `@${v.username} · ` : ''}
                        {seenLine(v.lastViewedAt, v.viewCount)}
                      </Txt>
                    </View>
                  </Card>
                </Pressable>
              );
            })}

            {hidden.map((h) => (
              <Card key={h.key} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    backgroundColor: t.color.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Lock size={18} color={t.color.contentMuted} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt variant="bodyStrong" numberOfLines={2}>{h.descriptor}</Txt>
                  <Txt variant="caption" tone="muted" numberOfLines={1}>{seenLine(h.lastViewedAt, h.viewCount)}</Txt>
                </View>
              </Card>
            ))}
          </View>

          {data.locked > 0 && (
            <Card style={{ gap: t.spacing.sm, borderColor: t.color.hairlineStrong }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Lock size={16} color={t.color.contentMuted} />
                <Txt variant="footnote" style={{ fontWeight: '700', flex: 1 }}>
                  {unlistedLocked > 0
                    ? `${unlistedLocked} more ${unlistedLocked === 1 ? 'person' : 'people'} viewed your profile`
                    : `${data.locked} ${data.locked === 1 ? 'viewer is' : 'viewers are'} hidden on Free`}
                </Txt>
              </View>
              <Txt variant="caption" tone="muted">
                Free names your {data.shown} most recent viewers.
                {canUpsell ? ' Upgrade to Pro to see who everyone is.' : ''}
              </Txt>
              {canUpsell && (
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
