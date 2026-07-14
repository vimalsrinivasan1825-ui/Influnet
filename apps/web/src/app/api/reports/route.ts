import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const ReportSchema = z.object({
  reported_id: z.string().uuid(),
  reason: z.enum(['spam', 'harassment', 'scam', 'fake', 'other']),
  details: z.string().max(2000).optional(),
  project_id: z.number().int().optional(),
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

    const { data, error } = await supabase
      .from('user_reports')
      .insert({
        reporter_id: user.id,
        reported_id: parsed.data.reported_id,
        reason: parsed.data.reason,
        details: parsed.data.details ?? null,
        project_id: parsed.data.project_id ?? null,
      })
      .select('id, status')
      .single();

    if (error) return jsonError(500, 'Failed to submit report', error);
    return NextResponse.json({ report: data });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
