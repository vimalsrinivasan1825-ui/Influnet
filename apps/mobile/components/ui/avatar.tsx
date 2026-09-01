import { View } from 'react-native';
import { Image } from 'expo-image';
import { pickBySeed } from '@/lib/seed';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

/** Deterministic initials so a missing photo still reads as a person. */
function initialsOf(name?: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * One colour per person, derived rather than stored.
 *
 * Every avatar used to be `brandSoft` with `brand` initials, which meant a
 * column of six people was six identical pink circles — the initials were
 * doing all the work, and two letters at 16pt is not something you recognise
 * peripherally. A person you have messaged before should be findable in a list
 * by colour before you read anything.
 *
 * Derived from the user id (falling back to the name) so it needs no column,
 * no migration and no backfill, and so the same person is the same colour on
 * every screen and in every list. Deliberately OFF the role accent: `brand`
 * recolours per signed-in role, and an identity that changes depending on who
 * is looking is not an identity.
 *
 * Each pair is a soft ground with ink dark enough to clear 4.5:1 on it — these
 * carry initials, so they have to be read, not just seen.
 */
const AVATAR_COLORS: readonly (readonly [string, string])[] = [
  ['#FFE4EC', '#C2185B'], // rose
  ['#E8E4FF', '#5B34C7'], // violet
  ['#DCEEFF', '#1D4ED8'], // blue
  ['#D6F5EA', '#0F766E'], // teal
  ['#FFF0D6', '#B45309'], // amber
  ['#F0E2FF', '#7E22CE'], // purple
  ['#FFE3D6', '#C2410C'], // clay
  ['#E2F0D9', '#3F6212'], // olive
] as const;

export function Avatar({
  uri,
  name,
  size = 44,
  seed,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  /**
   * What the colour is derived from — a user id. Falls back to the name, which
   * is stable enough to be useful and unstable enough to be worth avoiding:
   * two people called "Priya" would share a colour, and a rename would change
   * one. Pass the id wherever there is one.
   */
  seed?: string | null;
}) {
  const t = useTheme();
  const [bg, fg] = pickBySeed(AVATAR_COLORS, seed || name || '?');

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
          accessibilityLabel={name ? `${name}'s photo` : undefined}
        />
      ) : (
        <Txt
          style={{
            color: fg,
            fontSize: size * 0.36,
            fontWeight: '700',
          }}
        >
          {initialsOf(name)}
        </Txt>
      )}
    </View>
  );
}
