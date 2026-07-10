import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the current user's role
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const myRole = myProfile?.role;

    if (myRole === 'business_owner') {
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

      if (error) throw error;

      return NextResponse.json({ userRole: 'business_owner', results: influencers || [] });

    } else if (myRole === 'influencer') {
      // Influencers discover Business Owners
      const { data: businesses, error } = await supabase
        .from('business_profiles')
        .select(`
          user_id, company_name, industry, tagline, company_description, logo_url,
          preferred_creator_niches, website,
          profile:profiles!inner(id, name, location)
        `)
        .neq('user_id', user.id)
        .limit(30);

      if (error) throw error;

      return NextResponse.json({ userRole: 'influencer', results: businesses || [] });

    } else {
      return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
