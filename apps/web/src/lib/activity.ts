// Append-only project activity log. Every meaningful project event is recorded
// here so both parties get one legible timeline of "what happened" (see
// migration 062_project_activity). Summaries are name-free — the timeline UI
// prefixes the actor ("You" / the person's name) resolved from actor_user_id.
//
// Best-effort by design: a failed insert (e.g. the table isn't migrated on this
// environment yet) never blocks the action that triggered it.

export type ActivityType =
  | 'project_created'
  | 'stage_advanced'
  | 'stage_signoff'
  | 'stage_skipped'
  | 'revisions_requested'
  | 'draft_approved'
  | 'terms_change_proposed'
  | 'terms_change_accepted'
  | 'terms_change_rejected'
  | 'terms_edited'
  | 'payment_paid'
  | 'completion_confirmed'
  | 'project_completed'
  | 'cancellation_requested'
  | 'cancellation_declined'
  | 'cancellation_accepted'
  | 'project_deleted'
  | 'project_restored';

interface LogActivityParams {
  projectId: number | string;
  actorUserId?: string | null;
  type: ActivityType;
  summary: string;
  metadata?: Record<string, unknown>;
}

// `supabase` is any Supabase client — the caller's authed client in API routes,
// or the service-role admin client in the payment webhook.
export async function logActivity(
  supabase: { from: (table: string) => any },
  { projectId, actorUserId, type, summary, metadata }: LogActivityParams,
): Promise<void> {
  try {
    await supabase.from('project_activity').insert({
      project_id: typeof projectId === 'string' ? parseInt(projectId, 10) : projectId,
      actor_user_id: actorUserId ?? null,
      type,
      summary,
      metadata: metadata ?? {},
    });
  } catch {
    // Never let logging break the request.
  }
}
