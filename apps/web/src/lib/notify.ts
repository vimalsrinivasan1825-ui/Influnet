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
 * Push the notification to the recipient's phone, if they have one registered
 * (migration 079's `profiles.expo_push_token`, set by the mobile app on
 * launch — see apps/mobile/lib/push.ts).
 *
 * Without this, `notifications` rows only reach someone who happens to open
 * the app — for a turn-based product ("waiting on the creator") that means
 * the other side finds out only on their next visit. This is best-effort in
 * every sense: no token, missing migration, or a failed Expo request all just
 * log and return — a push is a bonus, never a dependency of the action that
 * triggered it.
 */
async function sendPush(
  sb: NonNullable<ReturnType<typeof serviceClient>>,
  userId: string,
  title: string,
  body: string,
  link: string | null,
): Promise<void> {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .maybeSingle();
    if (error) return; // migration 079 not applied yet — no column to read
    const token = (data as { expo_push_token?: string | null } | null)?.expo_push_token;
    if (!token) return;

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        // The mobile app reads this on tap to deep-link — see
        // lib/notification-link.ts's toMobileHref().
        data: link ? { link } : undefined,
      }),
    });
    if (!res.ok) {
      console.error('[notify] Expo push request failed:', res.status, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('[notify] exception while sending push:', err);
  }
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
    await sendPush(sb, input.userId, input.title, input.body ?? '', input.link ?? null);
    return true;
  } catch (err) {
    console.error('[notify] exception while notifying:', err);
    return false;
  }
}
