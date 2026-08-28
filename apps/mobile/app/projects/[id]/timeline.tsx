/**
 * The whole stage history of one project, first stage to last.
 *
 * ── WHY THIS IS A SCREEN AND NOT AN EXPANDER ──────────────────────────
 *
 * The project screen answers "where is this now". This answers "how did it get
 * here", and those are different questions asked at different moments — one
 * while you are working, the other when something has gone slowly and you want
 * to know where the time went. Twelve stages, each with two sign-offs and a
 * date, is not something to unfold inside a scroller that already holds a
 * hero, a progress gauge and a document list.
 *
 * ── EVERY DATE HERE IS RECORDED, NONE IS INFERRED ─────────────────────
 *
 * `stage_progress` is a jsonb map of stage → `{ owner_signoff_at,
 * creator_signoff_at, completed_at, skipped }`, written only by
 * `record_stage_signoff()` (migration 114). So "took 2 days" is the distance
 * between two stored timestamps, not a guess from `updated_at`, and "waiting
 * on you" is the absence of one specific key rather than a status word.
 *
 * A stage with no entry is drawn as not started. That is the honest reading:
 * the map only gains a key when somebody acts, so no key means nobody has.
 *
 * ── WHOSE SIGN-OFF IS WHOSE ───────────────────────────────────────────
 *
 * `owner` is always the paying brand and `counterparty` always the creator —
 * see the note in AGENTS.md. Reading them as "me" and "them" requires knowing
 * which side you are on, which is why `isOwner` is computed once here and the
 * rows below never re-derive it.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { flowOf, type StageFlow } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import type { StageProgressEntry } from '@/components/stage-timeline';
import {
  Card,
  ErrorState,
  PressableScale,
  ScreenScroll,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface TimelineProject {
  id: string;
  title: string;
  status: string;
  current_stage: string;
  flow_key?: string | null;
  created_at: string;
  owner_user_id: string;
  counterparty_user_id: string;
  stage_progress: Record<string, StageProgressEntry> | null;
  owner?: { name?: string } | null;
  counterparty?: { name?: string } | null;
}

type RowState = 'done' | 'current' | 'upcoming' | 'skipped';

function fmt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmtTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(
    'en-IN',
    { hour: 'numeric', minute: '2-digit' },
  )}`;
}

/**
 * "took 2 days", or null.
 *
 * Same-day is "same day" rather than "took 0 days", which reads as a bug. Null
 * whenever either end is missing — a duration with one timestamp is not a
 * duration.
 */
function duration(from?: string | null, to?: string | null): string | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  const days = Math.round((b - a) / 86_400_000);
  if (days === 0) return 'same day';
  return `took ${days} ${days === 1 ? 'day' : 'days'}`;
}

export default function ProjectTimelineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.profile?.id);

  const { data, error, loading, refreshing, refresh } = useFetch(
    () => endpoints.getProject<{ project: TimelineProject }>(String(id)),
    { cacheKey: `project-timeline:${id}` },
  );

  const project = data?.project;
  const isOwner = project?.owner_user_id === me;
  const partner = (isOwner ? project?.counterparty?.name : project?.owner?.name) ?? 'Partner';

  const rows = useMemo(() => {
    if (!project) return [];
    const flow: StageFlow = flowOf(project);
    const currentIndex = flow.stages.indexOf(project.current_stage);
    const progress = project.stage_progress ?? {};

    return flow.stages.map((stage, i) => {
      const entry: StageProgressEntry | undefined = progress[stage];
      const state: RowState = entry?.skipped
        ? 'skipped'
        : i < currentIndex || entry?.completed
          ? 'done'
          : i === currentIndex
            ? 'current'
            : 'upcoming';

      // Whoever signed first started the clock on this stage; the later of the
      // two, or an explicit completed_at, closed it.
      const signoffs = [entry?.owner_signoff_at, entry?.creator_signoff_at].filter(
        Boolean,
      ) as string[];
      const first = signoffs.length ? signoffs.slice().sort()[0] : null;
      const closed = entry?.completed_at ?? (signoffs.length === 2 ? signoffs.slice().sort()[1] : null);

      return {
        stage,
        index: i,
        label: flow.labels[stage] ?? stage,
        state,
        entry,
        first,
        closed,
        mine: isOwner ? entry?.owner_signoff_at : entry?.creator_signoff_at,
        theirs: isOwner ? entry?.creator_signoff_at : entry?.owner_signoff_at,
        total: flow.stages.length,
      };
    });
  }, [project, isOwner]);

  const currentIndex = rows.findIndex((r) => r.state === 'current');

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !project ? (
        <ErrorState message="That project could not be loaded." onRetry={refresh} />
      ) : (
        <>
          <View style={{ gap: 2, marginBottom: t.spacing.sm }}>
            <Txt variant="title2" numberOfLines={2}>
              {project.title}
            </Txt>
            <Txt variant="footnote" tone="muted">
              With {partner}
              {currentIndex >= 0 ? ` · step ${currentIndex + 1} of ${rows.length}` : ''}
            </Txt>
          </View>

          {rows.map((row, i) => {
            const last = i === rows.length - 1;
            const done = row.state === 'done' || row.state === 'skipped';

            return (
              <View key={row.stage} style={{ flexDirection: 'row', gap: t.spacing.md }}>
                {/* The rail column. Fixed width so every row's text starts on
                    the same line however long the label wraps. */}
                <View style={{ width: 32, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor:
                        row.state === 'done'
                          ? t.color.brand
                          : row.state === 'current'
                            ? t.color.surfaceCard
                            : t.color.surface,
                      borderWidth: row.state === 'upcoming' || row.state === 'current' ? 2 : 0,
                      borderColor:
                        row.state === 'current' ? t.color.brand : t.color.hairlineStrong,
                    }}
                  >
                    {row.state === 'done' ? (
                      <Check size={15} color={t.color.white} strokeWidth={3} />
                    ) : (
                      <Txt
                        variant="caption"
                        style={{
                          fontWeight: '700',
                          color:
                            row.state === 'current' ? t.color.brand : t.color.contentMuted,
                        }}
                      >
                        {row.index + 1}
                      </Txt>
                    )}
                  </View>

                  {/* The line to the next dot. Coloured only where the work is
                      actually behind you, so the rail itself reads as a
                      progress bar turned on its side. */}
                  {!last ? (
                    <View
                      style={{
                        flex: 1,
                        width: 2,
                        minHeight: 18,
                        backgroundColor: done ? t.color.brand : t.color.hairlineStrong,
                      }}
                    />
                  ) : null}
                </View>

                <View style={{ flex: 1, paddingBottom: last ? 0 : t.spacing.lg }}>
                  <Txt
                    variant="bodyStrong"
                    style={{
                      fontSize: 15,
                      color: row.state === 'upcoming' ? t.color.contentMuted : t.color.content,
                      fontWeight: row.state === 'upcoming' ? '500' : '600',
                    }}
                  >
                    {row.label}
                  </Txt>

                  <Txt
                    variant="caption"
                    style={{
                      marginTop: 2,
                      color: row.state === 'current' ? t.color.brand : t.color.contentMuted,
                      fontWeight: row.state === 'current' ? '600' : '400',
                    }}
                  >
                    {row.state === 'skipped'
                      ? 'Skipped'
                      : row.state === 'done'
                        ? [fmt(row.closed) ? `Completed ${fmt(row.closed)}` : 'Completed', duration(row.first, row.closed)]
                            .filter(Boolean)
                            .join(' · ')
                        : row.state === 'current'
                          ? fmt(row.first)
                            ? `In progress · started ${fmt(row.first)}`
                            : 'In progress'
                          : 'Not started'}
                  </Txt>

                  {/* The detail, on the stages where there is any. An upcoming
                      stage has nothing recorded against it, and an empty panel
                      under ten of twelve rows is a screen of empty panels. */}
                  {row.state === 'current' || (row.state === 'done' && (row.mine || row.theirs)) ? (
                    <Card style={{ marginTop: t.spacing.sm, gap: t.spacing.sm }}>
                      <SignRow
                        label={`${partner} signed off`}
                        at={row.theirs}
                        waitingLabel={`Waiting for ${partner}`}
                      />
                      <SignRow label="You signed off" at={row.mine} waitingLabel="Waiting for you" />

                      {row.state === 'current' && !row.mine ? (
                        <PressableScale
                          onPress={() =>
                            router.push(`/projects/${project.id}/stage/${row.stage}`)
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${row.label}`}
                        >
                          <View
                            style={{
                              backgroundColor: t.color.brand,
                              borderRadius: t.radii.md,
                              paddingVertical: t.spacing.md,
                              alignItems: 'center',
                              marginTop: t.spacing.xs,
                            }}
                          >
                            <Txt variant="bodyStrong" tone="inverse" style={{ fontSize: 15 }}>
                              Open this stage
                            </Txt>
                          </View>
                        </PressableScale>
                      ) : null}
                    </Card>
                  ) : null}
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScreenScroll>
  );
}

/** One side's sign-off: a tick and a time, or an empty ring and who we wait on. */
function SignRow({
  label,
  at,
  waitingLabel,
}: {
  label: string;
  at?: string | null;
  waitingLabel: string;
}) {
  const t = useTheme();
  const signed = !!at;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: signed ? t.color.brand : 'transparent',
          borderWidth: signed ? 0 : 2,
          borderColor: t.color.hairlineStrong,
        }}
      >
        {signed ? <Check size={11} color={t.color.white} strokeWidth={3.4} /> : null}
      </View>
      <Txt
        variant="footnote"
        numberOfLines={1}
        style={{ flex: 1, color: signed ? t.color.content : t.color.contentMuted }}
      >
        {signed ? label : waitingLabel}
      </Txt>
      {signed ? (
        <Txt variant="caption" tone="muted">
          {fmtTime(at)}
        </Txt>
      ) : null}
    </View>
  );
}
