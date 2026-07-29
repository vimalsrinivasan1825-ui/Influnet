import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ban, Check, CircleCheck } from 'lucide-react-native';
import {
  STAGES,
  CANCELLATION_REASONS,
  cancellationReasonLabel,
  cancellationReasonRequiresText,
  type Stage,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch, invalidateFetchCache } from '@/lib/use-fetch';
import { useProjectLive } from '@/lib/realtime';
import { styleForStatus } from '@/lib/deal-state-style';
import { formatCurrency, formatDate } from '@/lib/format';
import { StageTimeline, type StageProgressEntry } from '@/components/stage-timeline';
import { ProjectReviews } from '@/components/project-reviews';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  ScreenScroll,
  SectionLabel,
  Sheet,
  SkeletonCard,
  Txt,
  type SheetRef,
} from '@/components/ui';

interface ProjectDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  current_stage: string;
  budget: number | null;
  advance_amount: number | null;
  created_at: string;
  owner_user_id: string;
  counterparty_user_id: string;
  stage_progress: Record<string, StageProgressEntry> | null;
  owner?: { name?: string } | null;
  counterparty?: { name?: string } | null;
  /** Set by request_project_cancellation (migration 089); null once resolved. */
  cancel_requested_by: string | null;
  cancel_reason_category: string | null;
  cancellation_reason: string | null;
}

export default function ProjectDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.profile?.id);

  const { data, error, loading, refreshing, refresh, revalidate } = useFetch(() =>
    endpoints.getProject<{ project: ProjectDetail }>(id), { cacheKey: `project:${id}` }
  );

  // Live: a stage advanced, skipped or cancelled on the other side moves the
  // timeline here without a reload. `revalidate`, not `refresh` — a background
  // update must not raise the pull-to-refresh spinner.
  useProjectLive(id, revalidate);

  const project = data?.project;
  const isOwner = project?.owner_user_id === me;
  const partner = (isOwner ? project?.counterparty?.name : project?.owner?.name) ?? 'Partner';
  const stageIndex = project ? STAGES.indexOf(project.current_stage as Stage) : -1;
  const s = styleForStatus(project?.status, t.color);

  // ── Cancellation ──────────────────────────────────────────────────────
  const cancelSheet = useRef<SheetRef>(null);
  const [reasonCategory, setReasonCategory] = useState<string>(CANCELLATION_REASONS[0].value);
  const [reasonNote, setReasonNote] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const textRequired = cancellationReasonRequiresText(reasonCategory);

  async function afterCancelAction() {
    invalidateFetchCache(`project:${id}`);
    await refresh();
  }

  async function submitCancellationRequest() {
    if (textRequired && !reasonNote.trim()) {
      setCancelError('Add a note — "Other" needs a bit of context for the other side.');
      return;
    }
    setCancelBusy(true);
    setCancelError(null);

    const res = await endpoints.updateProject(id, {
      action: 'request_cancellation',
      reason_category: reasonCategory,
      note: reasonNote.trim() || undefined,
    });

    setCancelBusy(false);
    if (!res.ok) {
      setCancelError(res.error ?? 'Could not request cancellation.');
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    cancelSheet.current?.close();
    setReasonNote('');
    await afterCancelAction();
  }

  /** Same endpoint declines the other side's request or withdraws your own. */
  async function declineOrWithdraw() {
    setCancelBusy(true);
    const res = await endpoints.updateProject(id, { action: 'decline_cancellation' });
    setCancelBusy(false);
    if (res.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await afterCancelAction();
    }
  }

  async function acceptCancellation() {
    setCancelBusy(true);
    const res = await endpoints.updateProject(id, { action: 'accept_cancellation' });
    setCancelBusy(false);
    if (res.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await afterCancelAction();
    }
  }

  // Same approximation used on web: the advance/final-payment stage having
  // been signed off, not a read of the payment ledger itself. Cast: the
  // shared StageProgressEntry type (stage-timeline.tsx) omits `status` — it
  // only needed the sign-off timestamps — but the API always writes it
  // (apps/web/.../route.ts sets entry.status = 'completed'), so reading it
  // here is correct even though the type doesn't know about it.
  const stageStatus = (stage: string) =>
    (project?.stage_progress?.[stage] as { status?: string } | undefined)?.status;
  const paidAmount = project
    ? stageStatus('final_payment') === 'completed'
      ? Number(project.budget || 0)
      : stageStatus('advance_payment') === 'completed'
        ? Number(project.advance_amount || project.budget || 0)
        : 0
    : 0;

  const iRequestedCancellation = !!project?.cancel_requested_by && project.cancel_requested_by === me;

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

            {/* Active, nothing already pending — the pending state gets its
                own card below with Accept/Decline/Withdraw, not this link. */}
            {project.status === 'active' && !project.cancel_requested_by ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => cancelSheet.current?.expand()}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}
              >
                <Ban size={13} color={t.color.contentMuted} />
                <Txt variant="footnote" tone="muted">
                  Request to cancel this project
                </Txt>
              </Pressable>
            ) : null}
          </Card>

          {/* Pending cancellation — shown to BOTH sides, worded for whichever
              one they are. This is deliberately the loudest card on the
              screen while it's open. */}
          {project.cancel_requested_by ? (
            <Card raised style={{ gap: t.spacing.sm, borderColor: t.color.warn + '55' }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm }}>
                <Ban size={17} color={t.color.warn} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt variant="footnote" style={{ fontWeight: '700' }}>
                    {iRequestedCancellation
                      ? `You asked to cancel this project — ${cancellationReasonLabel(project.cancel_reason_category)}. Waiting for the other side.`
                      : `${partner} asked to cancel this project — ${cancellationReasonLabel(project.cancel_reason_category)}.`}
                  </Txt>
                  {project.cancellation_reason ? (
                    <Txt variant="caption" tone="soft">
                      “{project.cancellation_reason}”
                    </Txt>
                  ) : null}
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                {iRequestedCancellation ? (
                  <Button
                    label="Withdraw request"
                    variant="secondary"
                    size="md"
                    inline
                    disabled={cancelBusy}
                    loading={cancelBusy}
                    onPress={declineOrWithdraw}
                  />
                ) : (
                  <>
                    <Button
                      label="Decline"
                      variant="secondary"
                      size="md"
                      inline
                      disabled={cancelBusy}
                      onPress={declineOrWithdraw}
                    />
                    <Button
                      label="Accept & cancel"
                      variant="danger"
                      size="md"
                      inline
                      disabled={cancelBusy}
                      loading={cancelBusy}
                      icon={<Check size={15} color={t.color.white} />}
                      onPress={acceptCancellation}
                    />
                  </>
                )}
              </View>
            </Card>
          ) : null}

          <SectionLabel>Progress</SectionLabel>
          <Card>
            <StageTimeline
              currentStage={project.current_stage}
              stageProgress={project.stage_progress}
              onOpenStage={(stage) => router.push(`/projects/${id}/stage/${stage}`)}
            />
          </Card>

          {/* Rating is only possible once the work is done — and until now it
              was only possible on the web, so a brand working from their phone
              could finish a project and never rate the creator. Those ratings
              are what the creator's public profile shows. */}
          {project.status === 'completed' ? (
            <ProjectReviews projectId={id} partner={partner} />
          ) : null}
        </>
      ) : null}

      <Sheet ref={cancelSheet} title="Request to cancel this project">
        <Txt variant="footnote" tone="muted">
          {partner} sees your reason and has to agree before the project actually closes. Nothing
          is deleted either way — the record and any payments stay available to both of you.
        </Txt>

        {paidAmount > 0 ? (
          <Card style={{ backgroundColor: t.color.warnSoft, borderColor: t.color.warn + '40' }}>
            <Txt variant="footnote" tone="soft">
              <Txt variant="footnote" style={{ fontWeight: '700' }}>
                {formatCurrency(paidAmount)}
              </Txt>{' '}
              has already been paid on this project. Cancelling closes the project but doesn’t move
              any money back — sort out a refund with {partner} directly if one’s needed.
            </Txt>
          </Card>
        ) : null}

        <View style={{ gap: t.spacing.xs }}>
          <Txt variant="footnote" tone="soft">
            Reason
          </Txt>
          {CANCELLATION_REASONS.map((r) => {
            const selected = reasonCategory === r.value;
            return (
              <Pressable
                key={r.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  setReasonCategory(r.value);
                  if (cancelError) setCancelError(null);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: t.spacing.sm,
                  paddingHorizontal: t.spacing.md,
                  borderRadius: t.radii.md,
                  borderWidth: 1,
                  borderColor: selected ? t.color.brand : t.color.hairline,
                  backgroundColor: selected ? t.color.brandSoft : t.color.surfaceCard,
                }}
              >
                <Txt variant="footnote" style={{ fontWeight: selected ? '700' : '400' }}>
                  {r.label}
                </Txt>
                {selected ? <CircleCheck size={16} color={t.color.brand} /> : null}
              </Pressable>
            );
          })}
        </View>

        <Field
          label={textRequired ? 'What happened?' : 'Add more detail (optional)'}
          placeholder="Give the other side enough context to understand why…"
          value={reasonNote}
          onChangeText={setReasonNote}
          multiline
          error={cancelError}
        />

        <Button
          label="Request cancellation"
          variant="danger"
          disabled={cancelBusy}
          loading={cancelBusy}
          icon={<Ban size={16} color={t.color.white} />}
          onPress={submitCancellationRequest}
        />
      </Sheet>
    </ScreenScroll>
  );
}
