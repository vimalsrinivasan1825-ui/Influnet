/**
 * Campaigns — browse open campaigns and manage applications.
 *
 * A bottom tab as of the nav rework: it took the Profile tab's slot (Profile
 * moved to the avatar top-right). Web has the campaign board too, so mobile is
 * no longer ahead of it here.
 *
 * ── THE SEARCH IS THIS SCREEN'S OWN ───────────────────────────────────
 *
 * Deliberately NOT the global search in the header, which looks up creators
 * (/api/discover). This one hits /api/campaigns?q= and searches campaigns and
 * nothing else. Two searches that look alike and return different kinds of
 * thing would be worse than one, so they are kept visually distinct: this is an
 * inline field on the board, that one is a pushed screen behind a magnifier.
 *
 * `q` is full-text over title, categories, platforms, location, description and
 * deliverables (migration 144), so "restaurants" finds a campaign tagged
 * "Food & Cooking" whose description mentions a restaurant. The old `category`
 * filter matched one exact tag a brand happened to pick and was useless to
 * anyone who did not already know the tag vocabulary — the suggestion rail
 * below now teaches that vocabulary instead of requiring it.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Pressable, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Calendar, Clock, MapPin, Plus, Search, Users, X } from 'lucide-react-native';
import { NICHES } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { formatCount } from '@/lib/format';
import {
  Badge,
  Button,
  Chip,
  ChipRail,
  Screen,
  ScreenScroll,
  Card,
  CoverArt,
  Field,
  Txt,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from '@/components/ui';
import { AppHeader } from '@/components/app-header';
import { PlatformMark } from '@/components/platform-mark';

/**
 * Nominal width for the cover generator. CoverArt places its blobs in real
 * pixels — an SVG has no intrinsic size to take a percentage of — and the
 * `width: '100%'` on the view stretches the result to the card. The art is
 * abstract, so a fixed nominal beats a layout pass per card.
 */
const COVER_WIDTH = 360;

/**
 * The keyword rail under the search box.
 *
 * These are the real category tags brands pick from when publishing
 * (@influnet/core NICHES, the same list campaigns/new.tsx renders), so a tap is
 * guaranteed to be a term the board actually contains. They go into `q` rather
 * than `category` on purpose: as a query they also match titles and
 * descriptions, so "Food & Cooking" finds the restaurant campaign nobody
 * remembered to tag.
 */
const SUGGESTIONS = NICHES;

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
  status: string;
  business_user?: { id: string; name: string | null } | null;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function budgetLabel(c: Campaign): string | null {
  if (c.budget_min == null && c.budget_max == null) return null;
  if (c.budget_min != null && c.budget_max != null && c.budget_max !== c.budget_min) {
    return `₹${formatCount(c.budget_min)}–${formatCount(c.budget_max)}`;
  }
  return `₹${formatCount((c.budget_min ?? c.budget_max) as number)}+`;
}

export default function CampaignsScreen() {
  const t = useTheme();
  const router = useRouter();
  const role = useSession((s) => s.profile?.role ?? null);
  const isBusiness = role === 'business_owner';
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // A brand's draft never appears on the live board — "mine" is the only way to
  // find it again once they've navigated away from where they created it.
  const [view, setView] = useState<'browse' | 'mine'>('browse');
  const [query, setQuery] = useState('');

  /** Bumped per request so a slow response can't overwrite a newer one. */
  const requestId = useRef(0);

  const fetchCampaigns = useCallback(async (v: 'browse' | 'mine', q: string) => {
    const id = ++requestId.current;
    const res = await endpoints.campaigns<{ campaigns: Campaign[] }>({
      mine: v === 'mine',
      q: q.trim() || undefined,
    });
    if (id !== requestId.current) return; // a newer keystroke already won
    if (res.ok && res.data) {
      setCampaigns(res.data.campaigns || []);
      setError(null);
    } else {
      setError(res.error || 'Failed to load campaigns');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Debounced: a keystroke should not be a request. 300ms is the same beat the
  // creator search uses, so the two feel like one product.
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void fetchCampaigns(view, query), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchCampaigns, view, query]);

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const reload = () => {
    setRefreshing(true);
    void fetchCampaigns(view, query);
  };

  const header = (
    <>
      <AppHeader title="Campaigns" showBell={false} />

      <View style={{ gap: t.spacing.md, paddingBottom: t.spacing.xs }}>
        <Field
          placeholder="Search campaigns — food, tech, fitness…"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          left={<Search size={17} color={t.color.contentMuted} />}
          right={
            searching ? (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={16} color={t.color.contentMuted} />
              </Pressable>
            ) : null
          }
        />

        {/* The vocabulary, offered rather than assumed. Tapping one runs it as
            a real query, so the box always shows what produced the results. */}
        <ChipRail>
          {SUGGESTIONS.map((s) => (
            <Chip
              key={s}
              label={s}
              selected={trimmed.toLowerCase() === s.toLowerCase()}
              onPress={() => setQuery(trimmed.toLowerCase() === s.toLowerCase() ? '' : s)}
            />
          ))}
        </ChipRail>

        {isBusiness ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: t.spacing.sm,
            }}
          >
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {(['browse', 'mine'] as const).map((v) => (
                <Pressable key={v} onPress={() => setView(v)}>
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: t.radii.sm,
                      backgroundColor: view === v ? t.color.brand : t.color.surfaceMuted,
                    }}
                  >
                    <Txt
                      variant="caption"
                      style={{
                        color: view === v ? t.color.white : t.color.contentMuted,
                        fontWeight: '600',
                      }}
                    >
                      {v === 'browse' ? 'Browse' : 'My campaigns'}
                    </Txt>
                  </View>
                </Pressable>
              ))}
            </View>
            <Button
              variant="secondary"
              size="md"
              label="New"
              icon={<Plus size={14} color={t.color.content} />}
              onPress={() => router.push('/campaigns/new' as any)}
              inline
            />
          </View>
        ) : null}

        {/* Says what the list is answering. Without it a filtered board and an
            empty board look identical, and a creator concludes there is no work
            rather than that their word found none. */}
        {searching && !loading && !error ? (
          <Txt variant="caption" tone="muted">
            {campaigns.length === 0
              ? `No campaigns for “${trimmed}”`
              : `${campaigns.length} ${campaigns.length === 1 ? 'campaign' : 'campaigns'} for “${trimmed}”`}
          </Txt>
        ) : null}
      </View>
    </>
  );

  return (
    <Screen padded={false}>
      <ScreenScroll
        header={header}
        refreshing={refreshing}
        onRefresh={reload}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : campaigns.length === 0 ? (
          <EmptyState
            title={
              searching
                ? `Nothing matches “${trimmed}”`
                : view === 'mine'
                  ? "You haven't created a campaign yet"
                  : 'No campaigns'
            }
            body={
              searching
                ? 'Try a broader word, or pick one of the topics above.'
                : view === 'mine'
                  ? 'Tap "New" to publish your first one.'
                  : 'Check back soon for open opportunities.'
            }
          />
        ) : (
          campaigns.map((c) => {
            const daysLeft = daysUntil(c.expires_at);
            const isClosingSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
            const budget = budgetLabel(c);

            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`${c.title} by ${c.business_user?.name || 'a brand'}`}
                onPress={() => router.push(`/campaigns/${c.id}` as any)}
                style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
              >
                <Card raised padded={false} style={{ marginBottom: t.spacing.md }}>
                  {/* Generated cover art, seeded on the campaign id — the same
                      art this campaign wears in the Home rail, because the seed
                      is the row id and nothing else. The campaigns table has no
                      image column; see ui/cover-art.tsx for why this is
                      generated rather than fetched or bundled. */}
                  <CoverArt seed={c.id} width={COVER_WIDTH} height={104} style={{ width: '100%' }}>
                    {/* Real platform marks, not a generic outline — every
                        channel a brand asked for, so a creator can tell at a
                        glance whether it is their platform. */}
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(c.platforms ?? []).slice(0, 3).map((p) => (
                        <PlatformMark key={p} platform={p} size={26} />
                      ))}
                    </View>
                  </CoverArt>

                  {/* The money, on the art. It is the first thing a creator
                      looks for and it used to be a grey caption three rows
                      down, indistinguishable from the delivery date. */}
                  {budget ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: 104 - 15,
                        right: t.spacing.lg,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: t.radii.pill,
                        backgroundColor: t.color.surfaceCard,
                        ...t.shadows.card,
                      }}
                    >
                      <Txt variant="caption" style={{ fontWeight: '800', color: t.color.content }}>
                        {budget}
                      </Txt>
                    </View>
                  ) : null}

                  <View style={{ padding: t.spacing.lg, gap: t.spacing.sm }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingRight: budget ? 88 : 0,
                      }}
                    >
                      <Txt
                        variant="caption"
                        numberOfLines={1}
                        style={{ color: t.color.brand, fontWeight: '700', flexShrink: 1 }}
                      >
                        {c.business_user?.name || 'Brand'}
                      </Txt>
                      {isClosingSoon ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3,
                            backgroundColor: t.color.warnSoft,
                            borderRadius: 4,
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                          }}
                        >
                          <Clock size={10} color={t.color.warn} />
                          <Txt variant="caption" style={{ color: t.color.warn, fontWeight: '600' }}>
                            {daysLeft}d left
                          </Txt>
                        </View>
                      ) : null}
                      {view === 'mine' && c.status !== 'live' ? (
                        <Badge label={c.status} tone="neutral" />
                      ) : null}
                    </View>

                    <Txt variant="title3" numberOfLines={2}>
                      {c.title}
                    </Txt>

                    {c.description ? (
                      <Txt variant="footnote" tone="soft" numberOfLines={2}>
                        {c.description}
                      </Txt>
                    ) : null}

                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: t.spacing.md,
                        paddingTop: 2,
                      }}
                    >
                      {c.delivery_by ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Calendar size={12} color={t.color.contentMuted} />
                          <Txt variant="caption" tone="muted">
                            {new Date(c.delivery_by).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </Txt>
                        </View>
                      ) : null}
                      {c.follower_min ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Users size={12} color={t.color.contentMuted} />
                          <Txt variant="caption" tone="muted">
                            {formatCount(c.follower_min)}+
                          </Txt>
                        </View>
                      ) : null}
                      {c.location ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MapPin size={12} color={t.color.contentMuted} />
                          <Txt variant="caption" tone="muted" numberOfLines={1}>
                            {c.location}
                          </Txt>
                        </View>
                      ) : null}
                    </View>

                    {c.categories.length > 0 ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                        {c.categories.slice(0, 3).map((cat) => (
                          <View
                            key={cat}
                            style={{
                              backgroundColor: t.color.brandSoft,
                              borderRadius: t.radii.sm,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                            }}
                          >
                            <Txt
                              variant="caption"
                              style={{ color: t.color.brand, fontWeight: '600' }}
                            >
                              {cat}
                            </Txt>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScreenScroll>
    </Screen>
  );
}
