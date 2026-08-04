import { useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ban, Check, CircleCheck, EllipsisVertical, Flag, RotateCcw, Trash2 } from 'lucide-react-native';
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
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  ListGroup,
  ListRow,
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

/** One row from /api/projects/[id]/activity — newest first, actor pre-resolved. */
interface ProjectActivityEvent {
  id: string;
  summary: string;
  created_at: string;
  actor: { id: string; name: string | null } | null;
}

interface ChangeRequestSummary {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
}

/**
 * The whole record used to live on this one screen: header, progress, the
 * full change-request negotiation UI (with its own form sheet), and the
 * entire activity log, all in one scroll. Two real problems came out of that:
 *
 * 1. Three separate `<Sheet>` (gorhom BottomSheet) instances were mounted as
 *    children of the page's ScrollView. BottomSheet is documented to expect a
 *    sibling of a fixed-size container, not scrollable content with
 *    unbounded height — nested that way, and combined with pull-to-refresh's
 *    own gesture handling on the same ScrollView, the sheets could flash open
 *    on load with nothing pressed. Every Sheet on this screen (and the ones
 *    that used to live inside ProjectChangeRequests) is now a sibling of
 *    ScreenScroll, not a child of it.
 * 2. Cancelling and reporting — rare, and one of them destructive — sat as
 *    two permanently-visible text links in the header card, and the full
 *    change-request history plus the entire audit trail rendered inline
 *    regardless of whether there was anything pending. Change requests and
 *    activity now get their own screens, reached from a one-line summary
 *    row each; the rare actions collapse behind a single "more" button that
 *    matches how the stage sub-screens are already reached.
 */
export default function ProjectDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.profile?.id);

  const { data, error, loading, refreshing, refresh, revalidate } = useFetch(() =>
    endpoints.getProject<{ project: ProjectDetail }>(id), { cacheKey: `project:${id}` }
  );

  // Lightweight — just enough for the summary row's count and latest line.
  // The full negotiation UI (and its propose-change sheet) lives on its own
  // screen now; this shares that screen's cache key so navigating in doesn't
  // re-fetch what we already have.
  const { data: crData } = useFetch(() =>
    endpoints.listChangeRequests<{ change_requests: ChangeRequestSummary[] }>(id),
    { cacheKey: `change-requests:${id}` }
  );
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

  const pendingChangeCount = (crData?.change_requests ?? []).filter((cr) => cr.status === 'pending').length;
  const latestActivity = activityData?.activity?.[0];

  // ── "More" menu — the entry point for cancel, delete and report/block ──
  const menuSheet = useRef<SheetRef>(null);

  // ── Delete — unilateral, any status, no counterparty confirmation ──────
  // Not a cancel: nothing here needs agreement. It just moves the project
  // out of both participants' main list into Deleted Projects (migration
  // 103) — the row, its payments and its activity all survive untouched.
  const [deleteBusy, setDeleteBusy] = useState(false);

  function confirmDeleteProject() {
    menuSheet.current?.close();
    Alert.alert(
      'Delete this project?',
      'It moves to Deleted Projects — nothing is lost, and either of you can restore it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleteBusy(true);
            const res = await endpoints.updateProject(id, { action: 'delete_project' });
            setDeleteBusy(false);
            if (!res.ok) {
              Alert.alert('Could not delete this project', res.error ?? undefined);
              return;
            }
            invalidateFetchCache('projects');
            invalidateFetchCache(`project:${id}`);
            router.back();
          },
        },
      ],
    );
  }

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
    <View style={{ flex: 1 }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <SkeletonCard />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : project ? (
          <>
            <Card raised style={{ gap: t.spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.spacing.sm }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt variant="title2">{project.title}</Txt>
                  <Txt variant="footnote" tone="muted">
                    With {partner} · started {formatDate(project.created_at)}
                  </Txt>
                </View>

                {/* Cancel and report/block used to be two permanently-visible
                    text links here. Both are rare, and one is destructive —
                    they collapse behind this single button now. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More options"
                  onPress={() => menuSheet.current?.expand()}
                  hitSlop={10}
                  style={{ padding: 4, marginTop: -4, marginRight: -6 }}
                >
                  <EllipsisVertical size={20} color={t.color.contentMuted} />
                </Pressable>
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

            {/* Change requests and activity are detail, not the primary task
                of this screen — a one-line summary each, full UI one tap
                away. Only shown for active projects: cancelled/completed
                are frozen records with nothing left to negotiate. */}
            {project.status === 'active' ? (
              <ListGroup>
                <ListRow
                  title="Change requests"
                  subtitle={pendingChangeCount > 0 ? `${pendingChangeCount} pending` : 'Propose or review terms'}
                  left={<RotateCcw size={18} color={pendingChangeCount > 0 ? t.color.brand : t.color.contentMuted} />}
                  right={pendingChangeCount > 0 ? <Badge label={String(pendingChangeCount)} tone="brand" /> : null}
                  onPress={() => router.push(`/projects/${id}/change-requests`)}
                />
              </ListGroup>
            ) : null}

            {project.status === 'completed' ? (
              <ProjectReviews projectId={id} partner={partner} />
            ) : null}

            <ListGroup>
              <ListRow
                title="Activity"
                subtitle={latestActivity ? `${latestActivity.summary} · ${timeAgo(latestActivity.created_at)}` : 'No activity yet'}
                onPress={() => router.push(`/projects/${id}/activity`)}
              />
            </ListGroup>
          </>
        ) : null}
      </ScreenScroll>

      {/* All sheets below are siblings of ScreenScroll, not children of it —
          see the note at the top of this file for why that matters. */}

      <Sheet ref={menuSheet} title={project?.title}>
        {project?.status === 'active' && !project.cancel_requested_by ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              menuSheet.current?.close();
              cancelSheet.current?.expand();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.sm }}
          >
            <Ban size={17} color={t.color.content} />
            <Txt variant="callout">Request to cancel this project</Txt>
          </Pressable>
        ) : null}
        {otherPartyId ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              menuSheet.current?.close();
              reportSheet.current?.expand();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.sm }}
          >
            <Flag size={17} color={t.color.danger} />
            <Txt variant="callout" tone="danger">Report or block {partner}</Txt>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={deleteBusy}
          onPress={confirmDeleteProject}
          style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.sm }}
        >
          <Trash2 size={17} color={t.color.danger} />
          <Txt variant="callout" tone="danger">Delete this project</Txt>
        </Pressable>
      </Sheet>

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
    </View>
  );
}
