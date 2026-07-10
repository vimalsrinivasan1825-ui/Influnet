import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    
    const { supabase, user, role } = auth;

    if (role === 'business_owner') {
      // Business owners discover Influencers/Creators
      const { data: influencers, error } = await supabase
        .from('influencer_profiles')
        .select(`
          user_id, username, bio, niche, instagram_handle, youtube_handle,
          twitter_handle, headline, availability_status,
          profile:profiles!inner(id, name, location)
        `)
        .neq('user_id', user.id)
        .limit(30);

      if (error) return jsonError(500, 'Failed to fetch influencers', error);

      return NextResponse.json({ userRole: 'business_owner', results: influencers || [] });

    } else if (role === 'influencer') {
      // Influencers discover Business Owners
      const { data: businesses, error } = await supabase
        .from('business_profiles')
        .select(`
          user_id, company_name, industry, tagline, company_description, logo_url,
          collab_preferences, website,
          profile:profiles!inner(id, name, location)
        `)
        .neq('user_id', user.id)
        .limit(30);

      if (error) return jsonError(500, 'Failed to fetch businesses', error);

      return NextResponse.json({ userRole: 'influencer', results: businesses || [] });

    } else {
      return jsonError(400, 'Unknown role');
    }

  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
