import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  ScreenScroll,
  Sheet,
  SkeletonCard,
  StickyFooter,
  Txt,
  type SheetRef,
} from '@/components/ui';

/**
 * As /api/collabs/[id] sends it. The two profiles are embedded as `sender` and
 * `receiver` — the `from_user` / `to_user` names in @influnet/types are what a
 * client would like to receive, not what this route returns — and each embed
 * selects `name, role` only, so there's no avatar, handle or verified flag.
 */
interface CollabDetail {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  budget: number | null;
  status: string;
  created_at: string;
  sender?: { name: string | null; role: string | null } | null;
  receiver?: { name: string | null; role: string | null } | null;
}

export default function RequestDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.profile?.id);

  const acceptSheet = useRef<SheetRef>(null);
  const declineSheet = useRef<SheetRef>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.getCollab<{ collab: CollabDetail }>(id), { cacheKey: `request:${id}` }
  );

  const collab = data?.collab;
  const isIncoming = collab?.to_user_id === me;
  const other = isIncoming ? collab?.sender : collab?.receiver;
  const otherName = other?.name ?? null;
  const canAct = isIncoming && collab?.status === 'pending';
  // The one path back for a creator who declined and changed their mind —
  // Discover is business-only, so this is the only way to re-initiate.
  const canReopen = isIncoming && collab?.status === 'declined';

  async function setStatus(status: 'accepted' | 'declined' | 'pending') {
    setBusy(true);
    setActionError(null);

    const res = await endpoints.updateCollabStatus(id, status);
    setBusy(false);
    acceptSheet.current?.close();
    declineSheet.current?.close();

    if (!res.ok) {
      setActionError(res.error);
      return;
    }

    // Accepting opens a conversation — the deal gets negotiated there before
    // anyone commits to a project. Take the user straight to it.
    if (status === 'accepted') router.replace('/messages');
    else refresh();
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <SkeletonCard />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : collab ? (
          <>
            <Card style={{ gap: t.spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                <Avatar name={otherName ?? undefined} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="title3" numberOfLines={1}>
                    {otherName ?? 'Someone'}
                  </Txt>
                  <Txt variant="footnote" tone="muted">
                    {other?.role === 'business_owner' ? 'Business' : 'Creator'}
                  </Txt>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
                <Badge
                  label={isIncoming ? 'They contacted you' : 'You reached out'}
                  tone="neutral"
                />
                {collab.budget ? (
                  <Badge label={`Budget ${formatCurrency(collab.budget)}`} tone="brand" />
                ) : null}
              </View>
            </Card>

            <Card style={{ gap: t.spacing.sm }}>
              <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                The brief
              </Txt>
              <Txt variant="body" tone="soft">
                {collab.message}
              </Txt>
              <Txt variant="footnote" tone="muted" style={{ marginTop: t.spacing.xs }}>
                Sent {formatDate(collab.created_at)}
              </Txt>
            </Card>

            {actionError ? (
              <Card style={{ backgroundColor: t.color.dangerSoft, borderColor: t.color.danger }}>
                <Txt variant="footnote" tone="danger">
                  {actionError}
                </Txt>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScreenScroll>

      {canAct ? (
        <StickyFooter>
          <Button label="Accept and start talking" onPress={() => acceptSheet.current?.expand()} />
          <Button label="Decline" variant="ghost" onPress={() => declineSheet.current?.expand()} />
        </StickyFooter>
      ) : canReopen ? (
        <StickyFooter>
          <Button label="Changed your mind? Reopen" onPress={() => setStatus('pending')} loading={busy} />
        </StickyFooter>
      ) : null}

      <Sheet ref={acceptSheet} title="Accept this request?">
        <Txt variant="body" tone="soft">
          Accepting opens a conversation with {otherName ?? 'them'}. You'll agree the scope,
          deliverables and price there — nothing is committed until you both approve a project.
        </Txt>
        <Button label="Accept" onPress={() => setStatus('accepted')} loading={busy} />
      </Sheet>

      <Sheet ref={declineSheet} title="Decline this request?">
        <Txt variant="body" tone="soft">
          They'll see that you passed. You can reopen it yourself later if you change your mind.
        </Txt>
        <Button label="Decline" variant="danger" onPress={() => setStatus('declined')} loading={busy} />
      </Sheet>
    </View>
  );
}
