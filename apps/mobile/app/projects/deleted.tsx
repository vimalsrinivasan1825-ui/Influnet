/**
 * Deleted Projects.
 *
 * A project deleted from the main list (see the trash action on the project
 * detail screen) isn't removed — it moves here. Visible to both participants,
 * kept indefinitely, restorable by either side. See migration
 * 103_project_manual_delete.sql and PATCH /api/projects/[id] delete_project /
 * restore_project.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { STAGES, type Stage } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { styleForStatus } from '@/lib/deal-state-style';
import { formatCurrency, humanizeStage, timeAgo } from '@/lib/format';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ScreenScroll,
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
  owner?: { name?: string } | null;
  counterparty?: { name?: string } | null;
}

export default function DeletedProjectsScreen() {
  const t = useTheme();
  const router = useRouter();
  const me = useSession((s) => s.profile?.id);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setErrorMsg] = useState<string | null>(null);

  const { data, error: loadError, loading, refreshing, refresh } = useFetch(
    () => endpoints.listProjects<{ projects: ProjectRow[] }>({ deleted: true }),
    { cacheKey: 'projects-deleted' },
  );

  const rows = data?.projects ?? [];

  async function restore(id: string) {
    setRestoringId(id);
    setErrorMsg(null);
    const res = await endpoints.updateProject(id, { action: 'restore_project' });
    setRestoringId(null);
    if (!res.ok) {
      setErrorMsg(res.error ?? 'Could not restore this project');
      return;
    }
    refresh();
  }

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh} centerShort={rows.length <= 3}>
      {loading ? (
        <SkeletonCard />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Trash2 size={24} color={t.color.brand} />}
          title="Nothing deleted"
          body="Projects you or the other side remove show up here — nothing is ever lost."
        />
      ) : (
        <>
          {error ? (
            <Txt variant="footnote" tone="danger">
              {error}
            </Txt>
          ) : null}
          <ListGroup>
            {rows.map((p, i) => {
              const s = styleForStatus(p.status, t.color);
              const isOwner = p.owner_user_id === me;
              const partner = (isOwner ? p.counterparty?.name : p.owner?.name) ?? 'Partner';
              const stageIndex = STAGES.indexOf(p.current_stage as Stage);
              return (
                <ListRow
                  key={p.id}
                  title={p.title}
                  subtitle={`${partner} · ${humanizeStage(p.current_stage)} · step ${stageIndex + 1} of ${STAGES.length}`}
                  index={i}
                  style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.color.hairline } : undefined}
                  onPress={() => router.push(`/projects/${p.id}`)}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Badge label={s.label} fg={s.fg} bg={s.bg} />
                      {p.budget ? (
                        <Txt variant="caption" tone="muted">
                          {formatCurrency(p.budget)}
                        </Txt>
                      ) : null}
                      <Button
                        label="Restore"
                        variant="secondary"
                        size="md"
                        inline
                        haptic={false}
                        disabled={restoringId === p.id}
                        loading={restoringId === p.id}
                        onPress={() => restore(p.id)}
                      />
                    </View>
                  }
                />
              );
            })}
          </ListGroup>
        </>
      )}
    </ScreenScroll>
  );
}
