import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET all business profiles (for admin review)
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all business profiles with their user profiles
    const { data: businesses, error } = await supabase
      .from('business_profiles')
      .select(`
        user_id, company_name, industry, business_type, approval_status,
        created_at, gst_number, website, city, state, marketing_budget,
        profile:profiles!inner(id, name, email, phone, location, created_at)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ businesses: businesses || [] });
  } catch (error: any) {
    console.error('[Admin GET /api/admin/businesses] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH to approve/reject a business account
export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile as any).role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { user_id, approval_status } = body;

    if (!user_id || !approval_status) {
      return NextResponse.json({ error: 'user_id and approval_status are required' }, { status: 400 });
    }

    if (!['approved', 'rejected'].includes(approval_status)) {
      return NextResponse.json({ error: 'approval_status must be "approved" or "rejected"' }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from('business_profiles')
      .update({ approval_status, updated_at: new Date().toISOString() })
      .eq('user_id', user_id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ business: updated });
  } catch (error: any) {
    console.error('[Admin PATCH /api/admin/businesses] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
