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
 *   cancelled  neutral — closed without completing; a record, not live work
 */
export type DealState = 'completed' | 'active' | 'pending' | 'cancelled';

export interface StatusStyle {
  /** Badge variant from components/ui/badge. */
  variant: 'success' | 'brand' | 'warning' | 'neutral';
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
    variant: 'neutral',
    surface: 'border-hairline bg-surface-muted',
    chip: 'bg-surface-muted text-content-muted',
    accent: 'text-content-muted',
    label: 'Cancelled',
  },
};

/** Normalise a raw campaign_projects.status into a deal state. */
export function dealStateOf(status?: string | null): DealState {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    // 069-era terms nobody accepted. Not started work — never shown as active.
    case 'pending_acceptance':
      return 'pending';
    default:
      return 'active';
  }
}

export const styleForStatus = (status?: string | null) => DEAL_STATE_STYLE[dealStateOf(status)];

/** Solid hex per state, for SVG charts and inline styles that can't use tokens. */
export const DEAL_STATE_HEX: Record<DealState, string> = {
  completed: 'var(--ok)',
  active: 'var(--brand)',
  pending: 'var(--warn)',
  cancelled: 'var(--content-muted)',
};
