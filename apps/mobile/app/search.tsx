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
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search as SearchIcon, UserRoundSearch, X } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useIsCreator } from '@/lib/session';
import { endpoints } from '@/lib/api';
import {
  Avatar,
  Button,
  EmptyState,
  Field,
  ListGroup,
  ListRow,
  ScreenScroll,
  VerifiedBadge,
} from '@/components/ui';

interface CreatorResult {
  user_id: string;
  username: string;
  headline: string | null;
  verified_badge?: boolean;
  profile: { name: string; location: string | null };
}

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

      {outcome.kind === 'found' ? (
        <ListGroup>
          <ListRow
            title={outcome.creator.profile.name}
            subtitle={`@${outcome.creator.username}${
              outcome.creator.profile.location ? ` · ${outcome.creator.profile.location}` : ''
            }`}
            left={<Avatar name={outcome.creator.profile.name} />}
            right={outcome.creator.verified_badge ? <VerifiedBadge size={16} /> : undefined}
            index={0}
            onPress={() =>
              router.push({
                pathname: '/creator/[username]',
                params: { username: outcome.creator.username },
              })
            }
          />
        </ListGroup>
      ) : null}

      <View style={{ height: t.spacing.xl }} />
    </ScreenScroll>
  );
}
