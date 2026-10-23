import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  Activity,
  CheckCircle2,
  CreditCard,
  FileText,
  Flag,
  MessageSquare,
  PenLine,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import { EmptyState, ErrorState, ScreenScroll, SkeletonCard, Txt } from '@/components/ui';

interface ProjectActivityEvent {
  id: string;
  summary: string;
  created_at: string;
  actor: { id: string; name: string | null } | null;
}

/** A glyph that says what kind of event this was, from the words in its summary. */
function iconFor(summary: string): LucideIcon {
  const s = summary.toLowerCase();
  if (/pay|paid|advance|refund/.test(s)) return CreditCard;
  if (/sign|confirm|approv|complet|accept|finish/.test(s)) return CheckCircle2;
  if (/update|posted|comment|message/.test(s)) return MessageSquare;
  if (/cancel|declin|skip|report/.test(s)) return Flag;
  if (/change|edit|revis|term/.test(s)) return PenLine;
  if (/file|document|upload|link/.test(s)) return FileText;
  return Activity;
}

const dayKey = (iso: string) => iso.slice(0, 10);

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The project's full audit trail, newest first, grouped by day on a rail so
 * "what happened and when" reads at a glance.
 */
export default function ProjectActivityScreen() {
  const t = useTheme();
  const me = useSession((s) => s.profile?.id);
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.projectActivity<{ activity: ProjectActivityEvent[] }>(id),
    { cacheKey: `project-activity:${id}` }
  );

  const activity = [...(data?.activity ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : activity.length ? (
        <View>
          {activity.map((event, i) => {
            const Icon = iconFor(event.summary);
            const newDay = i === 0 || dayKey(activity[i - 1].created_at) !== dayKey(event.created_at);
            const last = i === activity.length - 1;
            const who = event.actor?.id === me ? 'You' : event.actor?.name;
            return (
              <View key={event.id}>
                {newDay ? (
                  <Txt
                    variant="caption"
                    tone="muted"
                    style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700', marginTop: i === 0 ? 0 : t.spacing.lg, marginBottom: t.spacing.sm }}
                  >
                    {dayLabel(event.created_at)}
                  </Txt>
                ) : null}
                <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                  <View style={{ width: 32, alignItems: 'center' }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: t.color.brandSoft,
                      }}
                    >
                      <Icon size={16} color={t.color.brand} />
                    </View>
                    {!last ? <View style={{ flex: 1, width: 2, minHeight: 16, backgroundColor: t.color.hairline }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: t.spacing.lg, gap: 2 }}>
                    <Txt variant="callout">{event.summary}</Txt>
                    <Txt variant="caption" tone="muted">
                      {who ? `${who} · ` : ''}
                      {timeAgo(event.created_at)}
                    </Txt>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState title="No activity yet" body="Sign-offs, payments and updates will show up here as they happen." />
      )}
    </ScreenScroll>
  );
}
