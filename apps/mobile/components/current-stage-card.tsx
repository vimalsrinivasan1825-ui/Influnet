/**
 * "Where it stands" — the project screen's answer to ONE question: what is
 * happening right now, and who is holding it up.
 *
 * ── WHY THIS IS NOT THE FULL TWELVE-STAGE LIST ────────────────────────
 *
 * The project's own screen used to render `StageTimeline` in full here —
 * every stage from 1 to 12, each a dot on a rail, with only the current one
 * expanded. That answers "how did we get here", which is a different
 * question asked at a different moment: someone opening a project mid-work
 * wants to know what to do next, not review nine stages of history they
 * already lived through. Eleven greyed-out rows above and below the one that
 * matters buried the actual answer in scroll.
 *
 * So this card shows exactly one stage — the current one — as a ring (how
 * far, and how long is left) plus a card (what this stage is for, and which
 * side's move it is). "How did we get here" still exists; it is what
 * `/projects/[id]/timeline` is for, one tap away via the button below this.
 */
import { View } from 'react-native';
import { Check, Clock } from 'lucide-react-native';
import {
  STAGE_GUIDE,
  isMutualSignoffStage,
  isSkippableStage,
  stageSignoffAt,
  type StageFlow,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { timeAgo } from '@/lib/format';
import { Badge, Card, PressableScale, ProgressBar, ProgressRing, Txt } from '@/components/ui';

/** One side's mark on the handshake row: a tick and a time, or a wait. */
function SignoffMark({
  label,
  at,
}: {
  label: string;
  at?: string | null;
}) {
  const t = useTheme();
  const signed = !!at;

  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: signed ? t.color.ok : 'transparent',
          borderWidth: signed ? 0 : 2,
          borderColor: t.color.hairlineStrong,
        }}
      >
        {signed ? <Check size={11} color={t.color.white} strokeWidth={3.4} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Txt
          variant="footnote"
          numberOfLines={1}
          style={{ fontWeight: '600', color: signed ? t.color.content : t.color.contentMuted }}
        >
          {label}
        </Txt>
        {signed ? (
          <Txt variant="caption" tone="muted" style={{ fontSize: 11 }}>
            {timeAgo(at)}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

/** Whole days between now and an ISO date. Null once it has no meaning. */
function daysUntil(due?: string | null): number | null {
  if (!due) return null;
  const ms = new Date(due).getTime();
  if (Number.isNaN(ms)) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(ms).setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000);
}

export function CurrentStageCard({
  currentStage,
  stageProgress,
  flow,
  dueDate,
  onOpenStage,
}: {
  currentStage: string;
  stageProgress: Record<string, any> | null | undefined;
  flow: StageFlow;
  dueDate?: string | null;
  onOpenStage: () => void;
}) {
  const t = useTheme();

  const index = flow.stages.indexOf(currentStage);
  const known = index >= 0;
  const total = flow.stages.length;
  const step = known ? index + 1 : null;
  const progress = known ? step! / total : 0;
  const label = known ? flow.labels[currentStage] ?? currentStage : currentStage;
  const guide = STAGE_GUIDE[currentStage];
  const mutual = known && isMutualSignoffStage(currentStage, flow);
  const skippable = known && isSkippableStage(currentStage, flow);
  const days = daysUntil(dueDate);

  const brandAt = stageSignoffAt(stageProgress, currentStage, 'business');
  const creatorAt = stageSignoffAt(stageProgress, currentStage, 'creator');

  return (
    <View style={{ gap: t.spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          backgroundColor: t.color.brandSoft,
          borderRadius: t.radii.lg,
          padding: t.spacing.lg,
        }}
      >
        <ProgressRing progress={progress} size={64} thickness={7} label={`${Math.round(progress * 100)}%`} color={t.color.brand} />
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong" style={{ fontSize: 16 }}>
            {known ? `Step ${step} of ${total}` : 'Step unavailable'}
          </Txt>
          <Txt variant="caption" tone="muted" style={{ marginTop: 1 }}>
            {label}
          </Txt>
          <ProgressBar
            progress={progress}
            style={{ marginTop: t.spacing.sm, backgroundColor: 'rgba(255,255,255,0.7)' }}
          />
        </View>
        {days !== null && days >= 0 ? (
          <View style={{ alignItems: 'center' }}>
            <Txt style={{ fontSize: 18, fontWeight: '800', color: t.color.brand }}>{days}</Txt>
            <Txt variant="caption" tone="muted">
              days left
            </Txt>
          </View>
        ) : null}
      </View>

      <PressableScale
        onPress={onOpenStage}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}`}
      >
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Txt variant="title3" style={{ flex: 1 }} numberOfLines={1}>
              {label}
            </Txt>
            <Badge label="In progress" tone="brand" />
          </View>

          {guide ? (
            <Txt variant="footnote" tone="soft">
              {guide.summary}
            </Txt>
          ) : null}

          {mutual ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingTop: t.spacing.sm,
                borderTopWidth: 1,
                borderTopColor: t.color.hairline,
              }}
            >
              <SignoffMark label="Brand" at={brandAt} />
              <View
                style={{ width: 1, height: 22, backgroundColor: t.color.hairline, marginHorizontal: t.spacing.md }}
              />
              <SignoffMark label="Creator" at={creatorAt} />
            </View>
          ) : null}

          {skippable ? (
            <Txt variant="caption" tone="muted">
              Both sides can agree to skip this stage.
            </Txt>
          ) : null}
        </Card>
      </PressableScale>
    </View>
  );
}
