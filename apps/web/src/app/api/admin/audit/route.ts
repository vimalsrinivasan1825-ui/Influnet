import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';

/**
 * The admin audit trail (migration 070).
 *
 * The table has existed since the admin-hardening work but nothing ever read
 * it — "which admin did what, when" was only answerable by opening the
 * Supabase SQL editor. Since the admin account is shared with the client, that
 * is the one question most likely to be asked under pressure.
 *
 * Read-only by construction: `admin_audit_log` has no UPDATE or DELETE policy
 * and none should ever be added, so there is no mutating handler here.
 */

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const url = new URL(req.url);
    const actionFilter = url.searchParams.get('action');
    const limitRaw = Number(url.searchParams.get('limit') ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 100;

    let query = supabase
      .from('admin_audit_log')
      .select('id, actor_id, actor_email, action, target_id, target_type, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Prefix match so 'support' finds support.replied / support.updated, which
    // is how someone actually searches this ("what happened to tickets today").
    if (actionFilter) query = query.like('action', `${actionFilter}%`);

    const { data, error } = await query;
    if (error) return jsonError(500, 'Could not load the audit log', error);

    return NextResponse.json({ entries: data ?? [] });
  } catch (error) {
    return jsonError(500, 'Could not load the audit log', error);
  }
}
