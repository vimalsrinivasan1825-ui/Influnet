import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Notification types persisted in public.notifications.type (see migration 047).
export type NotificationType =
  | 'collab_request'
  | 'collab_accepted'
  | 'collab_declined'
  | 'project_stage'
  | 'project_cancel'
  | 'message';

export interface NotifyInput {
  /** Recipient profile id. */
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** In-app path, e.g. /dashboard/projects/<id>. */
  link?: string | null;
}

// A service-role client is required because a notification is written for a
// DIFFERENT user than the caller, which the row-level security policies on
// `notifications` (self-scoped SELECT/UPDATE, no INSERT policy) would reject.
function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Best-effort notification write. This NEVER throws: a failed notification must
 * not roll back or break the action that triggered it (advancing a stage, etc.).
 * Returns whether the row was written so callers can log if they care.
 */
export async function notifyUser(input: NotifyInput): Promise<boolean> {
  try {
    const sb = serviceClient();
    if (!sb) {
      console.warn('[notify] SUPABASE_SERVICE_ROLE_KEY missing — skipping notification');
      return false;
    }
    const { error } = await sb.from('notifications').insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      link: input.link ?? null,
    });
    if (error) {
      console.error('[notify] failed to insert notification:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notify] exception while notifying:', err);
    return false;
  }
}
