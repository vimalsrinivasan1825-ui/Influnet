import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Compass, MapPin, SlidersHorizontal, X } from 'lucide-react-native';
import { NICHES } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { AppHeader } from '@/components/app-header';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ChipRail,
  ChipWrap,
  EmptyState,
  ErrorState,
  Field,
  Screen,
  Sheet,
  SkeletonCard,
  Txt,
  type SheetRef,
} from '@/components/ui';

interface CreatorResult {
  user_id: string;
  username: string;
  bio: string | null;
  headline: string | null;
  niche: string[];
  instagram_handle: string | null;
  availability_status: string | null;
  profile: { id: string; name: string; location: string | null };
}

export default function DiscoverScreen() {
  const t = useTheme();
  const router = useRouter();
  const sheetRef = useRef<SheetRef>(null);

  const [query, setQuery] = useState('');
  const [niche, setNiche] = useState<string | null>(null);
  const [location, setLocation] = useState('');

  const [results, setResults] = useState<CreatorResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (opts: { append?: boolean; cursor?: string | null } = {}) => {
      if (opts.append) setLoadingMore(true);
      else setLoading(true);

      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (niche) params.set('niche', niche);
      if (location.trim()) params.set('location', location.trim());
      if (opts.cursor) params.set('cursor', opts.cursor);

      const res = await endpoints.discover(params.toString());
      const payload = res.data as { results?: CreatorResult[]; nextCursor?: string | null } | null;

      if (res.ok) {
        const rows = payload?.results ?? [];
        setResults((prev) => (opts.append ? [...prev, ...rows] : rows));
        setCursor(payload?.nextCursor ?? null);
        setError(null);
      } else {
        setError(res.error);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [query, niche, location]
  );

  // Debounce typing; fire immediately when a filter changes.
  const debounced = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => void search(), 350);
    };
  }, [search]);

  const activeFilters = (niche ? 1 : 0) + (location.trim() ? 1 : 0);

  return (
    <Screen padded={false}>
      <AppHeader title="Discover" subtitle="Find creators" showBell={false} />

      <View style={{ paddingHorizontal: t.spacing.screen, gap: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}>
          <Field
            containerStyle={{ flex: 1 }}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              debounced();
            }}
            placeholder="Search name, handle or headline"
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => void search()}
          />
          <Pressable
            onPress={() => sheetRef.current?.expand()}
            accessibilityRole="button"
            accessibilityLabel="Filters"
            style={{
              width: 50,
              height: 50,
              borderRadius: t.radii.md,
              borderWidth: 1,
              borderColor: activeFilters ? t.color.brand : t.color.hairlineStrong,
              backgroundColor: activeFilters ? t.color.brandSoft : t.color.surfaceCard,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlidersHorizontal size={19} color={activeFilters ? t.color.brand : t.color.contentSoft} />
            {activeFilters ? (
              <View
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -5,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: t.color.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt variant="caption" style={{ color: t.color.white, fontSize: 11 }}>
                  {activeFilters}
                </Txt>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* Quick niche rail — the filters people actually reach for. */}
      <ChipRail>
        {NICHES.slice(0, 10).map((n) => (
          <Chip
            key={n}
            label={n}
            selected={niche === n}
            onPress={() => {
              setNiche((prev) => (prev === n ? null : n));
              setTimeout(() => void search(), 0);
            }}
          />
        ))}
      </ChipRail>

      {loading ? (
        <View style={{ paddingHorizontal: t.spacing.screen, gap: t.spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void search()} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{
            paddingHorizontal: t.spacing.screen,
            paddingBottom: t.spacing['4xl'],
            gap: t.spacing.md,
          }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (cursor && !loadingMore) void search({ append: true, cursor });
          }}
          ListEmptyComponent={
            <EmptyState
              icon={<Compass size={24} color={t.color.brand} />}
              title="No creators match that"
              body="Try a broader search, or clear a filter or two."
              actionLabel={activeFilters ? 'Clear filters' : undefined}
              onAction={() => {
                setNiche(null);
                setLocation('');
                setTimeout(() => void search(), 0);
              }}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/creator/${item.user_id}`)}
              accessibilityRole="button"
            >
              {({ pressed }) => (
                <Card raised style={{ opacity: pressed ? 0.92 : 1, gap: t.spacing.md }}>
                  <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' }}>
                    <Avatar name={item.profile.name} size={48} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="title3" numberOfLines={1}>
                        {item.profile.name}
                      </Txt>
                      <Txt variant="footnote" tone="muted" numberOfLines={1}>
                        @{item.username}
                        {item.profile.location ? ` · ${item.profile.location}` : ''}
                      </Txt>
                    </View>
                    {item.availability_status === 'open' ? (
                      <Badge label="Open" tone="ok" />
                    ) : item.availability_status === 'paused' ? (
                      <Badge label="Paused" tone="neutral" />
                    ) : null}
                  </View>

                  {item.headline || item.bio ? (
                    <Txt variant="callout" tone="soft" numberOfLines={2}>
                      {item.headline ?? item.bio}
                    </Txt>
                  ) : null}

                  {item.niche?.length ? (
                    <ChipWrap>
                      {item.niche.slice(0, 3).map((n) => (
                        <Chip key={n} label={n} />
                      ))}
                    </ChipWrap>
                  ) : null}
                </Card>
              )}
            </Pressable>
          )}
        />
      )}

      <Sheet ref={sheetRef} title="Filters">
        <View style={{ gap: t.spacing.sm }}>
          <Txt variant="footnote" tone="soft">
            Niche
          </Txt>
          <ChipWrap>
            {NICHES.map((n) => (
              <Chip
                key={n}
                label={n}
                selected={niche === n}
                onPress={() => setNiche((prev) => (prev === n ? null : n))}
              />
            ))}
          </ChipWrap>
        </View>

        <Field
          label="Location"
          value={location}
          onChangeText={setLocation}
          placeholder="City or state"
          right={
            location ? (
              <Pressable onPress={() => setLocation('')} hitSlop={8}>
                <X size={17} color={t.color.contentMuted} />
              </Pressable>
            ) : (
              <MapPin size={17} color={t.color.contentMuted} />
            )
          }
        />

        <Button
          label="Show results"
          onPress={() => {
            sheetRef.current?.close();
            void search();
          }}
        />
        <Button
          label="Clear all"
          variant="ghost"
          onPress={() => {
            setNiche(null);
            setLocation('');
          }}
        />
      </Sheet>
    </Screen>
  );
}
