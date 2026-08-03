/**
 * One support conversation.
 *
 * Internal admin notes never arrive here — the RLS SELECT policy on
 * ticket_messages (migration 098) filters them out server-side, so this screen
 * cannot accidentally render one.
 */
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  ScreenScroll,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface Message {
  id: string;
  body: string;
  from_admin: boolean;
  created_at: string;
}

interface Ticket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
}

const STATUS_TONE: Record<string, 'warn' | 'info' | 'ok' | 'neutral'> = {
  open: 'warn',
  pending: 'info',
  resolved: 'ok',
  closed: 'neutral',
};

export default function SupportThreadScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useFetch(
    () => endpoints.getTicket<{ ticket: Ticket; messages: Message[] }>(String(id)),
    // The cache key carries the id, so navigating between two tickets reads
    // different cached data rather than showing the previous thread.
    { cacheKey: `support-ticket-${id}` },
  );

  async function send() {
    if (reply.trim().length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      await endpoints.replyToTicket(String(id), reply.trim());
      setReply('');
      await refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send your reply');
    } finally {
      setSending(false);
    }
  }

  if (loading && !data) {
    return (
      <ScreenScroll>
        <SkeletonCard />
        <SkeletonCard />
      </ScreenScroll>
    );
  }

  if (error && !data) {
    return (
      <ScreenScroll>
        <ErrorState message="Could not load this request." onRetry={refresh} />
      </ScreenScroll>
    );
  }

  const ticket = data?.ticket;
  const messages = data?.messages ?? [];

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {ticket ? (
        <View style={styles.header}>
          <Txt variant="title3">{ticket.subject}</Txt>
          <Badge label={ticket.status} tone={STATUS_TONE[ticket.status] ?? 'neutral'} />
        </View>
      ) : null}

      {messages.map((m) => (
        <Card
          key={m.id}
          style={
            m.from_admin
              ? { ...styles.bubble, backgroundColor: t.color.surfaceMuted }
              : {
                  ...styles.bubble,
                  backgroundColor: t.color.brandSoft,
                  alignSelf: 'flex-end',
                }
          }
        >
          {m.from_admin ? (
            <Txt variant="caption" tone="brand">
              INFLUNET SUPPORT
            </Txt>
          ) : null}
          <Txt variant="body">{m.body}</Txt>
          <Txt variant="caption" tone="muted">
            {new Date(m.created_at).toLocaleString()}
          </Txt>
        </Card>
      ))}

      {ticket?.status !== 'closed' ? (
        <Card style={styles.composer}>
          <Field
            label="Add to this request"
            value={reply}
            onChangeText={setReply}
            placeholder="Type your reply…"
            multiline
            numberOfLines={3}
          />
          {sendError ? (
            <Txt variant="footnote" tone="danger">
              {sendError}
            </Txt>
          ) : null}
          <Button
            label="Send"
            onPress={send}
            loading={sending}
            disabled={reply.trim().length === 0}
          />
        </Card>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },
  bubble: { gap: 4, maxWidth: '92%' },
  composer: { gap: 10 },
});
