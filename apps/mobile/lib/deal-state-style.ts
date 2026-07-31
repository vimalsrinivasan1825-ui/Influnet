/**
 * The mobile paint for a DealState. Mirrors the Tailwind map in
 * apps/web/src/lib/project-status.ts — same four states, same meanings, RN
 * colours instead of class names.
 */
import { palette } from '@influnet/tokens';
import { DEAL_STATE_LABEL, dealStateOf, type DealState } from '@influnet/core';

export interface DealStateStyle {
  fg: string;
  bg: string;
  label: string;
}

export const DEAL_STATE_STYLE: Record<DealState, DealStateStyle> = {
  completed: { fg: palette.ok, bg: palette.okSoft, label: DEAL_STATE_LABEL.completed },
  // `active` is the only state that takes the role accent — it's where
  // attention goes, so it should read as "brand", not as a status colour.
  active: { fg: '', bg: '', label: DEAL_STATE_LABEL.active },
  pending: { fg: palette.warn, bg: palette.warnSoft, label: DEAL_STATE_LABEL.pending },
  cancelled: {
    fg: palette.danger,
    bg: palette.dangerSoft,
    label: DEAL_STATE_LABEL.cancelled,
  },
};

/** Resolve a status string to its colours; `accent` fills in the active state. */
export function styleForStatus(
  status: string | null | undefined,
  accent: { brand: string; brandSoft: string }
): DealStateStyle {
  const state = dealStateOf(status);
  if (state === 'active') {
    return { fg: accent.brand, bg: accent.brandSoft, label: DEAL_STATE_LABEL.active };
  }
  return DEAL_STATE_STYLE[state];
}
