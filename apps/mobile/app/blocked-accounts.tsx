/**
 * Blocked accounts.
 *
 * Settings had a "Blocked accounts" row that fetched a count on tap and never
 * navigated anywhere — this is the screen it should have opened. Unblocking
 * uses the same DELETE /api/blocks the web app would, so a block made on one
 * platform is visible and reversible from the other.
 */
import { useState } from 'react';
import { ShieldOff } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ScreenScroll,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface BlockRow {
  blocked_id: string;
  created_at: string;
  blocked?: { id: string; name: string | null; role: string | null } | null;
}

export default function BlockedAccountsScreen() {
  const t = useTheme();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.listBlocks<{ blocks: BlockRow[] }>(), { cacheKey: 'blocked-accounts' }
  );

  const rows = data?.blocks ?? [];

  async function unblock(blockedId: string) {
    setRemovingId(blockedId);
    setRemoveError(null);

    const res = await endpoints.removeBlock(blockedId);
    setRemovingId(null);

    if (!res.ok) {
      setRemoveError(res.error);
      return;
    }
    refresh();
  }

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh} centerShort={rows.length <= 3}>
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldOff size={24} color={t.color.brand} />}
          title="No blocked accounts"
          body="Accounts you block can't message you or send collaboration requests."
        />
      ) : (
        <>
          {removeError ? (
            <Txt variant="footnote" tone="danger">
              {removeError}
            </Txt>
          ) : null}
          <ListGroup>
            {rows.map((row, i) => (
              <ListRow
                key={row.blocked_id}
                title={row.blocked?.name ?? 'Unknown account'}
                subtitle={`Blocked ${timeAgo(row.created_at)}`}
                left={<Avatar name={row.blocked?.name ?? undefined} />}
                index={i}
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                right={
                  <Button
                    label="Unblock"
                    variant="secondary"
                    size="md"
                    inline
                    haptic={false}
                    disabled={removingId === row.blocked_id}
                    loading={removingId === row.blocked_id}
                    onPress={() => unblock(row.blocked_id)}
                  />
                }
              />
            ))}
          </ListGroup>
        </>
      )}
    </ScreenScroll>
  );
}
