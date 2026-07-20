import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { STAGES, type Stage } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { styleForStatus } from '@/lib/deal-state-style';
import { formatCurrency, formatDate } from '@/lib/format';
import { StageTimeline, type StageProgressEntry } from '@/components/stage-timeline';
import {
  Badge,
  Card,
  ErrorState,
  ScreenScroll,
  SectionLabel,
  SkeletonCard,
  Txt,
} from '@/components/ui';

interface ProjectDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  current_stage: string;
  budget: number | null;
  created_at: string;
  owner_user_id: string;
  counterparty_user_id: string;
  stage_progress: Record<string, StageProgressEntry> | null;
  owner?: { name?: string } | null;
  counterparty?: { name?: string } | null;
}

export default function ProjectDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.profile?.id);

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.getProject<{ project: ProjectDetail }>(id)
  );

  const project = data?.project;
  const isOwner = project?.owner_user_id === me;
  const partner = (isOwner ? project?.counterparty?.name : project?.owner?.name) ?? 'Partner';
  const stageIndex = project ? STAGES.indexOf(project.current_stage as Stage) : -1;
  const s = styleForStatus(project?.status, t.color);

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : project ? (
        <>
          <Card raised style={{ gap: t.spacing.md }}>
            <View style={{ gap: 4 }}>
              <Txt variant="title2">{project.title}</Txt>
              <Txt variant="footnote" tone="muted">
                With {partner} · started {formatDate(project.created_at)}
              </Txt>
            </View>

            <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
              <Badge label={s.label} fg={s.fg} bg={s.bg} />
              {project.budget ? (
                <Badge label={formatCurrency(project.budget)} tone="neutral" />
              ) : null}
              <Badge label={`Step ${stageIndex + 1} of ${STAGES.length}`} tone="neutral" />
            </View>

            {project.description ? (
              <Txt variant="callout" tone="soft">
                {project.description}
              </Txt>
            ) : null}
          </Card>

          <SectionLabel>Progress</SectionLabel>
          <Card>
            <StageTimeline
              currentStage={project.current_stage}
              stageProgress={project.stage_progress}
              onOpenStage={(stage) => router.push(`/projects/${id}/stage/${stage}`)}
            />
          </Card>
        </>
      ) : null}
    </ScreenScroll>
  );
}
