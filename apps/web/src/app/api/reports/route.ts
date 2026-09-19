import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const ReportSchema = z.object({
  reported_id: z.string().uuid(),
  reason: z.enum(['spam', 'harassment', 'scam', 'fake', 'other']),
  details: z.string().max(2000).optional(),
  project_id: z.number().int().optional(),
  // Where the report was made (migration 163). The report is still ABOUT
  // reported_id; these say which page a moderator should look at.
  context: z.enum(['profile', 'campaign', 'request', 'project', 'chat']).optional(),
  campaign_id: z.string().uuid().optional(),
  collab_request_id: z.string().uuid().optional(),
});

// POST: report another user. Lands in the admin queue (user_reports).
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Guard the abuse-report queue against flooding.
    const limited = await enforceRateLimit(req, { bucket: 'reports:create', limit: 10, windowMs: 60_000, key: user.id });
    if (limited) return limited;

    let body;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, 'Invalid JSON body');
    }

    const parsed = ReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    if (parsed.data.reported_id === user.id) {
      return jsonError(400, 'You cannot report yourself');
    }

    // The context ids must really belong to the person being reported. Without
    // this a caller could pin an arbitrary campaign or request to a report about
    // someone unrelated, which would point a moderator at the wrong thing.
    // Read with the CALLER's client: RLS already limits what they can see, so an
    // id they cannot see is simply "not related".
    if (parsed.data.campaign_id) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', parsed.data.campaign_id)
        .eq('business_user_id', parsed.data.reported_id)
        .maybeSingle();
      if (!campaign) return jsonError(400, 'That campaign does not belong to the person you are reporting.');
    }
    if (parsed.data.collab_request_id) {
      const { data: request } = await supabase
        .from('collab_requests')
        .select('id')
        .eq('id', parsed.data.collab_request_id)
        .or(
          `and(from_user_id.eq.${user.id},to_user_id.eq.${parsed.data.reported_id}),` +
            `and(from_user_id.eq.${parsed.data.reported_id},to_user_id.eq.${user.id})`,
        )
        .maybeSingle();
      if (!request) return jsonError(400, 'That request is not between you and the person you are reporting.');
    }

    const { data, error } = await supabase
      .from('user_reports')
      .insert({
        reporter_id: user.id,
        reported_id: parsed.data.reported_id,
        reason: parsed.data.reason,
        details: parsed.data.details ?? null,
        project_id: parsed.data.project_id ?? null,
        context: parsed.data.context ?? null,
        campaign_id: parsed.data.campaign_id ?? null,
        collab_request_id: parsed.data.collab_request_id ?? null,
      })
      .select('id, status')
      .single();

    if (error) return jsonError(500, 'Failed to submit report', error);
    return NextResponse.json({ report: data });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
