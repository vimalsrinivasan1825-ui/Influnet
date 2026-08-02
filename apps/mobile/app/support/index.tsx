/**
 * Help & support — the mobile half of the same ticket system the web uses.
 *
 * Same endpoints, same rows: a request opened on the phone is answerable from
 * the admin inbox and readable later on the web, which is the point of putting
 * support in the database rather than in an email inbox.
 */
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LifeBuoy, Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import { track } from '@/lib/analytics';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  ListGroup,
  ListRow,
  ScreenScroll,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: string;
  created_at: string;
  awaiting_admin: boolean;
}

const CATEGORIES = [
  { value: 'account', label: 'My account' },
  { value: 'payment', label: 'Payments' },
  { value: 'verification', label: 'Verification' },
  { value: 'project', label: 'A project' },
  { value: 'bug', label: 'Something broken' },
  { value: 'other', label: 'Something else' },
];

const STATUS_TONE: Record<string, 'warn' | 'info' | 'ok' | 'neutral'> = {
  open: 'warn',
  pending: 'info',
  resolved: 'ok',
  closed: 'neutral',
};

export default function SupportScreen() {
  const t = useTheme();
  const router = useRouter();

  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('other');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useFetch(
    () => endpoints.listTickets<{ tickets: Ticket[] }>(),
    { cacheKey: 'support-tickets' },
  );

  const tickets = data?.tickets ?? [];

  async function create() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await endpoints.createTicket({
        subject: subject.trim(),
        message: message.trim(),
        category,
        context: { platform: 'mobile' },
      });
      track('support_ticket_opened', { category });
      setComposing(false);
      setSubject('');
      setMessage('');
      setCategory('other');
      await refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not open your request');
    } finally {
      setSubmitting(false);
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
        <ErrorState message="Could not load your requests." onRetry={refresh} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {composing ? (
        <Card style={styles.form}>
          <Txt variant="bodyStrong">What do you need help with?</Txt>

          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.value}
                label={c.label}
                selected={category === c.value}
                onPress={() => setCategory(c.value)}
              />
            ))}
          </View>

          <Field
            label="Short summary"
            value={subject}
            onChangeText={setSubject}
            placeholder="e.g. My verification is stuck"
            maxLength={200}
          />
          <Field
            label="What happened?"
            value={message}
            onChangeText={setMessage}
            placeholder="The more detail, the faster we can help."
            multiline
            numberOfLines={5}
          />

          {submitError ? (
            <Txt variant="footnote" tone="danger">
              {submitError}
            </Txt>
          ) : null}

          <View style={styles.actions}>
            <Button label="Cancel" variant="ghost" onPress={() => setComposing(false)} />
            <Button
              label="Send request"
              onPress={create}
              loading={submitting}
              disabled={subject.trim().length < 3 || message.trim().length < 10}
            />
          </View>
        </Card>
      ) : (
        <Button
          label="New request"
          icon={<Plus size={16} color={t.color.white} />}
          onPress={() => setComposing(true)}
        />
      )}

      {tickets.length === 0 && !composing ? (
        <EmptyState
          icon={<LifeBuoy size={28} color={t.color.contentMuted} />}
          title="No requests yet"
          body="When something goes wrong or you're unsure, open a request and a real person picks it up."
        />
      ) : (
        <ListGroup>
          {tickets.map((ticket) => (
            <ListRow
              key={ticket.id}
              title={ticket.subject}
              subtitle={`Opened ${timeAgo(ticket.created_at)}`}
              right={
                <Badge label={ticket.status} tone={STATUS_TONE[ticket.status] ?? 'neutral'} />
              }
              onPress={() => router.push(`/support/${ticket.id}`)}
            />
          ))}
        </ListGroup>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
