/**
 * The signed-in user's own timeline.
 *
 * /api/activity derives this in Postgres (migration 073) and returns
 * { events: ActivityEvent[] } — newest first, with `kind` naming what happened.
 * Each kind gets its own icon and tint so a long history can be skimmed by
 * shape rather than read line by line.
 */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BadgeCheck,
  Banknote,
  CircleCheck,
  FolderKanban,
  Handshake,
  History,
  Inbox,
  MessageSquare,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import type { Theme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { timeAgo } from '@/lib/format';
import { toMobileHref } from '@/lib/notification-link';
import {
  Card,
  EmptyState,
  ErrorState,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  Txt,
} from '@/components/ui';

/** Mirrors ActivityEvent in apps/web/src/app/api/activity/route.ts. */
interface ActivityEvent {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  link: string | null;
  project_id: number | null;
  actor_is_me: boolean;
}

/**
 * Icon + tint per event kind. `kind` comes from get_user_activity, so match on
 * substrings rather than an exhaustive list — a new kind added server-side then
 * degrades to the neutral default instead of rendering blank.
 */
function visualFor(kind: string, t: Theme): { Icon: LucideIcon; tint: string } {
  const k = kind.toLowerCase();
  if (k.includes('payment')) return { Icon: Banknote, tint: t.color.ok };
  if (k.includes('verif')) return { Icon: BadgeCheck, tint: t.color.info };
  if (k.includes('request') || k.includes('collab')) return { Icon: Inbox, tint: t.color.warn };
  if (k.includes('proposal') || k.includes('terms')) return { Icon: Handshake, tint: t.color.brand };
  if (k.includes('complete') || k.includes('stage')) return { Icon: CircleCheck, tint: t.color.ok };
  if (k.includes('project')) return { Icon: FolderKanban, tint: t.color.brand };
  if (k.includes('message')) return { Icon: MessageSquare, tint: t.color.info };
  if (k.includes('account') || k.includes('signup') || k.includes('joined')) {
    return { Icon: UserPlus, tint: t.color.contentSoft };
  }
  return { Icon: History, tint: t.color.contentSoft };
}

/** "Today" / "Yesterday" / "March 2026" — the heading a run of events sits under. */
function dayBucket(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'Earlier';

  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(then)) / 86_400_000);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'This month';
  return then.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ActivityScreen() {
  const t = useTheme();
  const router = useRouter();

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.activity<{ events: ActivityEvent[]; migration_pending?: boolean }>(), { cacheKey: 'activity' }
  );

  const events = data?.events ?? [];

  // Group into runs sharing a bucket, preserving the server's newest-first order.
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  for (const event of events) {
    const label = dayBucket(event.at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }

  return (
    <ScreenScroll
      refreshing={refreshing}
      onRefresh={refresh}
      centerShort={events.length === 0}
    >
      {loading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<History size={24} color={t.color.brand} />}
          title="Nothing here yet"
          body={
            data?.migration_pending
              ? 'Your timeline is being set up. Check back shortly.'
              : 'Your requests, projects and profile changes build up a timeline here.'
          }
        />
      ) : (
        groups.map((group) => (
          <View key={group.label}>
            <SectionLabel>{group.label}</SectionLabel>
            <Card>
              {group.events.map((event, i) => {
                const { Icon, tint } = visualFor(event.kind, t);
                const isLast = i === group.events.length - 1;
                const href = toMobileHref(event.link);

                return (
                  <View
                    key={`${event.at}-${event.kind}-${i}`}
                    style={{ flexDirection: 'row', gap: t.spacing.md }}
                  >
                    {/* Rail: a tinted node per event, joined by a hairline. */}
                    <View style={{ width: 30, alignItems: 'center' }}>
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: `${tint}1a`,
                        }}
                      >
                        <Icon size={15} color={tint} />
                      </View>
                      {!isLast ? (
                        <View
                          style={{
                            flex: 1,
                            width: 1.5,
                            backgroundColor: t.color.hairline,
                            marginVertical: 4,
                          }}
                        />
                      ) : null}
                    </View>

                    <View
                      style={{
                        flex: 1,
                        paddingBottom: isLast ? 0 : t.spacing.lg,
                        paddingTop: 5,
                        gap: 2,
                      }}
                    >
                      <Txt
                        variant="callout"
                        style={{ fontWeight: '600' }}
                        // Same web-path problem as notifications: these links
                        // are `/dashboard/...` and have to be translated.
                        onPress={href ? () => router.push(href) : undefined}
                      >
                        {event.title}
                      </Txt>
                      {event.detail ? (
                        <Txt variant="footnote" tone="soft">
                          {event.detail}
                        </Txt>
                      ) : null}
                      <Txt variant="caption" tone="muted">
                        {timeAgo(event.at)}
                      </Txt>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        ))
      )}
    </ScreenScroll>
  );
}
