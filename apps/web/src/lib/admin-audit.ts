import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Append-only audit trail for admin actions.
 *
 * The admin login is shared with the client, so "who did this, and when" has to
 * be answerable after the fact. Writes go through the service-role key because
 * `admin_audit_log` has no INSERT policy for `authenticated` — the trail must
 * not be forgeable from a browser session.
 *
 * Like notifyUser(), this NEVER throws: a failed audit write must not roll back
 * the admin action it describes. Failures are logged loudly instead.
 */
export type AdminAction =
  | 'verification_decided'
  | 'business_approval_changed'
  | 'collab_deleted'
  | 'project_deleted'
  | 'report_resolved'
  | 'admin_provisioned'
  | 'admin_revoked'
  | 'user_deleted'
  | 'user_updated';

export interface AuditInput {
  actorId: string;
  actorEmail?: string | null;
  action: AdminAction;
  targetId?: string | null;
  targetType?: string | null;
  metadata?: Record<string, unknown>;
  req?: Request;
}

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Best-effort client IP. Behind Vercel/Azure the left-most x-forwarded-for entry
// is the caller; it's advisory only and must never be used for authorization.
function clientIp(req?: Request): string | null {
  if (!req) return null;
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

export async function auditAdmin(input: AuditInput): Promise<boolean> {
  try {
    const sb = serviceClient();
    if (!sb) {
      console.error('[audit] SUPABASE_SERVICE_ROLE_KEY missing — admin action NOT audited:', input.action);
      return false;
    }
    const { error } = await sb.from('admin_audit_log').insert({
      actor_id: input.actorId,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      target_id: input.targetId ?? null,
      target_type: input.targetType ?? null,
      metadata: input.metadata ?? {},
      ip_address: clientIp(input.req),
    });
    if (error) {
      console.error('[audit] failed to write admin audit row:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[audit] exception while auditing:', err);
    return false;
  }
}
