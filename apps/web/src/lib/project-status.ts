/**
 * One semantic colour per deal state, used everywhere a project's state is
 * shown: the projects list, the in-chat deal card, the requests page, the
 * activity feed and the admin tables.
 *
 * The mapping had drifted — the deal card painted ACTIVE projects green and
 * COMPLETED ones grey, the exact inverse of the projects list. Colour is
 * carrying meaning here, so it lives in one place rather than being retyped
 * per screen.
 *
 *   completed  green   — the work is done
 *   active     brand   — in flight, this is where attention goes
 *   pending    amber   — waiting on a decision, nothing has started
 *   cancelled  red     — closed prematurely; a record, with a deadline
 */
import { type DealState, dealStateOf } from '@influnet/core';

export { type DealState, dealStateOf };

export interface StatusStyle {
  /** Badge variant from components/ui/badge. */
  variant: 'success' | 'brand' | 'warning' | 'neutral' | 'danger';
  /** Card surface + border, for a whole card tinted by its state. */
  surface: string;
  /** Icon chip background + foreground. */
  chip: string;
  /** Foreground only, for meters and inline accents. */
  accent: string;
  label: string;
}

export const DEAL_STATE_STYLE: Record<DealState, StatusStyle> = {
  completed: {
    variant: 'success',
    surface: 'border-ok/30 bg-ok-soft',
    chip: 'bg-ok-soft text-ok',
    accent: 'text-ok',
    label: 'Completed',
  },
  active: {
    variant: 'brand',
    surface: 'border-brand/25 bg-brand-soft/40',
    chip: 'bg-brand-soft text-brand',
    accent: 'text-brand',
    label: 'Ongoing',
  },
  pending: {
    variant: 'warning',
    surface: 'border-warn/30 bg-warn-soft',
    chip: 'bg-warn-soft text-warn',
    accent: 'text-warn',
    label: 'Awaiting approval',
  },
  cancelled: {
    variant: 'danger',
    surface: 'border-danger/30 bg-danger-soft',
    chip: 'bg-danger-soft text-danger',
    accent: 'text-danger',
    label: 'Cancelled',
  },
};

export const styleForStatus = (status?: string | null) => DEAL_STATE_STYLE[dealStateOf(status)];

/** Solid hex per state, for SVG charts and inline styles that can't use tokens. */
export const DEAL_STATE_HEX: Record<DealState, string> = {
  completed: 'var(--ok)',
  active: 'var(--brand)',
  pending: 'var(--warn)',
  cancelled: 'var(--danger)',
};
