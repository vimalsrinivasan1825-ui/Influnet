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
import { useState } from 'react';
import { View } from 'react-native';
import { Check, ChevronRight, Clock, Sparkles } from 'lucide-react-native';
import {
  STAGE_GUIDE,
  isMutualSignoffStage,
  isSkippableStage,
  projectTurn,
  stageSignoffAt,
  type Side,
  type StageFlow,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { timeAgo } from '@/lib/format';
import { PressableScale, SlideToConfirm, Txt } from '@/components/ui';

/** One side's mark on the handshake row: a tick and a time, or a wait. */
function daysUntil(due?: string | null): number | null {
  if (!due) return null;
  const ms = new Date(due).getTime();
  if (Number.isNaN(ms)) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(ms).setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000);
}

function Signer({ who, at, mine }: { who: string; at?: string | null; mine: boolean }) {
  const t = useTheme();
  const signed = !!at;
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.color.surfaceCard, borderRadius: 16, padding: 10 }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: signed ? t.color.ok : t.color.surface,
        }}
      >
        {signed ? <Check size={15} color={t.color.white} strokeWidth={3} /> : <Clock size={14} color={t.color.contentMuted} />}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '700' }}>{who}</Txt>
        <Txt
          numberOfLines={1}
          style={{ fontSize: 12, fontWeight: '700', color: signed ? t.color.ok : mine ? t.color.brand : t.color.contentMuted }}
        >
          {signed ? `Signed · ${timeAgo(at)}` : mine ? 'Your turn' : 'Waiting'}
        </Txt>
      </View>
    </View>
  );
}

const PAYMENT_STAGES = ['advance_payment', 'final_payment', 'quick_payment'];

export function CurrentStageCard({
  currentStage,
  stageProgress,
  flow,
  dueDate,
  side,
  partner,
  onOpenStage,
  onSignOff,
}: {
  currentStage: string;
  stageProgress: Record<string, any> | null | undefined;
  flow: StageFlow;
  dueDate?: string | null;
  side: Side;
  partner: string;
  onOpenStage: () => void;
  /**
   * Sign off the current stage in place. Only offered on a mutual sign-off
   * stage that isn't a payment gate, when it's your turn and you haven't
   * signed. Resolves to an error message, or null on success.
   */
  onSignOff?: () => Promise<string | null>;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = flow.stages.indexOf(currentStage);
  const known = index >= 0;
  const total = flow.stages.length;
  const label = known ? flow.labels[currentStage] ?? currentStage : currentStage;
  const guide = STAGE_GUIDE[currentStage];
  const mutual = known && isMutualSignoffStage(currentStage, flow);
  const skippable = known && isSkippableStage(currentStage, flow);
  const days = daysUntil(dueDate);

  const brandAt = stageSignoffAt(stageProgress, currentStage, 'business');
  const creatorAt = stageSignoffAt(stageProgress, currentStage, 'creator');
  const mineAt = side === 'business' ? brandAt : creatorAt;

  const turn = projectTurn({ stage: currentStage, side, stageProgress, flow });
  const canSlide = !!onSignOff && mutual && !mineAt && turn.turn === 'you' && !PAYMENT_STAGES.includes(currentStage);

  return (
    <View style={{ gap: t.spacing.md }}>
      {/* Where in the deal: one capsule per stage — done ink, now pink. */}
      {known ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt variant="bodyStrong" style={{ fontSize: 14.5, fontWeight: '700' }}>{`Stage ${index + 1} of ${total}`}</Txt>
            <Txt variant="footnote" tone="muted">
              {days !== null && days >= 0 ? `${days} ${days === 1 ? 'day' : 'days'} left · ` : ''}
              {`${total - index - 1} to go`}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {flow.stages.map((s, i) => (
              <View
                key={s}
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i < index ? t.color.content : i === index ? t.color.brand : t.color.hairlineStrong,
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ backgroundColor: t.color.brandSoft, borderRadius: 28, padding: 18, gap: 14 }}>
        <PressableScale onPress={onOpenStage} accessibilityRole="button" accessibilityLabel={`Open ${label}`}>
          <View style={{ gap: 4 }}>
            <Txt style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.4, color: t.color.brand }}>
              {mutual ? 'NOW · BOTH OF YOU SIGN OFF' : 'NOW'}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt style={{ flex: 1, fontSize: 22, lineHeight: 27, fontWeight: '800', letterSpacing: -0.6 }} numberOfLines={2}>
                {label}
              </Txt>
              <ChevronRight size={20} color={t.color.brand} />
            </View>
            {guide ? (
              <Txt variant="footnote" tone="soft" style={{ marginTop: 2 }}>
                {guide.summary}
              </Txt>
            ) : null}
          </View>
        </PressableScale>

        {mutual ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Signer who={side === 'business' ? 'You' : partner} at={brandAt} mine={side === 'business'} />
            <Signer who={side === 'creator' ? 'You' : partner} at={creatorAt} mine={side === 'creator'} />
          </View>
        ) : null}

        {canSlide ? (
          <View style={{ gap: 8 }}>
            <SlideToConfirm
              tone="ink"
              label={`Slide to sign off ${label}`}
              busy={busy}
              onConfirm={async () => {
                setBusy(true);
                setError(null);
                const message = await onSignOff!();
                setBusy(false);
                if (message) setError(message);
              }}
            />
            {error ? (
              <Txt variant="footnote" tone="danger">
                {error}
              </Txt>
            ) : null}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.color.surfaceCard, borderRadius: 16, padding: 12 }}>
            {turn.turn === 'you' ? (
              <Sparkles size={18} color={t.color.brand} strokeWidth={1.8} />
            ) : (
              <Clock size={18} color={t.color.brand} strokeWidth={1.8} />
            )}
            <View style={{ flex: 1, gap: 1 }}>
              <Txt style={{ fontSize: 14, fontWeight: '700' }}>
                {turn.turn === 'you' ? 'Your move' : turn.turn === 'none' ? 'All done' : `Waiting on ${partner}`}
              </Txt>
              <Txt variant="caption" tone="muted">{turn.action}</Txt>
            </View>
          </View>
        )}

        {skippable ? (
          <Txt variant="caption" tone="muted">
            Both sides can agree to skip this stage.
          </Txt>
        ) : null}
      </View>
    </View>
  );
}
