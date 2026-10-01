/**
 * Four counts above the project list.
 *
 * ── THE SAME RULE AS EVERY OTHER SUMMARY IN THIS APP ──────────────────
 *
 * It renders only when there are at least `OVERVIEW_MIN_PROJECTS` projects.
 * A four-column summary above one card reads "1 / 0 / 0 / 0": three zeros and
 * a restatement of the card underneath. See requests-overview.tsx, which makes
 * the same call for the same reason — the threshold is a property of summaries,
 * not of this screen.
 *
 * ── COLOUR MEANS STATE, NOT DECORATION ────────────────────────────────
 *
 * The four hues are the ones this app already uses for these states: brand for
 * live work, amber for something waiting on you, green for done, slate for
 * cancelled. They are NOT the role accent for three of the four, deliberately
 * — "waiting on you" has to read as different from "running fine" at a glance,
 * and it cannot if both are pink.
 *
 * The underline under each figure is what makes that legible without reading
 * the label: a coloured roundel at the top and a matching rule at the bottom
 * bracket the number, so the column is one object rather than three stacked
 * ones.
 */
import { View } from 'react-native';
import { Activity, CheckCircle2, Clock, XCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Card, Txt, useCountUp } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

/** Two projects before a summary of them is worth a third of the viewport. */
export const OVERVIEW_MIN_PROJECTS = 2;

export function ProjectsOverview({
  active,
  yourMove,
  completed,
  cancelled,
}: {
  active: number;
  yourMove: number;
  completed: number;
  cancelled: number;
}) {
  const t = useTheme();

  const columns = [
    { key: 'active', icon: Activity, color: t.color.brand, soft: t.color.brandSoft, value: active, label: 'Active' },
    { key: 'yours', icon: Clock, color: t.color.warn, soft: t.color.warnSoft, value: yourMove, label: 'Your move' },
    { key: 'done', icon: CheckCircle2, color: t.color.ok, soft: t.color.okSoft, value: completed, label: 'Completed' },
    { key: 'cancelled', icon: XCircle, color: t.color.contentMuted, soft: t.color.surface, value: cancelled, label: 'Cancelled' },
  ] as const;

  return (
    <Card style={{ paddingHorizontal: t.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {columns.map((c, i) => {
          const Icon = c.icon;
          return (
            <View key={c.key} style={{ flex: 1, flexDirection: 'row' }}>
              {/* Rules between columns, not around them — four bordered boxes
                  would be four cards inside a card. */}
              {i > 0 ? (
                <View style={{ width: 1, backgroundColor: t.color.hairline, marginVertical: 2 }} />
              ) : null}
              <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: c.soft,
                  }}
                >
                  <Icon size={16} color={c.color} />
                </View>
                <Txt
                  variant="title1"
                  style={{
                    fontSize: 22,
                    lineHeight: 27,
                    fontVariant: ['tabular-nums'],
                    // A zero in this row is a real, knowable zero — nobody has
                    // cancelled anything — so it keeps its weight and only
                    // loses its colour.
                    color: c.value > 0 ? t.color.content : t.color.contentMuted,
                  }}
                >
                  {c.value}
                </Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {c.label}
                </Txt>
                <View
                  style={{
                    width: 22,
                    height: 3,
                    borderRadius: 2,
                    marginTop: 2,
                    backgroundColor: c.value > 0 ? c.color : t.color.hairlineStrong,
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const SPLIT = ['#ff0b8d', '#ffb98f', '#b9a5ff', '#7fd8b0', '#8ec5ff'];

/**
 * v2 summary: the one dark card on Projects. Money in flight is the headline
 * (it is what a person checks this tab for), with how many projects and how
 * many are waiting on you under it, and a bar split by project so one big
 * deal and five small ones don't read the same.
 */
export function ProjectsSummaryCard({
  budgets,
  yourMove,
  completed,
  cancelled,
}: {
  /** Agreed value of each ongoing project, largest first reads best. */
  budgets: number[];
  yourMove: number;
  completed: number;
  cancelled: number;
}) {
  const t = useTheme();
  const total = budgets.reduce((a, b) => a + b, 0);
  const shown = useCountUp(total, 900);
  const parts = budgets.filter((b) => b > 0).sort((a, b) => b - a);
  const n = budgets.length;

  return (
    <View style={{ backgroundColor: '#111114', borderRadius: 28, padding: 20, gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Txt style={{ color: '#a9a9b4', fontSize: 13.5, fontWeight: '600' }}>In progress</Txt>
        <Txt style={{ color: '#fff', fontSize: 38, lineHeight: 42, fontWeight: '800', letterSpacing: -1.4, fontVariant: ['tabular-nums'] }}>
          {formatCurrency(Math.round(shown))}
        </Txt>
        <Txt style={{ color: '#a9a9b4', fontSize: 13.5 }}>
          {`across ${n} ${n === 1 ? 'project' : 'projects'}${yourMove > 0 ? ` · ${yourMove} waiting on you` : ''}`}
        </Txt>
      </View>
      {parts.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 4, height: 10 }}>
          {parts.map((b, i) => (
            <View key={i} style={{ flex: b, borderRadius: 5, backgroundColor: SPLIT[i % SPLIT.length] }} />
          ))}
        </View>
      ) : null}
      {completed + cancelled > 0 ? (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Txt style={{ color: '#a9a9b4', fontSize: 12.5 }}>
            <Txt style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>{completed}</Txt> completed
          </Txt>
          {cancelled > 0 ? (
            <Txt style={{ color: '#a9a9b4', fontSize: 12.5 }}>
              <Txt style={{ color: '#fff', fontSize: 12.5, fontWeight: '800' }}>{cancelled}</Txt> cancelled
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
