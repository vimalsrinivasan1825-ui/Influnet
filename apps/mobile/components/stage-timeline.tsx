/**
 * The stage timeline — the app's signature screen.
 *
 * The web runs projects on a 12-column Kanban board you drag cards across.
 * That is a desktop gesture and it hides the thing that actually matters here:
 * a project moves when BOTH sides sign off, and it stalls when one of them
 * hasn't. So mobile drops the board and draws the deal as a vertical rail with
 * the two parties on opposite sides of it — brand left, creator right. You can
 * see the handshake, and you can see which hand is missing.
 *
 * Structure carries the meaning: the rail is continuous because the stages are
 * genuinely sequential (ALLOWED_TRANSITIONS in @influnet/core), and the
 * markers sit on a side because sign-off genuinely belongs to a party.
 */
import { Pressable, View } from 'react-native';
import { Check, ChevronRight, Clock, SkipForward } from 'lucide-react-native';
import {
  STAGES,
  STAGE_GUIDE,
  isSkippableStage,
  type Stage,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { humanizeStage, timeAgo } from '@/lib/format';
import { Badge, Txt } from '@/components/ui';

export type StageState = 'done' | 'current' | 'upcoming' | 'skipped';

export interface StageProgressEntry {
  completed?: boolean;
  skipped?: boolean;
  owner_signoff_at?: string | null;
  creator_signoff_at?: string | null;
  completed_at?: string | null;
}

/** One party's marker on the rail. */
function SignoffMark({
  label,
  at,
  side,
  active,
}: {
  label: string;
  at?: string | null;
  side: 'left' | 'right';
  active: boolean;
}) {
  const t = useTheme();
  const signed = !!at;

  return (
    <View
      style={{
        flex: 1,
        alignItems: side === 'left' ? 'flex-end' : 'flex-start',
        gap: 3,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {side === 'right' ? (
          signed ? (
            <Check size={13} color={t.color.ok} />
          ) : (
            <Clock size={13} color={active ? t.color.warn : t.color.contentMuted} />
          )
        ) : null}
        <Txt
          variant="caption"
          style={{
            color: signed ? t.color.ok : active ? t.color.warn : t.color.contentMuted,
          }}
        >
          {label}
        </Txt>
        {side === 'left' ? (
          signed ? (
            <Check size={13} color={t.color.ok} />
          ) : (
            <Clock size={13} color={active ? t.color.warn : t.color.contentMuted} />
          )
        ) : null}
      </View>
      {signed ? (
        <Txt variant="caption" tone="muted" style={{ fontSize: 11 }}>
          {timeAgo(at)}
        </Txt>
      ) : null}
    </View>
  );
}

export function StageTimeline({
  currentStage,
  stageProgress,
  onOpenStage,
}: {
  currentStage: string;
  stageProgress: Record<string, StageProgressEntry> | null | undefined;
  onOpenStage: (stage: Stage) => void;
}) {
  const t = useTheme();
  const currentIndex = STAGES.indexOf(currentStage as Stage);

  return (
    <View>
      {STAGES.map((stage, index) => {
        const entry = stageProgress?.[stage];
        const state: StageState = entry?.skipped
          ? 'skipped'
          : index < currentIndex || entry?.completed
            ? 'done'
            : index === currentIndex
              ? 'current'
              : 'upcoming';

        const isLast = index === STAGES.length - 1;
        const guide = STAGE_GUIDE[stage];

        const dotColor =
          state === 'done'
            ? t.color.ok
            : state === 'current'
              ? t.color.brand
              : state === 'skipped'
                ? t.color.contentMuted
                : t.color.hairlineStrong;

        return (
          <Pressable
            key={stage}
            onPress={() => onOpenStage(stage)}
            accessibilityRole="button"
            accessibilityLabel={`${humanizeStage(stage)}, ${state}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              opacity: pressed ? 0.85 : state === 'upcoming' ? 0.55 : 1,
            })}
          >
            {/* The rail itself */}
            <View style={{ width: 30, alignItems: 'center' }}>
              <View
                style={{
                  width: state === 'current' ? 16 : 12,
                  height: state === 'current' ? 16 : 12,
                  borderRadius: 8,
                  backgroundColor: state === 'upcoming' ? t.color.surfaceCard : dotColor,
                  borderWidth: state === 'upcoming' ? 2 : 0,
                  borderColor: t.color.hairlineStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 4,
                }}
              >
                {state === 'done' ? <Check size={8} color={t.color.white} strokeWidth={4} /> : null}
                {state === 'skipped' ? (
                  <SkipForward size={7} color={t.color.white} strokeWidth={3} />
                ) : null}
              </View>

              {!isLast ? (
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    minHeight: state === 'current' ? 20 : 14,
                    backgroundColor: index < currentIndex ? t.color.ok : t.color.hairline,
                    marginTop: 3,
                  }}
                />
              ) : null}
            </View>

            {/* The stage body */}
            <View
              style={{
                flex: 1,
                paddingBottom: t.spacing.lg,
                paddingLeft: t.spacing.sm,
                gap: state === 'current' ? t.spacing.sm : 2,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Txt
                  variant={state === 'current' ? 'title3' : 'callout'}
                  tone={state === 'current' ? 'default' : state === 'done' ? 'soft' : 'muted'}
                  style={{ flex: 1 }}
                  numberOfLines={1}
                >
                  {humanizeStage(stage)}
                </Txt>

                {state === 'skipped' ? <Badge label="Skipped" tone="neutral" /> : null}
                {state === 'done' && entry?.completed_at ? (
                  <Txt variant="caption" tone="muted">
                    {timeAgo(entry.completed_at)}
                  </Txt>
                ) : null}
                {state === 'current' ? (
                  <ChevronRight size={17} color={t.color.contentMuted} />
                ) : null}
              </View>

              {/* Only the live stage expands. Everything else stays a line. */}
              {state === 'current' ? (
                <View
                  style={{
                    backgroundColor: t.color.surfaceCard,
                    borderWidth: 1,
                    borderColor: t.color.brand + '35',
                    borderRadius: t.radii.md,
                    padding: t.spacing.md,
                    gap: t.spacing.md,
                  }}
                >
                  <Txt variant="footnote" tone="soft">
                    {guide.summary}
                  </Txt>

                  {/* The handshake: brand on the left of the divider, creator
                      on the right. Both green means this stage is ready. */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingTop: t.spacing.sm,
                      borderTopWidth: 1,
                      borderTopColor: t.color.hairline,
                    }}
                  >
                    <SignoffMark
                      label="Brand"
                      at={entry?.owner_signoff_at}
                      side="left"
                      active
                    />
                    <View
                      style={{
                        width: 1,
                        height: 22,
                        backgroundColor: t.color.hairline,
                        marginHorizontal: t.spacing.md,
                      }}
                    />
                    <SignoffMark
                      label="Creator"
                      at={entry?.creator_signoff_at}
                      side="right"
                      active
                    />
                  </View>

                  {isSkippableStage(stage) ? (
                    <Txt variant="caption" tone="muted">
                      Both sides can agree to skip this stage.
                    </Txt>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
