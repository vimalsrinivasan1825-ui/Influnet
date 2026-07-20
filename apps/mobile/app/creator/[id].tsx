import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
// Lucide dropped brand marks, so channels are labelled rather than logo'd.
import { AtSign, Link2 } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ChipWrap,
  ErrorState,
  ScreenScroll,
  SkeletonCard,
  StickyFooter,
  Txt,
} from '@/components/ui';

interface CreatorResult {
  user_id: string;
  username: string;
  bio: string | null;
  headline: string | null;
  niche: string[];
  instagram_handle: string | null;
  youtube_handle: string | null;
  availability_status: string | null;
  profile: { id: string; name: string; location: string | null };
}

export default function CreatorDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Discover's `id` filter returns exactly this creator, through the same
  // SECURITY DEFINER search the list uses — so no extra route is needed.
  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.discover<{ results: CreatorResult[] }>(`id=${encodeURIComponent(id)}`)
  );

  const creator = data?.results?.[0];

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <SkeletonCard />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !creator ? (
          <ErrorState message="This creator is no longer listed." />
        ) : (
          <>
            <Card raised style={{ gap: t.spacing.md, alignItems: 'center' }}>
              <Avatar name={creator.profile.name} size={76} />
              <View style={{ alignItems: 'center', gap: 3 }}>
                <Txt variant="title1">{creator.profile.name}</Txt>
                <Txt variant="callout" tone="muted">
                  @{creator.username}
                  {creator.profile.location ? ` · ${creator.profile.location}` : ''}
                </Txt>
              </View>

              {creator.availability_status ? (
                <Badge
                  label={
                    creator.availability_status === 'open'
                      ? 'Open to collaborations'
                      : creator.availability_status === 'limited'
                        ? 'Limited availability'
                        : 'Not taking work'
                  }
                  tone={
                    creator.availability_status === 'open'
                      ? 'ok'
                      : creator.availability_status === 'limited'
                        ? 'warn'
                        : 'neutral'
                  }
                />
              ) : null}

              {creator.headline ? (
                <Txt variant="body" tone="soft" center>
                  {creator.headline}
                </Txt>
              ) : null}
            </Card>

            {creator.bio ? (
              <Card style={{ gap: t.spacing.sm }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  About
                </Txt>
                <Txt variant="body" tone="soft">
                  {creator.bio}
                </Txt>
              </Card>
            ) : null}

            {creator.niche?.length ? (
              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Works in
                </Txt>
                <ChipWrap>
                  {creator.niche.map((n) => (
                    <Chip key={n} label={n} />
                  ))}
                </ChipWrap>
              </Card>
            ) : null}

            {creator.instagram_handle || creator.youtube_handle ? (
              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Channels
                </Txt>
                <View style={{ gap: t.spacing.sm }}>
                  {creator.instagram_handle ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                      <AtSign size={17} color={t.color.contentSoft} />
                      <Txt variant="callout" tone="soft">
                        Instagram · @{creator.instagram_handle}
                      </Txt>
                    </View>
                  ) : null}
                  {creator.youtube_handle ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                      <Link2 size={17} color={t.color.contentSoft} />
                      <Txt variant="callout" tone="soft">
                        YouTube · {creator.youtube_handle}
                      </Txt>
                    </View>
                  ) : null}
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScreenScroll>

      {creator ? (
        <StickyFooter>
          <Button
            label="Send a request"
            onPress={() =>
              router.push({
                pathname: '/requests/new',
                params: { to: creator.user_id, name: creator.profile.name },
              })
            }
          />
        </StickyFooter>
      ) : null}
    </View>
  );
}
