import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, Clock } from 'lucide-react-native';
import {
  STAGES,
  STAGE_GUIDE,
  isMutualSignoffStage,
  isSkippableStage,
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

interface ProjectDetail {
  id: string;
  title: string;
  status: string;
  current_stage: string;
  owner_user_id: string;
  counterparty_user_id: string;
  stage_progress: Record<string, StageProgressEntry> | null;
  owner?: { name?: string } | null;
  counterparty?: { name?: string } | null;
}

export default function StageScreen() {
  const t = useTheme();
  const { id, stage } = useLocalSearchParams<{ id: string; stage: string }>();
  const me = useSession((s) => s.profile?.id);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, loading, refreshing, refresh } = useFetch(() =>
    endpoints.getProject<{ project: ProjectDetail }>(id)
  );

  const project = data?.project;
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

  // My side's instructions come first — this screen is about what I do next.
  const myTasks = isOwner ? guide.brand : guide.creator;
  const theirTasks = isOwner ? guide.creator : guide.brand;

  async function act(action: 'signoff' | 'revoke_signoff' | 'propose_skip') {
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

      {isCurrent && usesSignoff ? (
        <StickyFooter>
          {mySignoff ? (
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
            <Button label="Confirm this stage" onPress={() => act('signoff')} loading={busy} />
          )}

          {isSkippableStage(stageKey) && !mySignoff ? (
            <Button
              label="Propose skipping this stage"
              variant="ghost"
              onPress={() => act('propose_skip')}
              loading={busy}
            />
          ) : null}
        </StickyFooter>
      ) : null}
    </View>
  );
}
