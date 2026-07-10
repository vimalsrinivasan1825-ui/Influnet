import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET current user's profile (both base profile + extended profile)
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

    // Get base profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const p = profile as any;
    const result: any = {
      id: p.id,
      role: p.role,
      email: p.email,
      name: p.name,
      phone: p.phone,
      location: p.location,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };

    // Get extended profile based on role
    if (p.role === 'business_owner') {
      const { data: biz } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (biz) {
        Object.assign(result, {
          company_name: biz.company_name,
          industry: biz.industry,
          business_type: biz.business_type,
          gst_number: biz.gst_number,
          website: biz.website,
          marketing_budget: biz.marketing_budget,
          registered_address: biz.registered_address,
          city: biz.city,
          state: biz.state,
          tagline: biz.tagline,
          company_description: biz.company_description,
          instagram_handle: biz.instagram_handle,
          facebook_handle: biz.facebook_handle,
          linkedin_handle: biz.linkedin_handle,
          approval_status: biz.approval_status,
        });
      }
    } else if (p.role === 'influencer') {
      const { data: inf } = await supabase
        .from('influencer_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (inf) {
        Object.assign(result, {
          username: inf.username,
          bio: inf.bio,
          headline: inf.headline,
          niche: inf.niche,
          gender: inf.gender,
          city: inf.city,
          state: inf.state,
          languages: inf.languages,
          collab_types: inf.collab_types,
          price_range: inf.price_range,
          instagram_handle: inf.instagram_handle,
          youtube_handle: inf.youtube_handle,
          twitter_handle: inf.twitter_handle,
          facebook_handle: inf.facebook_handle,
          linkedin_handle: inf.linkedin_handle,
          tiktok_handle: inf.tiktok_handle,
          avatar_url: inf.avatar_url,
          is_verified: inf.is_verified,
          availability_status: inf.availability_status,
          engagement_rate: inf.engagement_rate,
          media_kit_url: inf.media_kit_url,
        });
      }
    }

    return NextResponse.json({ profile: result });
  } catch (error: any) {
    console.error('[GET /api/profile] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH to update profile fields
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

    const body = await req.json();
    const { name, phone, location } = body;

    // Update base profile
    const profileUpdates: any = {};
    if (name !== undefined) profileUpdates.name = name;
    if (phone !== undefined) profileUpdates.phone = phone;
    if (location !== undefined) profileUpdates.location = location;
    profileUpdates.updated_at = new Date().toISOString();

    if (Object.keys(profileUpdates).length > 1) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (updateError) throw updateError;
    }

    // Get user's role to determine extended profile updates
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const p = profile as any;
    const role = p?.role;

    if (role === 'business_owner') {
      const bizUpdates: any = {};
      if (body.company_name !== undefined) bizUpdates.company_name = body.company_name;
      if (body.industry !== undefined) bizUpdates.industry = body.industry;
      if (body.business_type !== undefined) bizUpdates.business_type = body.business_type;
      if (body.website !== undefined) bizUpdates.website = body.website;
      if (body.marketing_budget !== undefined) bizUpdates.marketing_budget = body.marketing_budget;
      if (body.tagline !== undefined) bizUpdates.tagline = body.tagline;
      if (body.company_description !== undefined) bizUpdates.company_description = body.company_description;
      if (body.city !== undefined) bizUpdates.city = body.city;
      if (body.state !== undefined) bizUpdates.state = body.state;
      if (body.instagram_handle !== undefined) bizUpdates.instagram_handle = body.instagram_handle;
      if (body.facebook_handle !== undefined) bizUpdates.facebook_handle = body.facebook_handle;
      if (body.linkedin_handle !== undefined) bizUpdates.linkedin_handle = body.linkedin_handle;
      bizUpdates.updated_at = new Date().toISOString();

      if (Object.keys(bizUpdates).length > 1) {
        const { error: bizError } = await supabase
          .from('business_profiles')
          .update(bizUpdates)
          .eq('user_id', user.id);
        if (bizError) throw bizError;
      }
    } else if (role === 'influencer') {
      const infUpdates: any = {};
      if (body.bio !== undefined) infUpdates.bio = body.bio;
      if (body.headline !== undefined) infUpdates.headline = body.headline;
      if (body.gender !== undefined) infUpdates.gender = body.gender;
      if (body.city !== undefined) infUpdates.city = body.city;
      if (body.state !== undefined) infUpdates.state = body.state;
      if (body.instagram_handle !== undefined) infUpdates.instagram_handle = body.instagram_handle;
      if (body.youtube_handle !== undefined) infUpdates.youtube_handle = body.youtube_handle;
      if (body.twitter_handle !== undefined) infUpdates.twitter_handle = body.twitter_handle;
      if (body.availability_status !== undefined) infUpdates.availability_status = body.availability_status;
      infUpdates.updated_at = new Date().toISOString();

      if (Object.keys(infUpdates).length > 1) {
        const { error: infError } = await supabase
          .from('influencer_profiles')
          .update(infUpdates)
          .eq('user_id', user.id);
        if (infError) throw infError;
      }
    }

    // Return updated profile
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return NextResponse.json({ profile: updatedProfile });
  } catch (error: any) {
    console.error('[PATCH /api/profile] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
