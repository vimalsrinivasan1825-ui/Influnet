import { adminJson, jsonError, withAdmin } from '@/lib/api';

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
 *
 * Query: action (prefix), actorId, targetId, targetType, limit, before (an
 * entry id — the page returns strictly older entries, so "Load older" walks
 * the whole table rather than stopping at the newest 500).
 *
 * Response: { entries, nextBefore, admins, people }
 *   - admins: who has written to the trail recently, for the filter;
 *   - people: id → name for entries whose target is a person, so the page can
 *     say who was touched and link to them instead of printing a uuid.
 */

const PERSON_TARGETS = new Set(['user', 'profile', 'business_profile']);

interface AuditRow {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_id: string | null;
  target_type: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export async function GET(req: Request) {
  try {
    // Team (view) — lib/admin-access.ts maps /api/admin/audit there. Emails,
    // IPs and anything inside metadata are masked by adminJson for an admin
    // with those field groups hidden.
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    const url = new URL(req.url);
    const actionFilter = url.searchParams.get('action');
    const actorId = url.searchParams.get('actorId');
    const targetId = url.searchParams.get('targetId');
    const targetType = url.searchParams.get('targetType');
    const beforeRaw = Number(url.searchParams.get('before'));
    const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? Math.trunc(beforeRaw) : null;
    const limitRaw = Number(url.searchParams.get('limit') ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 100;

    let query = supabase
      .from('admin_audit_log')
      .select('id, actor_id, actor_email, action, target_id, target_type, metadata, ip_address, created_at')
      .order('id', { ascending: false })
      .limit(limit);

    // Prefix match so 'support' finds support_replied / support_updated, which
    // is how someone actually searches this ("what happened to tickets today").
    if (actionFilter) query = query.like('action', `${actionFilter}%`);
    if (actorId) query = query.eq('actor_id', actorId);
    if (targetId) query = query.eq('target_id', targetId);
    if (targetType) query = query.eq('target_type', targetType);
    if (before) query = query.lt('id', before);

    const { data, error } = await query;
    if (error) return jsonError(500, 'Could not load the audit log', error);
    const entries = (data ?? []) as AuditRow[];

    // Admins for the filter, from the latest 1000 rows: enough to cover
    // everyone currently active without reading a table that only grows.
    const { data: actorRows } = await supabase
      .from('admin_audit_log')
      .select('actor_id, actor_email')
      .not('actor_id', 'is', null)
      .order('id', { ascending: false })
      .limit(1000);
    const admins = [
      ...new Map(
        ((actorRows ?? []) as Pick<AuditRow, 'actor_id' | 'actor_email'>[]).map((r) => [
          r.actor_id as string,
          { id: r.actor_id as string, email: r.actor_email },
        ]),
      ).values(),
    ];

    const personIds = [
      ...new Set(
        entries
          .filter((e) => e.target_id && PERSON_TARGETS.has(e.target_type ?? ''))
          .map((e) => e.target_id as string),
      ),
    ];
    const people: Record<string, string> = {};
    if (personIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', personIds);
      for (const p of profiles ?? []) people[p.id] = p.name || p.email || 'Unnamed';
    }

    return adminJson(req, {
      entries,
      nextBefore: entries.length === limit ? entries[entries.length - 1].id : null,
      admins,
      people,
    });
  } catch (error) {
    return jsonError(500, 'Could not load the audit log', error);
  }
}
