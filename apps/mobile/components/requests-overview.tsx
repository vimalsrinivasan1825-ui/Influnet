/**
 * The four-figure summary above the request list, and the tip beneath it.
 *
 * ── WHEN THIS APPEARS, AND WHY THAT IS A RULE ─────────────────────────
 *
 * Neither of these renders below a threshold, and the thresholds are the point
 * rather than a detail:
 *
 *  - The overview needs at least TWO requests. A four-column summary above a
 *    single card reads "1 / 1 / 0 / 0" — three zeros and a restatement of the
 *    one thing already on screen. It costs a third of the viewport to say less
 *    than the card under it.
 *  - The filter rail needs at least TWO non-empty groups. Filtering when
 *    everything is pending gives you a tab that is the whole list and three
 *    that are empty; that is not a control, it is furniture.
 *
 * This is the same principle as the counter tiles on Home: a figure with
 * nothing behind it is not a smaller version of a figure, it is noise, and the
 * screen is better without it. The difference here is that the whole component
 * disappears rather than one tile, because a summary is only a summary once
 * there is something to summarise.
 */
import { View } from 'react-native';
import { CheckCircle2, Clock, Lightbulb, RefreshCw, Send, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Card, Txt } from '@/components/ui';
import { PressableScale } from '@/components/ui/motion';

/** Two requests before a summary of them is worth the space. */
export const OVERVIEW_MIN_ROWS = 2;

export function RequestsOverview({
  total,
  pending,
  active,
  closed,
  isCreator,
}: {
  total: number;
  pending: number;
  active: number;
  closed: number;
  isCreator: boolean;
}) {
  const t = useTheme();

  const stats = [
    {
      key: 'total',
      icon: <Send size={17} color={t.color.brand} />,
      value: total,
      label: isCreator ? 'Received' : 'Total sent',
    },
    { key: 'pending', icon: <Clock size={17} color={t.color.brand} />, value: pending, label: 'Pending' },
    { key: 'active', icon: <RefreshCw size={17} color={t.color.brand} />, value: active, label: 'In progress' },
    {
      key: 'closed',
      icon: <CheckCircle2 size={17} color={t.color.brand} />,
      value: closed,
      label: 'Completed',
    },
  ];

  return (
    <Card style={{ gap: t.spacing.lg }}>
      <Txt variant="bodyStrong">Requests overview</Txt>

      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {stats.map((s, i) => (
          <View key={s.key} style={{ flex: 1, flexDirection: 'row' }}>
            {/* Hairline rules between columns, not around them. Four bordered
                boxes would be four cards inside a card. */}
            {i > 0 ? (
              <View style={{ width: 1, backgroundColor: t.color.hairline, marginVertical: 2 }} />
            ) : null}
            <View style={{ flex: 1, alignItems: 'center', gap: 5 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: t.radii.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.color.brandSoft,
                }}
              >
                {s.icon}
              </View>
              <Txt
                variant="title1"
                style={{ fontSize: 24, lineHeight: 29, fontVariant: ['tabular-nums'] }}
              >
                {s.value}
              </Txt>
              <Txt variant="caption" tone="muted" numberOfLines={1}>
                {s.label}
              </Txt>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * The one-time explainer under the overview.
 *
 * Dismissible and dismissed forever, per account — it explains what the screen
 * is, and that is only news once. Persistence is the caller's job (see
 * requests.tsx) for the same reason as the verification nudge: AsyncStorage,
 * not a column, so no migration has to land before the screen works.
 */
export function RequestsTip({
  isCreator,
  onDismiss,
}: {
  isCreator: boolean;
  onDismiss: () => void;
}) {
  const t = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.spacing.md,
        backgroundColor: t.color.brandSoft,
        borderRadius: t.radii.lg,
        padding: t.spacing.lg,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: t.radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.color.surfaceCard,
        }}
      >
        <Lightbulb size={17} color={t.color.brand} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
          {isCreator ? 'Every request that comes in' : 'Track and manage your requests'}
        </Txt>
        <Txt variant="footnote" tone="soft">
          {isCreator
            ? "You'll be notified the moment a brand asks."
            : "We'll notify you when creators respond."}
        </Txt>
      </View>

      <PressableScale
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={10}
      >
        <X size={18} color={t.color.contentMuted} />
      </PressableScale>
    </View>
  );
}
