/**
 * The masthead every signed-out screen opens with.
 *
 * Auth screens were a title and two inputs on grey — indistinguishable from any
 * other app's sign-in. Leading with the mark means the first thing a new user
 * sees is whose product this is, and repeating the exact same block across
 * welcome / sign-in / sign-up makes the flow feel like one place rather than
 * three forms.
 */
import { View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';
import { Logo } from './logo';

export function AuthHeader({
  title,
  subtitle,
  compact,
}: {
  title: string;
  subtitle?: string;
  /** Smaller mark, for screens whose content needs the vertical room. */
  compact?: boolean;
}) {
  const t = useTheme();
  const badge = compact ? 64 : 80;

  return (
    <View
      style={{
        alignItems: 'center',
        gap: t.spacing.lg,
        // Sits the block off the very top of the screen. Pinned tight under the
        // nav bar it read as a page header; dropped down it reads as the
        // centrepiece the screen is built around.
        paddingTop: compact ? t.spacing['3xl'] : 0,
      }}
    >
      {/* Rounded-square badge echoes the app icon, so the mark reads as the
          product's identity rather than as a decorative illustration. */}
      <View
        style={{
          width: badge,
          height: badge,
          borderRadius: badge * 0.28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.color.surfaceCard,
          borderWidth: 1,
          borderColor: t.color.hairline,
          ...t.shadows.raised,
        }}
      >
        <Logo size={badge * 0.66} />
      </View>

      <View style={{ gap: 6, alignItems: 'center' }}>
        <Txt variant={compact ? 'title2' : 'title1'} center style={{ letterSpacing: -0.4 }}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="callout" tone="muted" center style={{ maxWidth: 300 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}
