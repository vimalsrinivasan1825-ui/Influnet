/**
 * One collaboration request, as a card.
 *
 * This replaces two different presentations of the same object. A request
 * awaiting a reply used to be a full card with a budget panel and a "Review
 * offer" button; a live one was a bare `ListRow` in a grouped list. Same row
 * from the same endpoint, drawn two ways, so scanning the screen meant
 * re-learning the layout halfway down it.
 *
 * One card now, with the parts that only apply sometimes appearing only then:
 *
 *  - the stage strip, when there is a live project behind the request. A
 *    request nobody has answered has no stage, and an empty strip on it would
 *    imply the work had started.
 *  - the "not yet verified" flag, creator-side only. It is the one piece of
 *    information here that protects someone, so it is a marked row inside the
 *    card rather than a badge that competes with the status pill.
 *  - the review button, only where there is a decision to make. A card with a
 *    call to action that only navigates is a card teaching you to ignore its
 *    buttons.
 */
import { View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { formatCurrency } from '@/lib/format';
import { Avatar, Badge, Card, PressableScale, Txt } from '@/components/ui';
import { RequestStageStrip } from '@/components/request-stage-strip';

export interface RequestCardData {
  id: string;
  budget: number | null;
  created_at: string;
  partnerName: string | null;
  /** The deal's own state, already resolved from `deal_state ?? status`. */
  state: string;
  stateLabel: string;
  stateTone: 'ok' | 'warn' | 'brand' | 'neutral' | 'danger';
  project: { title: string; current_stage?: string | null; flow_key?: string | null } | null;
  /** Creator-side only: the sending business has not been approved by us. */
  unverifiedSender?: boolean;
}

/**
 * "Sent on 18 Aug" — an absolute date, not "3 days ago".
 *
 * A request is a thing you sent on a day, and the question it raises is "how
 * long have they had this?" A relative age answers that and loses the fact;
 * the date answers it too, and is still true tomorrow. The year is added only
 * once it stops being this one.
 */
function sentOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function RequestCard({
  data,
  isCreator,
  onPress,
}: {
  data: RequestCardData;
  isCreator: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const meta = [data.budget ? formatCurrency(data.budget) : null, `${isCreator ? 'Received' : 'Sent'} on ${sentOn(data.created_at)}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${data.partnerName ?? 'Someone'}. ${data.stateLabel}. ${meta}`}
    >
      <Card>
        <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-start' }}>
          {/* Initials. The two profile embeds on /api/collabs select name and
              role only — there is no avatar URL in this payload, and a broken
              image well is worse than a letter. */}
          <Avatar name={data.partnerName ?? undefined} size={48} />

          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <Txt variant="title3" numberOfLines={1} style={{ flexShrink: 1 }}>
                {data.partnerName || 'Someone'}
              </Txt>
              <Badge label={data.stateLabel} tone={data.stateTone} />
            </View>

            {data.project?.title ? (
              <Txt variant="callout" numberOfLines={1}>
                {data.project.title}
              </Txt>
            ) : null}

            {meta ? (
              <Txt variant="caption" tone="muted" numberOfLines={1}>
                {meta}
              </Txt>
            ) : null}
          </View>
        </View>

        {/* Only for a request that became live work. */}
        {data.project?.current_stage ? (
          <RequestStageStrip
            currentStage={data.project.current_stage}
            flowKey={data.project.flow_key}
          />
        ) : null}

        {data.unverifiedSender ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              marginTop: t.spacing.md,
              backgroundColor: t.color.warnSoft,
              borderRadius: t.radii.md,
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.sm,
            }}
          >
            <ShieldAlert size={15} color={t.color.warn} />
            <Txt variant="caption" style={{ color: t.color.warn, flex: 1 }}>
              Influnet hasn't verified this business yet.
            </Txt>
          </View>
        ) : null}
      </Card>
    </PressableScale>
  );
}
