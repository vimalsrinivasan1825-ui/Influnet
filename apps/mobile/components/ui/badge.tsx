import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';
import { VerifiedMark } from './verified-mark';

type Tone = 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'verified';

export function Badge({
  label,
  tone = 'neutral',
  fg,
  bg,
  icon,
  style,
}: {
  label: string;
  tone?: Tone;
  /** Explicit colours win over `tone` — used for deal-state pills. */
  fg?: string;
  bg?: string;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();

  const tones: Record<Tone, { fg: string; bg: string }> = {
    brand: { fg: t.color.brand, bg: t.color.brandSoft },
    ok: { fg: t.color.ok, bg: t.color.okSoft },
    warn: { fg: t.color.warn, bg: t.color.warnSoft },
    danger: { fg: t.color.danger, bg: t.color.dangerSoft },
    info: { fg: t.color.info, bg: t.color.infoSoft },
    neutral: { fg: t.color.contentSoft, bg: t.color.surfaceMuted },
    // Ownership-verification trust mark — fixed brand pink, not the per-role
    // `brand` accent. See packages/tokens for why.
    verified: { fg: t.color.verified, bg: t.color.verifiedSoft },
  };

  const c = { fg: fg ?? tones[tone].fg, bg: bg ?? tones[tone].bg };

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: t.radii.pill,
          backgroundColor: c.bg,
        },
        style,
      ]}
    >
      {icon}
      <Txt variant="caption" style={{ color: c.fg }}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * The trust mark. Same meaning as the web's verified-badge — a checkmark
 * inside a scalloped seal, self-contained (fixed pink + white baked into the
 * mark itself), so no wrapping background is needed here.
 */
export function VerifiedBadge({ size = 20 }: { size?: number }) {
  return <VerifiedMark size={size} />;
}
