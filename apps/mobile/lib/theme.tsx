/**
 * Theme access for the whole app.
 *
 * The web dashboard re-tints itself per role by swapping CSS custom properties
 * on a wrapper class (.theme-creator etc). React Native has no cascade, so the
 * equivalent is a context: the shell picks an accent from the signed-in role
 * and every primitive reads `useTheme()` instead of hard-coding a brand colour.
 *
 * Styling is plain StyleSheet rather than NativeWind. Role accents have to
 * change at runtime, which is exactly the case where utility classes fight you
 * — and it keeps the bundle free of a Babel/Metro transform that has to track
 * every RN release.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  accentForRole,
  accents,
  palette,
  radii,
  shadows,
  spacing,
  typography,
  type BrandAccent,
} from '@influnet/tokens';

/** Widened from the `as const` literals so a dark palette can satisfy it. */
export type Palette = { [K in keyof typeof palette]: string };

export interface Theme {
  color: Palette & BrandAccent;
  scheme: 'light' | 'dark';
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  shadows: typeof shadows;
}

/**
 * Dark ground for the screens that follow the phone's appearance — the intro,
 * the creator/business choice and log in (SchemeThemeProvider). The rest of
 * the app is designed light-only and stays on `palette`.
 *
 * Note `white` stays white: it means "text on a filled pink/ink surface",
 * which is white in both schemes.
 */
const darkPalette: Palette = {
  ...palette,
  surface: '#111114',
  surfaceCard: '#1c1c21',
  surfaceMuted: '#232329',
  hairline: 'rgba(255,255,255,0.08)',
  hairlineStrong: 'rgba(255,255,255,0.16)',
  content: '#f4f4f6',
  contentSoft: '#c9c9d1',
  contentMuted: '#9a9aa4',
  okSoft: 'rgba(52,199,123,0.14)',
  dangerSoft: 'rgba(220,38,38,0.16)',
  warnSoft: 'rgba(245,181,68,0.14)',
};

function buildTheme(accent: BrandAccent, scheme: 'light' | 'dark' = 'light'): Theme {
  return {
    color: { ...(scheme === 'dark' ? darkPalette : palette), ...accent },
    scheme,
    spacing,
    radii,
    typography,
    shadows,
  };
}

export const defaultTheme = buildTheme(accents.brand);

const ThemeContext = createContext<Theme>(defaultTheme);

export function ThemeProvider({ role, children }: { role?: string | null; children: ReactNode }) {
  const theme = useMemo(() => buildTheme(accentForRole(role)), [role]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * Re-themes its subtree to the phone's light/dark setting. Only wraps the
 * signed-out entry screens.
 *
 * Until a native build ships with app.json `userInterfaceStyle: "automatic"`,
 * iOS/Android report 'light' to a binary built with "light", so this is a
 * no-op on today's installs and switches on by itself after the next build.
 */
export function SchemeThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const parent = useContext(ThemeContext);
  const theme = useMemo(
    () => buildTheme(
      {
        brand: parent.color.brand,
        brand2: parent.color.brand2,
        brandStrong: parent.color.brandStrong,
        brandSoft: scheme === 'dark' ? 'rgba(217,11,124,0.18)' : parent.color.brandSoft,
        brandRing: parent.color.brandRing,
      },
      scheme,
    ),
    [scheme, parent],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
