import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { z } from 'zod';
import { notifyUser } from '@/lib/notify';
import { enforceRateLimit } from '@/lib/rate-limit';

const CreateProjectSchema = z.object({
  collab_request_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  budget: z.coerce.number().nonnegative().max(100_000_000).optional(),
  advance_amount: z.coerce.number().nonnegative().max(100_000_000).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(2000).optional(),
});

// Map the RPC's exception names onto messages the two parties can act on.
const CREATE_ERRORS: Record<string, [number, string]> = {
  request_not_found: [404, 'That collaboration request no longer exists.'],
  not_a_participant: [403, 'You are not part of this collaboration.'],
  request_not_accepted: [409, 'Both sides have to accept the request before a project can be created.'],
  project_already_exists: [409, 'A project already exists for this collaboration.'],
  title_required: [400, 'Give the project a title.'],
  no_business_participant: [400, 'A project needs a brand on one side of the collaboration.'],
};

// GET all campaign projects for the authenticated user
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Retrieve projects where caller is owner or counterparty
    const { data: projects, error } = await supabase
      .from('campaign_projects')
      .select(`
        *,
        owner:profiles!campaign_projects_owner_user_id_fkey(id, name, role),
        counterparty:profiles!campaign_projects_counterparty_user_id_fkey(id, name, role)
      `)
      .or(`owner_user_id.eq.${user.id},counterparty_user_id.eq.${user.id}`)
      .order('updated_at', { ascending: false });

    if (error) return jsonError(500, 'Database query error', error);

    return NextResponse.json({ projects });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// POST — propose a project off an accepted collab request.
//
// Either party may propose it (the brand OR the creator) with whatever terms
// they negotiated in chat. It lands in 'pending_acceptance' and the OTHER side
// has to accept before the stage pipeline starts. Ownership is decided in the
// RPC (the brand is always the owner) so the payer side stays consistent no
// matter who filled in the form.
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const limited = await enforceRateLimit(req, {
      bucket: 'projects:create',
      limit: 20,
      windowMs: 60_000,
      key: user.id,
    });
    if (limited) return limited;

    const parsed = CreateProjectSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { collab_request_id, title, description, budget, advance_amount, due_date, note } = parsed.data;

    if (advance_amount != null && budget != null && advance_amount > budget) {
      return jsonError(400, 'The advance can’t be more than the total budget.');
    }

    const { data: result, error: rpcError } = await supabase.rpc('create_project_from_collab', {
      p_collab_request_id: collab_request_id,
      p_title: title,
      p_description: description ?? '',
      p_budget: budget ?? null,
      p_advance_amount: advance_amount ?? null,
      p_due_date: due_date ?? null,
      p_note: note ?? null,
    });

    if (rpcError) {
      const known = Object.entries(CREATE_ERRORS).find(([key]) => rpcError.message?.includes(key));
      if (known) return jsonError(known[1][0], known[1][1]);
      return jsonError(500, 'Could not create the project', rpcError);
    }

    const awaiting = result?.awaiting_user_id as string | undefined;
    if (awaiting) {
      await notifyUser({
        userId: awaiting,
        type: 'project_stage',
        title: `New project proposed: “${title}”`,
        body: budget != null
          ? `The terms are on the table at ₹${Number(budget).toLocaleString('en-IN')}. Review them to start the project — or reply in chat to keep negotiating.`
          : 'Review the proposed terms to start the project — or reply in chat to keep negotiating.',
        link: `/dashboard/projects/${result.project_id}`,
      });
    }

    return NextResponse.json({ project_id: result?.project_id, status: result?.status, conversation_id: result?.conversation_id });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

