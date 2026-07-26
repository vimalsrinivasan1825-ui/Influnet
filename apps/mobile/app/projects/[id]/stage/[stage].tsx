import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, Clock, Paperclip } from 'lucide-react-native';
import {
  STAGES,
  STAGE_GUIDE,
  isMutualSignoffStage,
  isSkippableStage,
  stageSkipProposal,
  type Stage,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { humanizeStage, timeAgo } from '@/lib/format';
import type { StageProgressEntry } from '@/components/stage-timeline';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  ScreenScroll,
  SkeletonCard,
  StickyFooter,
  Txt,
} from '@/components/ui';

/** A checklist row for a stage, from /api/projects/[id]/stage-items. */
interface StageItem {
  id: string;
  stage_key: string;
  label: string;
  owner_role: 'business' | 'creator' | 'both' | string;
  is_required: boolean;
  is_gate: boolean;
  done_at: string | null;
}

/** An update posted against a stage, from /api/projects/[id]/stage-entries. */
interface StageEntry {
  id: string;
  stage_key: string;
  author: { id: string; name: string | null } | null;
  body: string | null;
  link_url: string | null;
  file_name: string | null;
  created_at: string;
}

interface ProjectDetail {
  id: string;
  title: string;
  status: string;
  current_stage: string;
  owner_user_id: string;
  counterparty_user_id: string;
  stage_progress: Record<string, StageProgressEntry> | null;
  /** Dual-confirm completion flags (migration 056). */
  owner_confirmed_complete?: boolean | null;
  counterparty_confirmed_complete?: boolean | null;
  owner?: { name?: string } | null;
  counterparty?: { name?: string } | null;
}

export default function StageScreen() {
  const t = useTheme();
  const { id, stage } = useLocalSearchParams<{ id: string; stage: string }>();
  const me = useSession((s) => s.profile?.id);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  /**
   * The stage's three sources at once: the project (for sign-off state), its
   * checklist items, and the updates posted against it. The web project-flow
   * shows all three; mobile was showing only the first, which is why a stage
   * looked like static instructions rather than a place work happens.
   *
   * Only the project is essential — a missing checklist or feed costs a card,
   * not the screen.
   */
  const { data, error, loading, refreshing, refresh } = useFetch(
    async () => {
      const [projectRes, itemsRes, entriesRes] = await Promise.all([
        endpoints.getProject<{ project: ProjectDetail }>(id),
        endpoints.listStageItems<{ items: StageItem[] }>(id),
        endpoints.listStageEntries<{ entries: StageEntry[] }>(id),
      ]);

      if (!projectRes.ok || !projectRes.data) {
        return { ok: false, status: projectRes.status, error: projectRes.error, data: null };
      }

      return {
        ok: true,
        status: projectRes.status,
        error: null,
        data: {
          project: projectRes.data.project,
          items: itemsRes.ok ? itemsRes.data?.items ?? [] : [],
          entries: entriesRes.ok ? entriesRes.data?.entries ?? [] : [],
        },
      };
    },
    { cacheKey: `stage:${id}` }
  );

  const project = data?.project;
  const stageItems = (data?.items ?? []).filter((item) => item.stage_key === stage);
  const stageEntries = (data?.entries ?? []).filter((entry) => entry.stage_key === stage);
  const stageKey = stage as Stage;
  const guide = STAGE_GUIDE[stageKey];

  if (!guide) {
    return <ErrorState message={`Unknown stage "${stage}".`} />;
  }

  const isOwner = project?.owner_user_id === me;
  const entry = project?.stage_progress?.[stageKey];
  const partner = (isOwner ? project?.counterparty?.name : project?.owner?.name) ?? 'them';

  const mySignoff = isOwner ? entry?.owner_signoff_at : entry?.creator_signoff_at;
  const theirSignoff = isOwner ? entry?.creator_signoff_at : entry?.owner_signoff_at;

  const isCurrent = project?.current_stage === stageKey;
  const isPast = project ? STAGES.indexOf(stageKey) < STAGES.indexOf(project.current_stage as Stage) : false;
  const usesSignoff = isMutualSignoffStage(stageKey);

  // Completion is its own control, not a sign-off (NON_SIGNOFF_STAGES). Without
  // this branch the final stage rendered NO footer at all, so a project started
  // on the phone could be carried all the way to final payment and then never
  // finished — 'signoff' is rejected outright by the API for this stage.
  const isCompletionStage = stageKey === 'final_payment';
  const iConfirmedCompletion = isOwner
    ? !!project?.owner_confirmed_complete
    : !!project?.counterparty_confirmed_complete;
  const theyConfirmedCompletion = isOwner
    ? !!project?.counterparty_confirmed_complete
    : !!project?.owner_confirmed_complete;

  const skipProposal = stageSkipProposal(project?.stage_progress, stageKey);
  const iProposedSkip = !!skipProposal && skipProposal.by === me;
  const theyProposedSkip = !!skipProposal && !iProposedSkip;

  // My side's instructions come first — this screen is about what I do next.
  const myTasks = isOwner ? guide.brand : guide.creator;
  const theirTasks = isOwner ? guide.creator : guide.brand;

  const myRole: 'business' | 'creator' = isOwner ? 'business' : 'creator';

  async function toggleItem(item: StageItem) {
    setItemBusyId(item.id);
    setItemError(null);

    const res = await endpoints.updateStageItem(id, { item_id: item.id, done: !item.done_at });
    setItemBusyId(null);

    if (!res.ok) {
      setItemError(res.error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  async function act(
    action:
      | 'signoff'
      | 'revoke_signoff'
      | 'propose_skip'
      | 'confirm_skip'
      | 'cancel_skip'
      | 'confirm_completion'
  ) {
    setBusy(true);
    setActionError(null);

    const res = await endpoints.updateProject(id, { action, stage: stageKey });
    setBusy(false);

    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
        {loading ? (
          <SkeletonCard />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <>
            <View style={{ gap: 6, paddingTop: t.spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Txt variant="title1" style={{ flex: 1 }}>
                  {humanizeStage(stageKey)}
                </Txt>
                {isPast ? (
                  <Badge label="Done" tone="ok" />
                ) : isCurrent ? (
                  <Badge label="Active now" tone="brand" />
                ) : (
                  <Badge label="Upcoming" tone="neutral" />
                )}
              </View>
              <Txt variant="body" tone="soft">
                {guide.summary}
              </Txt>
            </View>

            <Card style={{ gap: t.spacing.sm }}>
              <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                What you do
              </Txt>
              {myTasks.map((task) => (
                <View key={task} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                  <Txt variant="callout" tone="muted">
                    ·
                  </Txt>
                  <Txt variant="callout" tone="soft" style={{ flex: 1 }}>
                    {task}
                  </Txt>
                </View>
              ))}
            </Card>

            <Card style={{ gap: t.spacing.sm }}>
              <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                What {partner} does
              </Txt>
              {theirTasks.map((task) => (
                <View key={task} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                  <Txt variant="callout" tone="muted">
                    ·
                  </Txt>
                  <Txt variant="callout" tone="muted" style={{ flex: 1 }}>
                    {task}
                  </Txt>
                </View>
              ))}
            </Card>

            {stageItems.length > 0 ? (
              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Checklist
                </Txt>

                {stageItems.map((item) => {
                  // Mirrors the server's owner_role gate (stage-items/route.ts)
                  // so a row that can't actually be toggled doesn't invite a tap.
                  const mine = item.owner_role === 'both' || item.owner_role === myRole;
                  const rowBusy = itemBusyId === item.id;

                  return (
                    <Pressable
                      key={item.id}
                      disabled={!mine || rowBusy}
                      onPress={() => toggleItem(item)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!item.done_at, disabled: !mine }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: t.spacing.sm,
                        opacity: rowBusy ? 0.5 : pressed && mine ? 0.7 : 1,
                      })}
                    >
                      {item.done_at ? (
                        <Check size={16} color={t.color.ok} style={{ marginTop: 2 }} />
                      ) : (
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 7,
                            borderWidth: 1.5,
                            borderColor: t.color.hairlineStrong,
                            marginTop: 3,
                            marginHorizontal: 1,
                          }}
                        />
                      )}
                      <View style={{ flex: 1, gap: 3 }}>
                        <Txt variant="callout" tone={item.done_at ? 'muted' : 'default'}>
                          {item.label}
                        </Txt>
                        {item.is_gate || !item.is_required || !mine ? (
                          <View style={{ flexDirection: 'row', gap: t.spacing.xs }}>
                            {item.is_gate ? <Badge label="Gate" tone="warn" /> : null}
                            {!item.is_required ? <Badge label="Optional" tone="neutral" /> : null}
                            {!mine ? (
                              <Badge label={`${item.owner_role === 'business' ? 'Brand' : 'Creator'} marks this`} tone="neutral" />
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}

                {itemError ? (
                  <Txt variant="footnote" tone="danger">
                    {itemError}
                  </Txt>
                ) : null}
              </Card>
            ) : null}

            {stageEntries.length > 0 ? (
              <Card style={{ gap: t.spacing.lg }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Updates
                </Txt>

                {stageEntries.map((entry) => (
                  <View key={entry.id} style={{ gap: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                      <Txt variant="footnote" style={{ fontWeight: '600' }}>
                        {entry.author?.name ?? 'Someone'}
                      </Txt>
                      <Txt variant="caption" tone="muted">
                        {timeAgo(entry.created_at)}
                      </Txt>
                    </View>

                    {entry.body ? (
                      <Txt variant="callout" tone="soft">
                        {entry.body}
                      </Txt>
                    ) : null}

                    {entry.link_url ? (
                      <Txt
                        variant="footnote"
                        tone="brand"
                        numberOfLines={1}
                        onPress={() => void Linking.openURL(entry.link_url!)}
                      >
                        {entry.link_url}
                      </Txt>
                    ) : null}

                    {entry.file_name ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Paperclip size={13} color={t.color.contentMuted} />
                        {/* The API returns a storage path, not a signed URL, so
                            there is nothing safe to open from here. */}
                        <Txt variant="footnote" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                          {entry.file_name}
                        </Txt>
                      </View>
                    ) : null}
                  </View>
                ))}
              </Card>
            ) : null}

            {usesSignoff ? (
              <Card style={{ gap: t.spacing.md }}>
                <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Sign-off
                </Txt>

                {[
                  { who: 'You', at: mySignoff },
                  { who: partner, at: theirSignoff },
                ].map((p) => (
                  <View
                    key={p.who}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
                  >
                    {p.at ? (
                      <Check size={16} color={t.color.ok} />
                    ) : (
                      <Clock size={16} color={t.color.contentMuted} />
                    )}
                    <Txt variant="callout" tone={p.at ? 'default' : 'muted'} style={{ flex: 1 }}>
                      {p.who}
                    </Txt>
                    <Txt variant="footnote" tone={p.at ? 'ok' : 'muted'}>
                      {p.at ? `Confirmed ${timeAgo(p.at)}` : 'Not yet'}
                    </Txt>
                  </View>
                ))}

                <Txt variant="footnote" tone="muted">
                  This stage moves on once you both confirm.
                </Txt>
              </Card>
            ) : (
              <Card>
                <Txt variant="footnote" tone="muted">
                  This stage has its own controls rather than a two-sided
                  confirmation — handle it from the project chat.
                </Txt>
              </Card>
            )}

            {actionError ? (
              <Card style={{ backgroundColor: t.color.dangerSoft, borderColor: t.color.danger }}>
                <Txt variant="footnote" tone="danger">
                  {actionError}
                </Txt>
              </Card>
            ) : null}
          </>
        )}
      </ScreenScroll>

      {isCurrent && isCompletionStage ? (
        <StickyFooter>
          {iConfirmedCompletion ? (
            <Txt variant="footnote" tone="muted" center>
              {theyConfirmedCompletion
                ? 'Both sides confirmed — this project is complete.'
                : `You've confirmed completion. Waiting for ${partner}.`}
            </Txt>
          ) : (
            <>
              <Txt variant="footnote" tone="muted" center>
                {theyConfirmedCompletion
                  ? `${partner} has confirmed the project is done.`
                  : 'Confirm once the final payment has settled and the work is delivered.'}
              </Txt>
              <Button
                label="Confirm completion"
                onPress={() => act('confirm_completion')}
                loading={busy}
              />
            </>
          )}
        </StickyFooter>
      ) : isCurrent && usesSignoff ? (
        <StickyFooter>
          {theyProposedSkip ? (
            <>
              <Txt variant="footnote" tone="muted" center>
                {partner} suggested skipping this stage.
              </Txt>
              <Button label="Confirm skip" onPress={() => act('confirm_skip')} loading={busy} />
              <Button
                label="Keep this stage"
                variant="secondary"
                onPress={() => act('cancel_skip')}
                loading={busy}
              />
            </>
          ) : iProposedSkip ? (
            <>
              <Txt variant="footnote" tone="muted" center>
                Waiting for {partner} to confirm the skip.
              </Txt>
              <Button
                label="Cancel skip proposal"
                variant="secondary"
                onPress={() => act('cancel_skip')}
                loading={busy}
              />
            </>
          ) : mySignoff ? (
            <>
              <Txt variant="footnote" tone="muted" center>
                {theirSignoff
                  ? 'Both confirmed — this stage is ready to move.'
                  : `Waiting for ${partner} to confirm.`}
              </Txt>
              <Button
                label="Undo my confirmation"
                variant="secondary"
                onPress={() => act('revoke_signoff')}
                loading={busy}
              />
            </>
          ) : (
            <>
              <Button label="Confirm this stage" onPress={() => act('signoff')} loading={busy} />
              {isSkippableStage(stageKey) ? (
                <Button
                  label="Propose skipping this stage"
                  variant="ghost"
                  onPress={() => act('propose_skip')}
                  loading={busy}
                />
              ) : null}
            </>
          )}
        </StickyFooter>
      ) : null}
    </View>
  );
}
