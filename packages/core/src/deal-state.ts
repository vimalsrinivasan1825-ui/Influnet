/**
 * The semantic half of the old apps/web/src/lib/project-status.ts.
 *
 * A project's state carries meaning ("is this live, waiting, done, or dead?")
 * and that meaning is identical on every client. The *paint* for that meaning
 * is not: the web says `bg-ok-soft`, the mobile app hands a hex to a RN style.
 * So the state machine lives here and each platform keeps its own palette map
 * keyed off DealState — see apps/web/src/lib/project-status.ts and
 * apps/mobile/lib/deal-state-style.ts.
 */
export type DealState = 'completed' | 'active' | 'pending' | 'cancelled';

export const DEAL_STATE_LABEL: Record<DealState, string> = {
  completed: 'Completed',
  active: 'Ongoing',
  pending: 'Awaiting approval',
  cancelled: 'Cancelled',
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
