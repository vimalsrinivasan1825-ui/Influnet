/**
 * Why a project is being cancelled — the requester's choice, shown to the
 * other side before they decide whether to agree.
 *
 * Shared so the web modal, the mobile screen, and the API route's validation
 * (apps/web/src/app/api/projects/[id]/route.ts) all recognise the same set —
 * a category the route doesn't know about would otherwise reject silently.
 */
export const CANCELLATION_REASONS = [
  { value: 'scope_not_needed', label: 'Scope no longer needed' },
  { value: 'unresponsive_partner', label: 'Unresponsive partner' },
  { value: 'budget_changed', label: 'Budget changed' },
  { value: 'quality_dispute', label: 'Quality or delivery dispute' },
  { value: 'personal_conflict', label: 'Personal or schedule conflict' },
  { value: 'other', label: 'Other' },
] as const;

export type CancellationReasonCategory = typeof CANCELLATION_REASONS[number]['value'];

export function cancellationReasonLabel(value: string | null | undefined): string {
  return CANCELLATION_REASONS.find((r) => r.value === value)?.label ?? 'No reason given';
}

/** 'other' has no fixed meaning on its own — the free-text field carries it. */
export function cancellationReasonRequiresText(value: string): boolean {
  return value === 'other';
}
