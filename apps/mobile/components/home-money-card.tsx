/**
 * Home's money card, v2: "Earned in September", one big figure, its change
 * against last month, and six months as capsule bars with this month in pink.
 *
 * It replaced a Week / Month / Year segmented control over a six-WEEK chart —
 * a figure for one window drawn above bars for another. Calendar months on
 * both halves make the headline and the pink bar the same number, which is
 * what lets the card be read in one glance.
 *
 * Honesty rule carried over from the old card: until a payment has actually
 * settled, the dashboard series is agreed deal value, and the card says
 * "agreed" rather than "earned".
 */
import { View } from 'react-native';
import { CreditCard } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { formatCompactCurrency, formatCurrency } from '@/lib/format';
import { Card, TrendBars, Txt, useCountUp, type TrendPoint } from '@/components/ui';

export function HomeMoneyCard({
  months,
  isCreator,
  settled,
  pending,
}: {
  /** Six calendar months, oldest first; the last is the current month. */
  months: TrendPoint[];
  isCreator: boolean;
  /** False until any payment has settled — the series is then agreed value. */
  settled: boolean;
  /** Money a real order exists for that nobody has paid yet. */
  pending: number;
}) {
  const t = useTheme();
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const shown = useCountUp(current?.value ?? 0, 900);
  const delta = current && previous ? current.value - previous.value : 0;
  const monthName = monthLong(current?.label);
  const prevName = monthLong(previous?.label);

  const verb = settled ? (isCreator ? 'Earned' : 'Spent') : isCreator ? 'Agreed' : 'Committed';

  return (
    <Card style={{ gap: 6, padding: 20, borderRadius: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt style={{ fontSize: 14, fontWeight: '600', color: t.color.contentMuted }}>
          {`${verb} in ${monthName}`}
        </Txt>
        <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center', backgroundColor: t.color.surface }}>
          <Txt style={{ fontSize: 12, fontWeight: '700', color: t.color.contentSoft }}>{`${months.length} months`}</Txt>
        </View>
      </View>

      <Txt
        accessibilityLabel={formatCurrency(current?.value ?? 0)}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontSize: 42, lineHeight: 48, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] }}
      >
        {formatCurrency(shown)}
      </Txt>

      {previous ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          {delta !== 0 ? (
            <View
              style={{
                height: 26,
                paddingHorizontal: 10,
                borderRadius: 13,
                justifyContent: 'center',
                backgroundColor: delta > 0 ? t.color.okSoft : t.color.surface,
              }}
            >
              <Txt style={{ fontSize: 12, fontWeight: '700', color: delta > 0 ? t.color.ok : t.color.contentSoft }}>
                {`${delta > 0 ? '▲' : '▼'} ${formatCurrency(Math.abs(delta))}`}
              </Txt>
            </View>
          ) : null}
          <Txt style={{ fontSize: 13.5, fontWeight: '500', color: t.color.contentMuted }}>
            {delta !== 0 ? `vs ${prevName}` : `Same as ${prevName}`}
          </Txt>
        </View>
      ) : null}

      <TrendBars
        data={months}
        formatValue={formatCompactCurrency}
        quiet
        emptyLabel={isCreator ? 'No deals in the last six months' : 'No spend in the last six months'}
      />

      {pending > 0 ? (
        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            backgroundColor: t.color.warnSoft,
            borderRadius: 18,
            padding: 12,
          }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.color.white }}>
            <CreditCard size={16} color={t.color.warn} />
          </View>
          <View style={{ gap: 1 }}>
            <Txt style={{ fontSize: 16, fontWeight: '800', color: t.color.warn, fontVariant: ['tabular-nums'] }}>
              {formatCurrency(pending)}
            </Txt>
            <Txt style={{ fontSize: 12, fontWeight: '600', color: t.color.contentMuted }}>
              {isCreator ? 'Awaiting payment' : 'Due to pay'}
            </Txt>
          </View>
        </View>
      ) : null}

      {!settled ? (
        <Txt style={{ marginTop: 10, fontSize: 12.5, lineHeight: 18, color: t.color.contentMuted }}>
          No payment has settled through Influnet yet, so this is agreed deal value, not money
          received.
        </Txt>
      ) : null}
    </Card>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Sep" (the series' short label) → "September". Falls back to the label itself. */
function monthLong(short?: string): string {
  if (!short) return 'this month';
  const i = MONTHS.findIndex((m) => m.slice(0, 3).toLowerCase() === short.slice(0, 3).toLowerCase());
  return i === -1 ? short : MONTHS[i];
}
