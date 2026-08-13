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
import { dealStateOf, STAGES, type Stage } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { useLiveRefresh } from '@/lib/realtime';
import { styleForStatus } from '@/lib/deal-state-style';
import { formatCurrency, humanizeStage, timeAgo } from '@/lib/format';
import { AppHeader } from '@/components/app-header';
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
  budget: number | null;
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

  /** A rich project card with progress bar and budget. */
  function projectCard(p: ProjectRow) {
    const s = styleForStatus(p.status, t.color);
    const isOwner = p.owner_user_id === me;
    const partner = (isOwner ? p.counterparty?.name : p.owner?.name) ?? 'Partner';
    const stageIndex = STAGES.indexOf(p.current_stage as Stage);
    const progress = STAGES.length > 0 ? (stageIndex + 1) / STAGES.length : 0;

    return (
      <Pressable
        key={p.id}
        onPress={() => router.push(`/projects/${p.id}`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <Card style={{ gap: t.spacing.md }}>
          {/* Title row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>{p.title}</Txt>
              <Txt variant="caption" tone="muted">{partner}</Txt>
            </View>
            <Badge label={s.label} fg={s.fg} bg={s.bg} />
          </View>

          {/* Stage progress bar */}
          <View style={{ gap: t.spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt variant="caption" tone="muted">{humanizeStage(p.current_stage)}</Txt>
              <Txt variant="caption" tone="muted">
                Step {stageIndex + 1} of {STAGES.length}
              </Txt>
            </View>
            <ProgressBar progress={progress} />
          </View>

          {/* Footer: budget + time */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {p.budget ? (
              <Txt variant="footnote" style={{ color: t.color.brand, fontWeight: '600' }}>
                {formatCurrency(p.budget)}
              </Txt>
            ) : (
              <View />
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Txt variant="caption" tone="muted">{timeAgo(p.updated_at)}</Txt>
              <ChevronRight size={13} color={t.color.contentMuted} />
            </View>
          </View>
        </Card>
      </Pressable>
    );
  }

  /** A simpler closed-project card (no progress bar). */
  function closedCard(p: ProjectRow) {
    const s = styleForStatus(p.status, t.color);
    const isOwner = p.owner_user_id === me;
    const partner = (isOwner ? p.counterparty?.name : p.owner?.name) ?? 'Partner';

    return (
      <Pressable
        key={p.id}
        onPress={() => router.push(`/projects/${p.id}`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>{p.title}</Txt>
              <Txt variant="caption" tone="muted">{partner} · {timeAgo(p.updated_at)}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Badge label={s.label} fg={s.fg} bg={s.bg} />
              {p.budget ? (
                <Txt variant="caption" tone="muted">{formatCurrency(p.budget)}</Txt>
              ) : null}
            </View>
          </View>
        </Card>
      </Pressable>
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
                      {groups.yours.map(projectCard)}
                    </View>
                    <SectionLabel>Waiting on them · {groups.active.length}</SectionLabel>
                    <View style={{ gap: t.spacing.md }}>
                      {groups.active.map(projectCard)}
                    </View>
                  </>
                ) : (
                  <View style={{ gap: t.spacing.md }}>
                    {filter === 'ongoing'
                      ? visibleItems.map(projectCard)
                      : visibleItems.map(closedCard)}
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
