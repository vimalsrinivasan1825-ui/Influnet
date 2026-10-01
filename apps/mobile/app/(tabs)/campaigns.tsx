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
import { Plus, Search, X } from 'lucide-react-native';
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
  CoverArt,
  Field,
  Txt,
  EmptyState,
  ErrorState,
  SkeletonCard,
  Scrim,
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
        {/* The header runs full-bleed (ScreenScroll cancels its gutter for it),
            and ChipRail pads itself — everything else here needs the gutter. */}
        <View style={{ paddingHorizontal: t.spacing.screen }}>
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
        </View>

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
              paddingHorizontal: t.spacing.screen,
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
          <Txt variant="caption" tone="muted" style={{ paddingHorizontal: t.spacing.screen }}>
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
          campaigns.map((c, i) =>
            // v2: the first result leads as one big card; the rest are a quiet
            // list. One thing to look at first beats a column of equal cards.
            i === 0 ? (
              <FeaturedCampaign
                key={c.id}
                c={c}
                mine={view === 'mine'}
                onPress={() => router.push(`/campaigns/${c.id}` as any)}
              />
            ) : (
              <CampaignRow
                key={c.id}
                c={c}
                mine={view === 'mine'}
                onPress={() => router.push(`/campaigns/${c.id}` as any)}
              />
            ),
          )
        )}
      </ScreenScroll>
    </Screen>
  );
}

/** The lead campaign: full-width cover, the brand and title over it, one action. */
function FeaturedCampaign({ c, mine, onPress }: { c: Campaign; mine: boolean; onPress: () => void }) {
  const t = useTheme();
  const daysLeft = daysUntil(c.expires_at);
  const budget = budgetLabel(c);
  const brand = c.business_user?.name || 'Brand';
  const pill = (label: string) => (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center' }}>
      <Txt style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{label}</Txt>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.title} by ${brand}${budget ? `, ${budget}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }], marginBottom: t.spacing.md })}
    >
      <View style={{ height: 340, borderRadius: 30, overflow: 'hidden', ...t.shadows.raised }}>
        <CoverArt seed={c.id} width={COVER_WIDTH} height={340} style={{ width: '100%', height: '100%' }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(c.platforms ?? []).slice(0, 3).map((pl) => (
              <PlatformMark key={pl} platform={pl} size={30} />
            ))}
          </View>
        </CoverArt>
        <Scrim from={0.3} />
        {daysLeft !== null && daysLeft > 0 ? (
          <View style={{ position: 'absolute', top: 14, left: 14, height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: '#fff', justifyContent: 'center' }}>
            <Txt style={{ fontSize: 12, fontWeight: '700', color: '#111114' }}>
              {daysLeft === 1 ? 'Closes tomorrow' : `Closes in ${daysLeft} days`}
            </Txt>
          </View>
        ) : null}
        {mine && c.status !== 'live' ? (
          <View style={{ position: 'absolute', top: 14, right: 14 }}>
            <Badge label={c.status} tone="neutral" />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 18, right: 18, bottom: 18, gap: 10 }}>
          <Txt style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{brand}</Txt>
          <Txt style={{ color: '#fff', fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.9 }} numberOfLines={3}>
            {c.title}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {budget ? pill(budget) : null}
            {c.categories.slice(0, 2).map((cat) => <View key={cat}>{pill(cat)}</View>)}
          </View>
          <View style={{ height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
            <Txt style={{ fontSize: 15, fontWeight: '700', color: '#111114' }}>View brief</Txt>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Everything after the lead: a compact row — cover chip, title, brand, budget. */
function CampaignRow({ c, mine, onPress }: { c: Campaign; mine: boolean; onPress: () => void }) {
  const t = useTheme();
  const daysLeft = daysUntil(c.expires_at);
  const budget = budgetLabel(c);
  const brand = c.business_user?.name || 'Brand';
  const closingSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.title} by ${brand}${budget ? `, ${budget}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: t.color.surfaceCard,
        borderRadius: 24,
        padding: 10,
        paddingRight: 16,
        marginBottom: t.spacing.sm,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 64, height: 64, borderRadius: 18, overflow: 'hidden' }}>
        <CoverArt seed={c.id} width={64} height={64} />
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1} style={{ fontWeight: '700' }}>{c.title}</Txt>
        <Txt variant="footnote" tone="muted" numberOfLines={1}>
          {brand}
          {closingSoon ? ` · ${daysLeft}d left` : ''}
          {mine && c.status !== 'live' ? ` · ${c.status}` : ''}
        </Txt>
      </View>
      {budget ? (
        <Txt style={{ fontSize: 14.5, fontWeight: '800', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {budget}
        </Txt>
      ) : null}
    </Pressable>
  );
}
