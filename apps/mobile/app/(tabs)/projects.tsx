import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderKanban, Trash2 } from 'lucide-react-native';
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
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
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

export default function ProjectsScreen() {
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.profile?.id);

  const { data, error, loading, refreshing, refresh, revalidate } = useFetch(() =>
    endpoints.listProjects<{ projects: ProjectRow[] }>(), { cacheKey: 'projects' }
  );

  // A stage advanced or signed off on the other side moves this list's "Your
  // move" bucket without waiting for a navigation. Silent, so it can't be
  // mistaken for a refresh the user triggered.
  useLiveRefresh('projects', revalidate);

  /**
   * Three buckets, and "Your move" comes first — the whole point of the mobile
   * app is surfacing the thing that is blocked on you.
   */
  const groups = useMemo(() => {
    const all = data?.projects ?? [];
    const yours: ProjectRow[] = [];
    const active: ProjectRow[] = [];
    const closed: ProjectRow[] = [];

    for (const p of all) {
      const state = dealStateOf(p.status);
      if (state === 'completed' || state === 'cancelled') {
        closed.push(p);
        continue;
      }

      const isOwner = p.owner_user_id === me;
      const entry = p.stage_progress?.[p.current_stage];
      const mySignoff = isOwner ? entry?.owner_signoff_at : entry?.creator_signoff_at;

      if (!mySignoff) yours.push(p);
      else active.push(p);
    }

    return { yours, active, closed };
  }, [data, me]);

  function row(p: ProjectRow, i: number, showStageProgress = true) {
    const s = styleForStatus(p.status, t.color);
    const isOwner = p.owner_user_id === me;
    const partner = (isOwner ? p.counterparty?.name : p.owner?.name) ?? 'Partner';
    const stageIndex = STAGES.indexOf(p.current_stage as Stage);

    return (
      <ListRow
        key={p.id}
        title={p.title}
        subtitle={
          showStageProgress
            ? `${partner} · ${humanizeStage(p.current_stage)} · step ${stageIndex + 1} of ${STAGES.length}`
            : `${partner} · ${timeAgo(p.updated_at)}`
        }
        right={
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Badge label={s.label} fg={s.fg} bg={s.bg} />
            {p.budget ? (
              <Txt variant="caption" tone="muted">
                {formatCurrency(p.budget)}
              </Txt>
            ) : null}
          </View>
        }
        index={i}
        style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
        onPress={() => router.push(`/projects/${p.id}`)}
      />
    );
  }

  const isEmpty =
    !groups.yours.length && !groups.active.length && !groups.closed.length;

  return (
    <Screen padded={false}>
      <ScreenScroll
        header={<AppHeader title="Projects" showBell={false} />}
        refreshing={refreshing}
        onRefresh={refresh}
        centerShort={groups.yours.length + groups.active.length + groups.closed.length <= 3}
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
            {groups.yours.length ? (
              <>
                <SectionLabel>Your move</SectionLabel>
                <ListGroup>{groups.yours.map((p, i) => row(p, i))}</ListGroup>
              </>
            ) : null}

            {groups.active.length ? (
              <>
                <SectionLabel>Waiting on them</SectionLabel>
                <ListGroup>{groups.active.map((p, i) => row(p, i))}</ListGroup>
              </>
            ) : null}

            {groups.closed.length ? (
              <>
                <SectionLabel>Closed</SectionLabel>
                <ListGroup>{groups.closed.map((p, i) => row(p, i, false))}</ListGroup>
              </>
            ) : null}

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
