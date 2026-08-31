/**
 * Shared runtime context for the mobile guide player and its mock-screen
 * primitives. Split into its own file so `screens/*` and `guide-player` can
 * both import it without a cycle.
 */

import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export interface GuideRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GuideRuntime {
  /** ms into the loop. */
  t: SharedValue<number>;
  /** 0 until measurement has settled. */
  ready: SharedValue<number>;
  /** id of the target to visually flag right now, or ''. */
  flagKey: SharedValue<string>;
  /** A target reports its measured window rect here. */
  register: (id: string, rect: GuideRect | null) => void;
  /** target id → typed-text fade window. */
  typed: Record<string, { start: number; end: number; text: string }>;
}

export const GuideRuntimeCtx = createContext<GuideRuntime | null>(null);

export function useGuideRuntime(): GuideRuntime {
  const r = useContext(GuideRuntimeCtx);
  if (!r) throw new Error('guide primitives must render inside <GuidePlayer>');
  return r;
}
