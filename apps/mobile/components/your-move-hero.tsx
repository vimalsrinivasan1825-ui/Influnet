/**
 * The one solid pink card on Home: the single most pressing thing that's
 * waiting on you. Two lighter cards peek out behind it — a quiet "there's more
 * in the stack" without a second badge — and its whole job is one tap into
 * the project where the step actually happens.
 *
 * Only the FIRST of the "your move" projects gets this; the rest stay as rows
 * below, so pink keeps meaning "this one, now".
 */
import { Pressable, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

export function YourMoveHero({
  action,
  title,
  partner,
  stageLabel,
  stageIndex,
  stageTotal,
  more,
  onPress,
}: {
  action: string;
  title: string;
  partner: string;
  stageLabel: string;
  stageIndex: number;
  stageTotal: number;
  /** How many other projects are also waiting on you. */
  more: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const initials = partner
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '•';

  return (
    <View style={{ paddingTop: more > 0 ? 18 : 0 }}>
      {more > 0 ? (
        <>
          <View style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 60, borderRadius: 28, backgroundColor: '#f8b5d6' }} />
          <View style={{ position: 'absolute', top: 8, left: 12, right: 12, height: 60, borderRadius: 28, backgroundColor: '#f06aae' }} />
        </>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Your move: ${action}. ${title} with ${partner}.`}
        style={({ pressed }) => ({
          backgroundColor: t.color.brand,
          borderRadius: 28,
          padding: 20,
          gap: 14,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          shadowColor: t.color.brand,
          shadowOpacity: 0.28,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
          elevation: 8,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center' }}>
            <Txt style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{`${stageLabel} · ${stageIndex + 1} of ${stageTotal}`}</Txt>
          </View>
          {more > 0 ? (
            <Txt style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' }}>{`+${more} more`}</Txt>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center' }}>
            <Txt style={{ color: t.color.brand, fontSize: 13, fontWeight: '800' }}>{initials}</Txt>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Txt numberOfLines={1} style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{partner}</Txt>
            <Txt numberOfLines={1} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>{title}</Txt>
          </View>
        </View>

        <Txt style={{ color: '#fff', fontSize: 27, lineHeight: 31, fontWeight: '800', letterSpacing: -0.9 }}>{action}</Txt>

        <View style={{ height: 52, borderRadius: 26, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Txt style={{ color: t.color.brand, fontSize: 15.5, fontWeight: '700' }}>Open project</Txt>
          <ArrowRight size={18} color={t.color.brand} />
        </View>
      </Pressable>
    </View>
  );
}
