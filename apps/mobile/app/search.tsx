/**
 * Creator search.
 *
 * A real search as of 2026-09-02, not the username-only lookup it used to be:
 * the query matches name, username, Instagram handle, headline, bio and niche
 * tag (see /api/discover and the RPC in migration 145). So "food" finds food
 * creators, which is what a brand actually opens this screen to do.
 *
 * The niche rail is the vocabulary, offered rather than assumed — the same
 * @influnet/core NICHES creators pick from, so a tap is guaranteed to be a term
 * the roster contains. They go in as `q`, not as the `niche` filter: `niche`
 * with no query is the Pro "browse the roster" feature and would 403 a Free
 * user, while a typed query is free for everyone.
 *
 * Selecting a result pushes to creator/[username], which renders the profile
 * natively from the same view model the web page is built from — inside our own
 * screen, never a hand-off to the system browser.
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { NICHES } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import {
  Avatar,
  Chip,
  ChipRail,
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
  niche?: string[];
  verified_badge?: boolean;
  profile: { name: string; location: string | null };
}

export default function SearchScreen() {
  const t = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CreatorResult[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const res = await endpoints.discover<{ results: CreatorResult[] }>(`q=${encodeURIComponent(q)}`);
      if (id !== requestId.current) return; // a newer keystroke already won
      setResults(res.ok ? (res.data?.results ?? []) : []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const showEmpty = !loading && query.trim().length >= 2 && results.length === 0;

  const trimmed = query.trim();

  return (
    <ScreenScroll padded>
      <Field
        placeholder="Search creators â name, @handle, or a topic"
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        left={<SearchIcon size={17} color={t.color.contentMuted} />}
        right={
          trimmed ? (
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

      <ChipRail>
        {NICHES.map((n) => (
          <Chip
            key={n}
            label={n}
            selected={trimmed.toLowerCase() === n.toLowerCase()}
            onPress={() => setQuery(trimmed.toLowerCase() === n.toLowerCase() ? '' : n)}
          />
        ))}
      </ChipRail>

      {trimmed.length < 2 ? (
        <EmptyState
          icon={<SearchIcon size={24} color={t.color.brand} />}
          title="Find a creator"
          body="Search by name or @handle, or type a topic like “food” or “tech” to find creators in that niche."
        />
      ) : showEmpty ? (
        <EmptyState
          title="No one found"
          body={`No creator matches “${trimmed}”. Try a broader word, or pick a topic above.`}
        />
      ) : (
        <ListGroup>
          {results.map((r, i) => (
            <ListRow
              key={r.user_id}
              title={r.profile.name}
              /* Niche over location when we have it: on a topic search it is the
                 line that says WHY this creator came back. */
              subtitle={`@${r.username}${
                r.niche?.length
                  ? ` · ${r.niche.slice(0, 2).join(', ')}`
                  : r.profile.location
                    ? ` · ${r.profile.location}`
                    : ''
              }`}
              left={<Avatar name={r.profile.name} />}
              right={r.verified_badge ? <VerifiedBadge size={16} /> : undefined}
              index={i}
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
              onPress={() => router.push({ pathname: '/creator/[username]', params: { username: r.username } })}
            />
          ))}
        </ListGroup>
      )}

      <View style={{ height: t.spacing.xl }} />
    </ScreenScroll>
  );
}
