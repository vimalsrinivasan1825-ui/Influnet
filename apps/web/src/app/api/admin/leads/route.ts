import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, withAdmin } from '@/lib/api';
import { auditAdmin } from '@/lib/admin-audit';

/**
 * POST /api/admin/leads → { lead }
 *
 * Brands and creators the team sources offline, before they have an account
 * (migration 160). Reading the list is GET /api/admin/insights/leads.
 */
const LeadSchema = z.object({
  kind: z.enum(['creator', 'business']),
  name: z.string().min(1).max(120),
  company: z.string().max(120).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  handle: z.string().max(60).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  source: z.enum(['event', 'referral', 'instagram', 'cold_call', 'inbound', 'other']).nullable().optional(),
  stage: z.enum(['new', 'contacted', 'interested', 'invited', 'signed_up', 'active', 'lost']).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  next_follow_up: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const parsed = LeadSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('crm_leads')
      .insert({ ...parsed.data, owner_id: parsed.data.owner_id ?? user.id, created_by: user.id })
      .select('*')
      .single();
    if (error) return jsonError(400, `Could not save this lead: ${error.message}`, error);

    // Link straight away if this person already has an account.
    await (supabase.rpc as any)('match_crm_leads');

    await auditAdmin({
      actorId: user.id, actorEmail: user.email ?? null, action: 'lead_created',
      targetId: (data as any).id, targetType: 'lead', metadata: { name: parsed.data.name, kind: parsed.data.kind }, req,
    });
    return NextResponse.json({ lead: data }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not save this lead', error);
  }
}
