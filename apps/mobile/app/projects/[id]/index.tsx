import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ban, Check, CircleCheck, Flag } from 'lucide-react-native';
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
import { formatCurrency, formatDate, timeAgo } from '@/lib/format';
import { StageTimeline, type StageProgressEntry } from '@/components/stage-timeline';
import { ProjectReviews } from '@/components/project-reviews';
import { ProjectChangeRequests } from '@/components/project-change-requests';
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
  deliverables: string | null;
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

/** One row from /api/projects/[id]/activity — newest first, actor pre-resolved. */
interface ProjectActivityEvent {
  id: string;
  type: string;
  summary: string;
  created_at: string;
  actor: { id: string; name: string | null } | null;
}

export default function ProjectDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.profile?.id);

  const { data, error, loading, refreshing, refresh, revalidate } = useFetch(() =>
    endpoints.getProject<{ project: ProjectDetail }>(id), { cacheKey: `project:${id}` }
  );

  // The project's audit trail. Web has this as a dedicated "Activity" tab;
  // mobile had no way to see who did what when — only the current stage state.
  // Fetched separately from the project so a missing/failed trail costs one
  // card rather than the whole screen.
  const { data: activityData } = useFetch(() =>
    endpoints.projectActivity<{ activity: ProjectActivityEvent[] }>(id),
    { cacheKey: `project-activity:${id}` }
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

  // ── Report / block (trust & safety) ────────────────────────────────────
  // The API (POST /api/reports, POST /api/blocks) and the block LIST/unblock
  // screen (app/blocked-accounts.tsx) already existed; there was simply no
  // screen anywhere in the app that could ever CREATE a block or a report —
  // this mirrors the combined report+block flow added on web.
  const reportSheet = useRef<SheetRef>(null);
  const REPORT_REASONS = [
    { value: 'scam', label: 'Scam' },
    { value: 'harassment', label: 'Harassment' },
    { value: 'spam', label: 'Spam' },
    { value: 'fake', label: 'Fake profile' },
    { value: 'other', label: 'Other' },
  ] as const;
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]['value']>('scam');
  const [reportDetails, setReportDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportDone, setReportDone] = useState(false);
  const otherPartyId = project ? (isOwner ? project.counterparty_user_id : project.owner_user_id) : null;

  async function submitReport() {
    if (!otherPartyId) return;
    setReportBusy(true);
    setReportError(null);

    const res = await endpoints.createReport({
      reported_id: otherPartyId,
      reason: reportReason,
      details: reportDetails.trim() || undefined,
      project_id: Number(id),
    });
    if (!res.ok) {
      setReportBusy(false);
      setReportError(res.error ?? 'Could not submit the report.');
      return;
    }

    if (alsoBlock) {
      const blockRes = await endpoints.createBlock({ blocked_id: otherPartyId });
      if (!blockRes.ok) {
        // The report already went through — don't lose that over the block
        // failing separately (e.g. rate limit). Say so and let them retry the
        // block alone from Settings.
        setReportBusy(false);
        setReportDone(true);
        setReportError('Report sent, but blocking failed — try again from Settings > Blocked accounts.');
        return;
      }
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setReportBusy(false);
    setReportDone(true);
  }

  function closeReportSheet() {
    reportSheet.current?.close();
    setReportDone(false);
    setReportError(null);
    setReportDetails('');
    setAlsoBlock(false);
  }

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

            {otherPartyId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => reportSheet.current?.expand()}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}
              >
                <Flag size={13} color={t.color.contentMuted} />
                <Txt variant="footnote" tone="muted">
                  Report or block {partner}
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

          {/* Change requests — renegotiate terms mid-project. Only available
              on ACTIVE projects (cancelled/completed are frozen records). */}
          {project.status === 'active' ? (
            <ProjectChangeRequests
              projectId={id}
              project={{
                title: project.title,
                description: project.description,
                deliverables: project.deliverables,
                budget: project.budget,
                advance_amount: project.advance_amount,
              }}
              partner={partner}
            />
          ) : null}

          {/* Rating is only possible once the work is done — and until now it
              was only possible on the web, so a brand working from their phone
              could finish a project and never rate the creator. Those ratings
              are what the creator's public profile shows. */}
          {project.status === 'completed' ? (
            <ProjectReviews projectId={id} partner={partner} />
          ) : null}

          {activityData?.activity?.length ? (
            <>
              <SectionLabel>Activity</SectionLabel>
              <Card style={{ gap: t.spacing.md }}>
                {activityData.activity.map((event) => (
                  <View key={event.id} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        marginTop: 5,
                        backgroundColor: t.color.hairlineStrong,
                      }}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="footnote">{event.summary}</Txt>
                      <Txt variant="caption" tone="muted">
                        {event.actor?.name ? `${event.actor.name} · ` : ''}
                        {timeAgo(event.created_at)}
                      </Txt>
                    </View>
                  </View>
                ))}
              </Card>
            </>
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

      <Sheet ref={reportSheet} title={`Report ${partner}`} onClose={closeReportSheet}>
        {reportDone ? (
          <View style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.md }}>
            <CircleCheck size={32} color={t.color.ok} />
            <Txt variant="footnote" style={{ fontWeight: '700', textAlign: 'center' }}>
              Thanks — our team will review this report.
            </Txt>
            {reportError ? (
              <Txt variant="caption" tone="warn" style={{ textAlign: 'center' }}>
                {reportError}
              </Txt>
            ) : null}
            <Button label="Close" variant="secondary" size="md" onPress={closeReportSheet} />
          </View>
        ) : (
          <>
            <Txt variant="footnote" tone="muted">
              Reports are private and sent to the Influnet team for review.
            </Txt>

            <View style={{ gap: t.spacing.xs }}>
              <Txt variant="footnote" tone="soft">
                Reason
              </Txt>
              {REPORT_REASONS.map((r) => {
                const selected = reportReason === r.value;
                return (
                  <Pressable
                    key={r.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setReportReason(r.value)}
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
              label="Details (optional)"
              placeholder="What happened?"
              value={reportDetails}
              onChangeText={setReportDetails}
              multiline
            />

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: alsoBlock }}
              onPress={() => setAlsoBlock((v) => !v)}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: t.spacing.sm,
                padding: t.spacing.md,
                borderRadius: t.radii.md,
                borderWidth: 1,
                borderColor: t.color.hairline,
                backgroundColor: t.color.surfaceMuted,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: alsoBlock ? t.color.danger : t.color.hairlineStrong,
                  backgroundColor: alsoBlock ? t.color.danger : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                {alsoBlock ? <Check size={13} color={t.color.white} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="footnote" style={{ fontWeight: '700' }}>
                  Also block {partner}
                </Txt>
                <Txt variant="caption" tone="muted">
                  They won&rsquo;t be able to message you or send new requests. Manage this later in
                  Settings.
                </Txt>
              </View>
            </Pressable>

            {reportError ? (
              <Txt variant="footnote" tone="danger">
                {reportError}
              </Txt>
            ) : null}

            <Button
              label="Submit report"
              variant="danger"
              disabled={reportBusy}
              loading={reportBusy}
              icon={<Flag size={16} color={t.color.white} />}
              onPress={submitReport}
            />
          </>
        )}
      </Sheet>
    </ScreenScroll>
  );
}
