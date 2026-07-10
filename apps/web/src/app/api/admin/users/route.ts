import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;

    // Fetch all profiles
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, role, email, name, phone, location, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // For each profile, fetch extended profile data
    const enrichedUsers = await Promise.all(
      (profiles || []).map(async (p: any) => {
        const enriched: any = { ...p };

        if (p.role === 'business_owner') {
          const { data: biz } = await supabase
            .from('business_profiles')
            .select('company_name, industry, approval_status')
            .eq('user_id', p.id)
            .single();
          if (biz) {
            enriched.company_name = biz.company_name;
            enriched.business_industry = biz.industry;
            enriched.approval_status = biz.approval_status;
          }
        } else if (p.role === 'influencer') {
          const { data: inf } = await supabase
            .from('influencer_profiles')
            .select('username, niche')
            .eq('user_id', p.id)
            .single();
          if (inf) {
            enriched.username = inf.username;
            enriched.niche = inf.niche;
          }
        }

        return enriched;
      })
    );

    return NextResponse.json({ users: enrichedUsers });
  } catch (error: any) {
    console.error('[Admin GET /api/admin/users] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
