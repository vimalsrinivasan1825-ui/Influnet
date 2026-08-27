/**
 * Campaigns — browse open campaigns and manage applications.
 *
 * Pushed screen from Home; not a tab (5-tab ceiling is deliberate).
 */
import { useState, useEffect, useCallback } from 'react';
import { Pressable, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Calendar, Clock, Megaphone, Users } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { Screen, ScreenScroll, Card, Txt, EmptyState, ErrorState, SkeletonCard } from '@/components/ui';

interface Campaign {
  id: string;
  title: string;
  description: string;
  platforms: string[];
  budget_min: number | null;
  budget_max: number | null;
  delivery_by: string | null;
  follower_min: number | null;
  categories: string[];
  location: string | null;
  expires_at: string;
  business_user?: { id: string; name: string | null } | null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function CampaignsScreen() {
  const t = useTheme();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    const res = await endpoints.campaigns<{ campaigns: Campaign[] }>();
    if (res.ok && res.data) {
      setCampaigns(res.data.campaigns || []);
      setError(null);
    } else {
      setError(res.error || 'Failed to load campaigns');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  if (loading) {
    return (
      <Screen>
        <SkeletonCard />
        <SkeletonCard />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => { setLoading(true); fetchCampaigns(); }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenScroll
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); fetchCampaigns(); }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCampaigns(); }} />}
      >
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns"
            body="Check back soon for open opportunities."
          />
        ) : (
          campaigns.map((c) => {
            const daysLeft = daysUntil(c.expires_at);
            const isClosingSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;

            return (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/projects/${c.id}` as any)}
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Card raised style={{ marginBottom: t.spacing.md, gap: t.spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt variant="caption" style={{ color: t.color.brand, fontWeight: '700' }}>
                      {c.business_user?.name || 'Brand'}
                    </Txt>
                    {isClosingSoon && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: t.color.warnSoft, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Clock size={10} color={t.color.warn} />
                        <Txt variant="caption" style={{ color: t.color.warn, fontWeight: '600' }}>Closing soon</Txt>
                      </View>
                    )}
                  </View>

                  <Txt variant="bodyStrong" numberOfLines={1}>{c.title}</Txt>

                  {c.description ? (
                    <Txt variant="footnote" tone="soft" numberOfLines={2}>{c.description}</Txt>
                  ) : null}

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                    {c.budget_min != null && (
                      <Txt variant="caption" tone="muted">₹{formatCount(c.budget_min)}+</Txt>
                    )}
                    {c.delivery_by && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Calendar size={11} color={t.color.contentMuted} />
                        <Txt variant="caption" tone="muted">
                          {new Date(c.delivery_by).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </Txt>
                      </View>
                    )}
                    {c.follower_min && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Users size={11} color={t.color.contentMuted} />
                        <Txt variant="caption" tone="muted">{formatCount(c.follower_min)}+</Txt>
                      </View>
                    )}
                  </View>

                  {c.categories.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {c.categories.slice(0, 3).map((cat) => (
                        <View key={cat} style={{ backgroundColor: t.color.surfaceMuted, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Txt variant="caption" tone="muted">{cat}</Txt>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
              </Pressable>
            );
          })
        )}
      </ScreenScroll>
    </Screen>
  );
}
