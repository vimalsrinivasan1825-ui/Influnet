/**
 * The one solid pink card on Home: the single most pressing thing that's
 * waiting on you. Two lighter cards peek out behind it — a quiet "there's more
 * in the stack" without a second badge — and its whole job is one tap into
 * the project where the step actually happens.
 *
 * Only the FIRST of the "your move" projects gets this; the rest stay as rows
 * below, so pink keeps meaning "this one, now".
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { timeAgo } from '@/lib/format';
import { SlideToConfirm, Txt } from '@/components/ui';

export function YourMoveHero({
  action,
  title,
  partner,
  stageLabel,
  stageIndex,
  stageTotal,
  more,
  onPress,
  onSignOff,
  theirSignoffAt,
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
  /**
   * Present only when the pending step IS a sign-off (a mutual sign-off stage
   * that isn't a payment gate). Resolves to an error message, or null on
   * success. The server still enforces the stage's checklist, so a refusal
   * comes back here as text rather than the slide silently doing nothing.
   */
  onSignOff?: () => Promise<string | null>;
  /** When the partner signed this stage, if they have — "Arjun signed 2h ago". */
  theirSignoffAt?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      {/* With a slider inside, the card itself is NOT a tap target — a finished
          drag must never also count as "open the project". The link below does
          that job instead. */}
      <Pressable
        onPress={onSignOff ? undefined : onPress}
        disabled={!!onSignOff}
        accessible={!onSignOff}
        accessibilityRole={onSignOff ? undefined : 'button'}
        accessibilityLabel={onSignOff ? undefined : `Your move: ${action}. ${title} with ${partner}.`}
        style={({ pressed }) => ({
          backgroundColor: t.color.brand,
          borderRadius: 28,
          padding: 20,
          gap: 14,
          transform: [{ scale: pressed && !onSignOff ? 0.985 : 1 }],
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

        {/* The design's social proof: the other side has already put their name
            to this stage, so the slider is the last thing it needs. */}
        {onSignOff && theirSignoffAt ? (
          <Txt style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13.5, fontWeight: '600' }}>
            {`${partner.split(/\s+/)[0] || partner} signed ${timeAgo(theirSignoffAt)} — your turn`}
          </Txt>
        ) : null}

        {onSignOff ? (
          <View style={{ gap: 10 }}>
            <SlideToConfirm
              tone="onBrand"
              label={`Slide to sign off ${stageLabel}`}
              busy={busy}
              onConfirm={async () => {
                setBusy(true);
                setError(null);
                const message = await onSignOff();
                setBusy(false);
                if (message) setError(message);
              }}
            />
            {error ? (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, padding: 10 }}>
                <Txt style={{ color: '#fff', fontSize: 13, lineHeight: 18 }}>{error}</Txt>
              </View>
            ) : null}
            <Pressable
              onPress={onPress}
              hitSlop={10}
              accessibilityRole="link"
              accessibilityLabel={`Open ${title}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}
            >
              <Txt style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13.5, fontWeight: '700' }}>Open project</Txt>
              <ArrowRight size={15} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>
        ) : (
          <View style={{ height: 52, borderRadius: 26, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Txt style={{ color: t.color.brand, fontSize: 15.5, fontWeight: '700' }}>Open project</Txt>
            <ArrowRight size={18} color={t.color.brand} />
          </View>
        )}
      </Pressable>
    </View>
  );
}
