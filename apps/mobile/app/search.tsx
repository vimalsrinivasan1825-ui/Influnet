/**
 * Find creator — an exact lookup, not a search.
 *
 * ── What this screen deliberately does not do ─────────────────────────────
 * It used to be a real search: the query matched name, headline, bio and niche
 * tags, and a niche rail offered topics to browse. All of that is gone as of
 * 2026-09-30. Influnet does not publish a browsable roster of creators, so
 * this resolves ONE username — or a pasted Influnet profile link — to ONE
 * creator, and says "no creator with that username" for everything else. No
 * suggestions, no partial matches, no topic chips.
 *
 * ── Why it resolves on submit, not on keystroke ───────────────────────────
 * The old screen fired a debounced request per keystroke. That is what makes a
 * box feel like a directory you can wander through, which is exactly the
 * behaviour being removed — so the lookup runs when the user asks for it.
 *
 * ── Why there is no username parser here ──────────────────────────────────
 * The whole input is handed to /api/discover and the SERVER resolves it
 * (lib/search-query.ts). A second copy of that rule in the app would be a copy
 * frozen into every installed build the moment the rule changed — and the rule
 * is about which hosts count as our profile links, which is exactly the sort
 * of thing that changes.
 *
 * Businesses only. A creator has no creator to look up, so it says so rather
 * than offering a box that can only disappoint.
 *
 * ── The result card ───────────────────────────────────────────────────────
 * Same pattern as the web page: a hit loads /api/creators/<username> once and
 * shows a summary card with two actions — View profile (the full profile
 * screen) and the request action the SERVER chose for this brand ("Send a
 * request", "Request sent", "View project"). Loading it records a profile view
 * for the creator, exactly as the web lookup does.
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, Search as SearchIcon, UserRoundSearch, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useIsCreator } from '@/lib/session';
import { endpoints } from '@/lib/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  ChipWrap,
  EmptyState,
  Field,
  ScreenScroll,
  Skeleton,
  Txt,
  VerifiedBadge,
} from '@/components/ui';

interface CreatorResult {
  user_id: string;
  username: string;
  headline: string | null;
  verified_badge?: boolean;
  profile: { name: string; location: string | null };
}

type CtaAction = 'edit' | 'work_with_me' | 'request_sent' | 'view_project' | 'view_only';

/** The slice of /api/creators/[username] the card reads. */
interface CreatorProfile {
  data: {
    name: string;
    avatarUrl: string | null;
    tagline: string;
    location: string | null;
    niches: string[];
    isVerified: boolean;
    availability: 'open' | 'limited' | 'paused' | null;
    heroStats: { label: string; value: string }[];
  };
  isOwner: boolean;
  ctaLabel: string;
  ctaAction: CtaAction;
  ctaProjectId: string | null;
  userId: string;
}

type ProfileState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; profile: CreatorProfile };

const AVAILABILITY = {
  open: { label: 'Open to work', tone: 'ok' },
  limited: { label: 'Limited availability', tone: 'warn' },
  paused: { label: 'Not taking work', tone: 'neutral' },
} as const;

type Outcome =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'found'; creator: CreatorResult }
  | { kind: 'missing' }
  | { kind: 'error' };

export default function FindCreatorScreen() {
  const t = useTheme();
  const router = useRouter();
  const isCreator = useIsCreator();
  const [term, setTerm] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  const trimmed = term.trim();

  async function lookup() {
    if (!trimmed) return;
    setOutcome({ kind: 'looking' });
    const res = await endpoints.discover<{ results: CreatorResult[] }>(
      `q=${encodeURIComponent(trimmed)}`,
    );
    if (!res.ok) {
      setOutcome({ kind: 'error' });
      return;
    }
    const creator = res.data?.results?.[0];
    setOutcome(creator ? { kind: 'found', creator } : { kind: 'missing' });
  }

  if (isCreator) {
    return (
      <ScreenScroll padded>
        <EmptyState
          icon={<UserRoundSearch size={24} color={t.color.brand} />}
          title="For business accounts"
          body="Looking a creator up is something brands do. Your collaborations start from campaigns you apply to and requests brands send you."
        />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll padded>
      <Field
        placeholder="username or influnet.io/username"
        value={term}
        onChangeText={(v) => {
          setTerm(v);
          if (outcome.kind !== 'idle') setOutcome({ kind: 'idle' });
        }}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={lookup}
        left={<SearchIcon size={17} color={t.color.contentMuted} />}
        right={
          trimmed ? (
            <Pressable
              onPress={() => {
                setTerm('');
                setOutcome({ kind: 'idle' });
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear"
            >
              <X size={16} color={t.color.contentMuted} />
            </Pressable>
          ) : null
        }
      />

      <Button
        label={outcome.kind === 'looking' ? 'Looking up…' : 'Look up'}
        onPress={lookup}
        disabled={!trimmed || outcome.kind === 'looking'}
        size="md"
        style={{ marginTop: t.spacing.sm }}
      />

      {outcome.kind === 'idle' ? (
        <EmptyState
          icon={<UserRoundSearch size={24} color={t.color.brand} />}
          title="Find a creator"
          body="Enter a creator's username, or paste their Influnet profile link. This finds the one creator with that username — it does not suggest others."
        />
      ) : null}

      {outcome.kind === 'missing' ? (
        <EmptyState
          title="No creator with that username"
          body={`Nothing matches “${trimmed}”. Check the spelling, or ask them for their profile link.`}
        />
      ) : null}

      {outcome.kind === 'error' ? (
        <EmptyState
          title="That did not go through"
          body="We could not complete the lookup. Try again in a moment."
        />
      ) : null}

      {outcome.kind === 'found' ? <CreatorCard creator={outcome.creator} /> : null}

      <View style={{ height: t.spacing.xl }} />
    </ScreenScroll>
  );
}

/**
 * The summary a brand decides on. Name, handle and location come from the
 * lookup so the card is useful immediately; photo, niches, stats and the
 * request action fill in from the profile payload as it arrives.
 */
function CreatorCard({ creator }: { creator: CreatorResult }) {
  const t = useTheme();
  const router = useRouter();
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      const res = await endpoints.getCreatorProfile<CreatorProfile>(creator.username);
      if (cancelled) return;
      setState(res.ok && res.data ? { status: 'ready', profile: res.data } : { status: 'error' });
    })();
    return () => {
      cancelled = true;
    };
  }, [creator.username]);

  const p = state.status === 'ready' ? state.profile : null;
  const d = p?.data;
  const name = d?.name ?? creator.profile.name;
  const location = d?.location ?? creator.profile.location;
  const tagline = d?.tagline || creator.headline;
  const verified = d?.isVerified ?? creator.verified_badge ?? false;
  const availability = d?.availability ? AVAILABILITY[d.availability] : null;
  const niches = (d?.niches ?? []).slice(0, 4);
  // A zero reads as a verdict on the creator, not as "not connected yet".
  const stats = (d?.heroStats ?? [])
    .filter((s) => s.value && !/^[0₹\s.,]+$/.test(s.value))
    .slice(0, 3);

  const openProfile = () =>
    router.push({ pathname: '/creator/[username]', params: { username: creator.username } });

  // The payload already decided the right next step for THIS brand — a pending
  // request or an existing project changes it — so follow its answer.
  const action = p?.ctaAction ?? 'work_with_me';
  const actionLabel = !p || action === 'work_with_me' ? 'Send a request' : p.ctaLabel;
  const showAction = !p || (!p.isOwner && action !== 'view_only' && action !== 'edit');
  const onAction = () => {
    if (action === 'work_with_me') {
      router.push({
        pathname: '/requests/new',
        params: { to: p?.userId ?? creator.user_id, name },
      });
    } else if (action === 'view_project' && p?.ctaProjectId) {
      router.push({ pathname: '/projects/[id]', params: { id: p.ctaProjectId } });
    }
  };

  return (
    <Card padded={false} style={{ marginTop: t.spacing.lg, overflow: 'hidden' }}>
      <View style={{ height: 64, backgroundColor: t.color.brandSoft }} />
      <View
        style={{
          alignItems: 'center',
          paddingHorizontal: t.spacing.lg,
          paddingBottom: t.spacing.xl,
          marginTop: -44,
        }}
      >
        <View
          style={{
            padding: 4,
            borderRadius: t.radii.pill,
            backgroundColor: t.color.surfaceCard,
          }}
        >
          <Avatar uri={d?.avatarUrl} name={name} seed={creator.user_id} size={80} />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
            marginTop: t.spacing.md,
          }}
        >
          <Txt variant="title3" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Txt>
          {verified ? <VerifiedBadge size={18} /> : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: t.spacing.sm,
            marginTop: 2,
          }}
        >
          <Txt variant="footnote" tone="muted">
            @{creator.username}
          </Txt>
          {location ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MapPin size={12} color={t.color.contentMuted} />
              <Txt variant="footnote" tone="muted">
                {location}
              </Txt>
            </View>
          ) : null}
        </View>

        {tagline ? (
          <Txt
            variant="callout"
            tone="soft"
            center
            numberOfLines={2}
            style={{ marginTop: t.spacing.md }}
          >
            {tagline}
          </Txt>
        ) : null}

        {availability || niches.length > 0 ? (
          <View style={{ marginTop: t.spacing.md, alignItems: 'center' }}>
            <ChipWrap>
              {availability ? <Badge label={availability.label} tone={availability.tone} /> : null}
              {niches.map((n) => (
                <Chip key={n} label={n} />
              ))}
            </ChipWrap>
          </View>
        ) : null}

        {state.status === 'loading' ? (
          <View style={{ flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.lg }}>
            <Skeleton width={90} height={52} />
            <Skeleton width={90} height={52} />
            <Skeleton width={90} height={52} />
          </View>
        ) : null}
        {stats.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              gap: t.spacing.sm,
              marginTop: t.spacing.lg,
              alignSelf: 'stretch',
            }}
          >
            {stats.map((s) => (
              <View
                key={s.label}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: t.spacing.sm,
                  borderRadius: t.radii.md,
                  backgroundColor: t.color.surfaceMuted,
                }}
              >
                <Txt variant="bodyStrong">{s.value}</Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {s.label}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ alignSelf: 'stretch', gap: t.spacing.sm, marginTop: t.spacing.xl }}>
          <Button label="View profile" size="md" onPress={openProfile} />
          {showAction ? (
            <Button
              label={actionLabel}
              variant="secondary"
              size="md"
              disabled={action === 'request_sent'}
              onPress={onAction}
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}
