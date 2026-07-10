import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { ProfileUpdateSchema, BusinessProfileUpdateSchema } from '@/lib/validators';

// GET current user's profile (both base profile + extended profile)
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Base profile via RPC: email/phone are column-restricted on direct selects
    const { data: profile, error: profileError } = await supabase.rpc('get_own_profile');

    if (profileError || !profile) {
      return jsonError(404, 'Profile not found', profileError);
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
          username: biz.username,
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
    return jsonError(500, 'Internal server error', error);
  }
}

// PATCH to update profile fields
export async function PATCH(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonError(400, 'Invalid JSON body');
    }

    // Validate request based on role
    let validatedData: any;
    if (role === 'business_owner') {
      const result = BusinessProfileUpdateSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
      }
      validatedData = result.data;
    } else if (role === 'influencer') {
      const result = ProfileUpdateSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json({ error: 'Validation failed', details: result.error.format() }, { status: 400 });
      }
      validatedData = result.data;
    } else {
      // Admins have no extended profile row to edit via this route
      return jsonError(403, 'Only business and influencer profiles can be updated here');
    }

    // Base profile fields come from the validated payload only
    const { name, phone, location } = validatedData;

    // Update base profile
    const profileUpdates: any = {};
    if (name !== undefined) profileUpdates.name = name;
    if (phone !== undefined) profileUpdates.phone = phone;
    if (location !== undefined) profileUpdates.location = location;
    
    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (updateError) return jsonError(500, 'Failed to update base profile', updateError);
    }

    // Remove base profile fields from validatedData so they don't get inserted into extended profile tables
    delete validatedData.name;
    delete validatedData.phone;
    delete validatedData.location;

    // Determine extended profile updates from validatedData
    if (role === 'business_owner' && Object.keys(validatedData).length > 0) {
      const bizUpdates: any = { ...validatedData, updated_at: new Date().toISOString() };
      const { error: bizError } = await supabase
        .from('business_profiles')
        .update(bizUpdates)
        .eq('user_id', user.id);
      if (bizError) {
        if (bizError.code === '23505') return jsonError(409, 'That username is already taken');
        return jsonError(500, 'Failed to update business profile', bizError);
      }
    } else if (role === 'influencer' && Object.keys(validatedData).length > 0) {
      const infUpdates: any = { ...validatedData, updated_at: new Date().toISOString() };
      const { error: infError } = await supabase
        .from('influencer_profiles')
        .update(infUpdates)
        .eq('user_id', user.id);
      if (infError) {
        if (infError.code === '23505') return jsonError(409, 'That username is already taken');
        return jsonError(500, 'Failed to update influencer profile', infError);
      }
    }

    // Return updated profile
    const { data: updatedProfile } = await supabase.rpc('get_own_profile');

    return NextResponse.json({ profile: updatedProfile });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
