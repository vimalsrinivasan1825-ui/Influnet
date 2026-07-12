import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper for error responses. Server-side details are logged, never returned
// to the client, to avoid leaking DB internals.
function jsonError(status: number, message: string, details?: any) {
  if (details) console.error(`[reviews ${status}] ${message}:`, details);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonError(401, 'Unauthorized');

    // Fetch reviews for the project
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select(`
        id, rating, comment, created_at,
        from_user:profiles!reviews_from_user_id_fkey(id, name, role)
      `)
      .eq('project_id', id)
      .order('created_at', { ascending: false });

    if (error) return jsonError(500, 'Database error', error);

    return NextResponse.json({ reviews });
  } catch (error: any) {
    return jsonError(500, 'Internal Server Error', error.message);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return jsonError(401, 'Unauthorized');

    const body = await req.json();
    const { rating, comment } = body;

    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonError(400, 'Rating must be an integer between 1 and 5');
    }
    if (comment !== undefined && comment !== null && typeof comment !== 'string') {
      return jsonError(400, 'Comment must be a string');
    }

    // Check project status and access
    const { data: project, error: projErr } = await supabase
      .from('campaign_projects')
      .select('status, owner_user_id, counterparty_user_id')
      .eq('id', id)
      .single();

    if (projErr || !project) return jsonError(404, 'Project not found');
    if (project.status !== 'completed') return jsonError(400, 'Can only review completed projects');

    if (project.owner_user_id !== user.id && project.counterparty_user_id !== user.id) {
      return jsonError(403, 'Forbidden');
    }

    // Determine target user
    const to_user_id = project.owner_user_id === user.id ? project.counterparty_user_id : project.owner_user_id;

    // Create review
    const { data: review, error: insertErr } = await supabase
      .from('reviews')
      .insert({
        project_id: id,
        from_user_id: user.id,
        to_user_id,
        rating,
        comment: comment || null,
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') { // unique violation
        return jsonError(400, 'You have already reviewed this project');
      }
      return jsonError(500, 'Failed to insert review', insertErr);
    }

    return NextResponse.json({ review });
  } catch (error: any) {
    return jsonError(500, 'Internal Server Error', error.message);
  }
}
