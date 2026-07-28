/**
 * Creator search.
 *
 * Deliberately a lookup, not a browse feed — mirrors the web topbar: nothing is
 * shown until the query looks like a username, and the match is username-only
 * (see apps/web/src/app/api/discover/route.ts).
 *
 * Selecting a result pushes to creator/[username], which renders the profile
 * natively from the same view model the web page is built from — inside our own
 * screen, never a hand-off to the system browser.
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search as SearchIcon } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { Avatar, EmptyState, Field, ListGroup, ListRow, ScreenScroll, VerifiedBadge } from '@/components/ui';

interface CreatorResult {
  user_id: string;
  username: string;
  headline: string | null;
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

  return (
    <ScreenScroll padded>
      <Field
        placeholder="Search by username…"
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        right={<SearchIcon size={18} color={t.color.contentMuted} />}
      />

      {query.trim().length < 2 ? (
        <EmptyState
          icon={<SearchIcon size={24} color={t.color.brand} />}
          title="Find a creator"
          body="Search by the exact username someone told you — this doesn't browse or suggest people."
        />
      ) : showEmpty ? (
        <EmptyState title="No one found" body={`No creator with a username matching "${query.trim()}".`} />
      ) : (
        <ListGroup>
          {results.map((r, i) => (
            <ListRow
              key={r.user_id}
              title={r.profile.name}
              subtitle={`@${r.username}${r.profile.location ? ` · ${r.profile.location}` : ''}`}
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
