/**
 * How far a live collaboration has actually got, as five nodes on a card.
 *
 * ── WHY IT IS A WINDOW AND NOT THE WHOLE FLOW ─────────────────────────
 *
 * The full flow is twelve stages. Twelve nodes do not fit 343pt at a legible
 * size, and a horizontal scroller inside a list card is a scroll gesture
 * fighting the list's own. So this shows five: the current stage, two either
 * side, clamped to the ends.
 *
 * ── AND WHY IT SAYS "STEP N OF 12" ────────────────────────────────────
 *
 * Five nodes with the current one lit reads, at a glance, as "one fifth done".
 * On a project at stage 1 of 12 that is off by a factor of two and a half — in
 * the flattering direction, which is the one that costs trust when the truth
 * arrives. The caption underneath is what stops the window from being a claim
 * about the whole.
 *
 * The design this came from listed five fixed steps ending in "Payment terms",
 * skipping `advance_payment`. That stage is a money gate that only opens on a
 * signed capture webhook (see the payment note in AGENTS.md), so leaving it out
 * would have hidden the one step a brand most needs to see coming. The labels
 * here are FULL_LABELS from @influnet/core, whatever the flow.
 *
 * ── SHORT FLOWS ───────────────────────────────────────────────────────
 *
 * `short_pay_after` and `short_pay_before` have four stages, not twelve, which
 * is why `flow_key` travels with `current_stage` from /api/collabs. Drawing a
 * fixed five-node strip for a four-stage flow would invent a stage; the window
 * is sized to the flow.
 */
import { View } from 'react-native';
import {
  Camera,
  Check,
  CreditCard,
  Eye,
  FileText,
  Handshake,
  MessageSquare,
  PenLine,
  RefreshCw,
  Scissors,
  ThumbsUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react-native';
import { flowOf, type StageFlow } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { DashedRule, Txt } from '@/components/ui';

/** How many nodes the strip shows when the flow is long enough to need a window. */
const WINDOW = 5;

/**
 * One glyph per stage, so a node is recognisable before its label is read.
 * Keyed off the stage id rather than position — the same rule PipelineStrip
 * follows, and for the same reason: position is not identity, and a flow that
 * omits a stage would otherwise shift every icon after it.
 */
const STAGE_ICON: Record<string, LucideIcon> = {
  collaboration_started: Handshake,
  project_discussion: MessageSquare,
  advance_payment: CreditCard,
  content_planning: PenLine,
  content_confirmation: FileText,
  shooting_in_progress: Camera,
  editing_in_progress: Scissors,
  sent_for_review: Eye,
  revisions: RefreshCw,
  final_approval: ThumbsUp,
  final_payment: CreditCard,
  project_completed: Trophy,
  // Short flows.
  quick_agreement: Handshake,
  quick_delivery: Camera,
  quick_payment: CreditCard,
};

/**
 * The slice of stages to draw.
 *
 * Clamped at both ends rather than always centred, so a project at stage 1
 * shows stages 1–5 (what is coming) instead of two empty slots and three
 * stages. At the far end it shows the last five, which is where a strip
 * centred on the current stage would run off the array.
 */
function windowFor(stages: readonly string[], index: number): { slice: string[]; offset: number } {
  const size = Math.min(WINDOW, stages.length);
  if (stages.length <= size) return { slice: [...stages], offset: 0 };

  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(index - half, stages.length - size));
  return { slice: stages.slice(start, start + size) as string[], offset: start };
}

export function RequestStageStrip({
  currentStage,
  flowKey,
}: {
  currentStage: string;
  /** Null on an older backend — the full flow is the right assumption there. */
  flowKey?: string | null;
}) {
  const t = useTheme();

  const flow: StageFlow = flowOf({ flow_key: flowKey });
  const index = flow.stages.indexOf(currentStage);

  // An unknown stage means this build and the database disagree about the
  // flow. Drawing a strip with nothing lit would claim the project has not
  // started; drawing nothing is the honest option.
  if (index < 0) return null;

  const { slice, offset } = windowFor(flow.stages, index);

  return (
    <View
      style={{
        marginTop: t.spacing.md,
        paddingTop: t.spacing.md,
        borderTopWidth: 1,
        borderTopColor: t.color.hairline,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {slice.map((stage, i) => {
          const absolute = offset + i;
          const done = absolute <= index;
          const Icon = STAGE_ICON[stage] ?? Check;

          return (
            <View key={stage} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              {/* The connector runs behind the dots at their vertical centre.
                  Absolute rather than a flex sibling so a label wrapping to two
                  lines cannot drag the line down with it. */}
              {i < slice.length - 1 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 16,
                    left: '50%',
                    right: '-50%',
                    marginLeft: 21,
                    marginRight: -21,
                  }}
                >
                  <DashedRule color={done ? t.color.brandRing : t.color.hairlineStrong} />
                </View>
              ) : null}

              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? t.color.brand : t.color.surfaceCard,
                  borderWidth: 1.5,
                  borderColor: done ? t.color.brand : t.color.hairlineStrong,
                }}
              >
                <Icon size={16} color={done ? t.color.white : t.color.contentMuted} />
              </View>

              <Txt
                variant="caption"
                numberOfLines={2}
                style={{
                  fontSize: 10,
                  lineHeight: 13,
                  textAlign: 'center',
                  color: done ? t.color.brand : t.color.contentMuted,
                  fontWeight: done ? '700' : '400',
                }}
              >
                {flow.labels[stage] ?? stage}
              </Txt>
            </View>
          );
        })}
      </View>

      {/* The honest denominator. See the note at the top. */}
      <Txt variant="caption" tone="muted" style={{ marginTop: t.spacing.md }}>
        Step {index + 1} of {flow.stages.length} · {flow.labels[currentStage] ?? currentStage}
      </Txt>
    </View>
  );
}
