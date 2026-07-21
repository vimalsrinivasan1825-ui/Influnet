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

export interface Theme {
  color: typeof palette & BrandAccent;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  shadows: typeof shadows;
}

function buildTheme(accent: BrandAccent): Theme {
  return {
    color: { ...palette, ...accent },
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

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
