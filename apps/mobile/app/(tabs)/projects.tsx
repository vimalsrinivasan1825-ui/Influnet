/**
 * Projects — redesigned with filter tabs and project cards showing progress.
 *
 * Changes (2026-08):
 *  - ChipRail filter tabs: Ongoing | Completed | Cancelled
 *  - Cards instead of plain ListRows — each shows a ProgressBar, budget badge,
 *    and stage label so the user can see status at a glance without tapping in
 *  - "Your move" / "Waiting on them" sub-labels preserved within Ongoing
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, FolderKanban, Trash2 } from 'lucide-react-native';
import { dealStateOf, STAGES, flowOf, type Stage } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { useLiveRefresh } from '@/lib/realtime';
import { styleForStatus } from '@/lib/deal-state-style';
import { formatCurrency, humanizeStage, timeAgo } from '@/lib/format';
import { AppHeader } from '@/components/app-header';
import { ProjectCard } from '@/components/project-card';
import {
  OVERVIEW_MIN_PROJECTS,
  ProjectsOverview,
} from '@/components/projects-overview';
import {
  Badge,
  Card,
  Chip,
  ChipRail,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ProgressBar,
  Screen,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  current_stage: string;
  flow_key?: string | null;
  budget: number | null;
  /** Both already returned — the route selects `*`. */
  due_date?: string | null;
  created_at?: string | null;
  updated_at: string;
  owner_user_id: string;
  counterparty_user_id: string;
  stage_progress?: Record<string, { owner_signoff_at?: string; creator_signoff_at?: string }>;
  owner?: { name?: string } | null;
  counterparty?: { name?: string } | null;
}

type FilterKey = 'ongoing' | 'completed' | 'cancelled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function ProjectsScreen() {
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.profile?.id);

  const [filter, setFilter] = useState<FilterKey>('ongoing');

  const { data, error, loading, refreshing, refresh, revalidate } = useFetch(() =>
    endpoints.listProjects<{ projects: ProjectRow[] }>(), { cacheKey: 'projects' }
  );

  // A stage advanced or signed off on the other side moves this list's "Your
  // move" bucket without waiting for a navigation.
  useLiveRefresh('projects', revalidate);

  const groups = useMemo(() => {
    const all = data?.projects ?? [];
    const yours: ProjectRow[] = [];
    const active: ProjectRow[] = [];
    const completed: ProjectRow[] = [];
    const cancelled: ProjectRow[] = [];

    for (const p of all) {
      const state = dealStateOf(p.status);
      if (state === 'completed') {
        completed.push(p);
        continue;
      }
      if (state === 'cancelled') {
        cancelled.push(p);
        continue;
      }

      const isOwner = p.owner_user_id === me;
      const entry = p.stage_progress?.[p.current_stage];
      const mySignoff = isOwner ? entry?.owner_signoff_at : entry?.creator_signoff_at;

      if (!mySignoff) yours.push(p);
      else active.push(p);
    }

    return { yours, active, completed, cancelled };
  }, [data, me]);

  /**
   * Every project draws as the same card, open or closed.
   *
   * There used to be two builders — a rich one for ongoing work and a stripped
   * one for finished work — and the second was solving a problem it did not
   * have. A completed project still has a partner, a budget and a title worth
   * recognising by its icon; all it lacks is a NEXT step, and `ProjectCard`
   * already omits the bar and the deadline when the stage or the date is
   * missing. Two layouts for one object cost more in recognition than the
   * handful of pixels the short one saved.
   */
  function card(p: ProjectRow, yourMove = false) {
    const s = styleForStatus(p.status, t.color);
    const isOwner = p.owner_user_id === me;
    return (
      <ProjectCard
        key={p.id}
        data={{
          id: p.id,
          title: p.title,
          status: p.status,
          current_stage: p.current_stage,
          flow_key: p.flow_key,
          budget: p.budget,
          due_date: p.due_date,
          created_at: p.created_at,
          partner: (isOwner ? p.counterparty?.name : p.owner?.name) ?? 'Partner',
          statusLabel: s.label,
          statusFg: s.fg,
          statusBg: s.bg,
          yourMove,
        }}
        onPress={() => router.push(`/projects/${p.id}`)}
      />
    );
  }

  const ongoing = [...groups.yours, ...groups.active];
  const isEmpty = ongoing.length === 0 && groups.completed.length === 0 && groups.cancelled.length === 0;

  const visibleItems =
    filter === 'ongoing' ? ongoing :
    filter === 'completed' ? groups.completed :
    groups.cancelled;

  return (
    <Screen padded={false}>
      <ScreenScroll
        header={<AppHeader title="Projects" showBell={false} />}
        refreshing={refreshing}
        onRefresh={refresh}
        centerShort={isEmpty}
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : isEmpty ? (
          <EmptyState
            icon={<FolderKanban size={24} color={t.color.brand} />}
            title="No projects yet"
            body="Once you and a partner agree terms in chat, the project you create together shows up here."
          />
        ) : (
          <>
            {/* Filter tabs */}
            <ChipRail>
              {FILTERS.map((f) => {
                const count =
                  f.key === 'ongoing' ? ongoing.length :
                  f.key === 'completed' ? groups.completed.length :
                  groups.cancelled.length;
                return (
                  <Chip
                    key={f.key}
                    label={`${f.label}${count > 0 ? ` (${count})` : ''}`}
                    selected={filter === f.key}
                    onPress={() => setFilter(f.key)}
                  />
                );
              })}
            </ChipRail>

            {/* Only once there is something to summarise — see the note in
                projects-overview.tsx. */}
            {ongoing.length + groups.completed.length + groups.cancelled.length >=
            OVERVIEW_MIN_PROJECTS ? (
              <>
                <SectionLabel>Overview</SectionLabel>
                <ProjectsOverview
                  active={groups.active.length}
                  yourMove={groups.yours.length}
                  completed={groups.completed.length}
                  cancelled={groups.cancelled.length}
                />
              </>
            ) : null}

            {visibleItems.length === 0 ? (
              <EmptyState
                icon={<FolderKanban size={24} color={t.color.brand} />}
                title={`No ${filter} projects`}
                body=""
              />
            ) : (
              <>
                {/* Within Ongoing: show "Your move" sub-label */}
                {filter === 'ongoing' && groups.yours.length > 0 && groups.active.length > 0 ? (
                  <>
                    <SectionLabel>Your move · {groups.yours.length}</SectionLabel>
                    <View style={{ gap: t.spacing.md }}>
                      {groups.yours.map((p) => card(p, true))}
                    </View>
                    <SectionLabel>Waiting on them · {groups.active.length}</SectionLabel>
                    <View style={{ gap: t.spacing.md }}>
                      {groups.active.map((p) => card(p))}
                    </View>
                  </>
                ) : (
                  <View style={{ gap: t.spacing.md }}>
                    {visibleItems.map((p) =>
                      card(p, filter === 'ongoing' && groups.yours.includes(p)),
                    )}
                  </View>
                )}
              </>
            )}

            {/* Deleted projects row (always visible) */}
            <ListGroup>
              <ListRow
                title="Deleted Projects"
                subtitle="Removed projects — nothing is ever lost"
                left={<Trash2 size={19} color={t.color.contentSoft} />}
                onPress={() => router.push('/projects/deleted')}
              />
            </ListGroup>
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}
