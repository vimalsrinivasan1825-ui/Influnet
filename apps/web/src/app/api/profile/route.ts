import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { withAuth, jsonError, parseClientHeader } from '@/lib/api';
import { DELETION_REASONS, activeProjectCount, hardDeleteAccount, recordAccountDeletion } from '@/lib/account-deletion';
import { ProfileUpdateSchema, BusinessProfileUpdateSchema } from '@/lib/validators';
import { refreshYouTubeSnapshot } from '@/lib/youtube';

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
      creating_since: p.creating_since ?? null,
      gst_number: p.gst_number ?? null,
      nudges_opt_out: p.nudges_opt_out ?? false,
      verification_status: p.verification_status ?? 'unverified',
      verified_badge: p.verified_badge ?? false,
      verified_at: p.verified_at ?? null,
      // Undefined (rather than null) when migration 077 hasn't been applied,
      // so the nudge falls back to its localStorage behaviour for that window.
      mediakit_nudge_dismissed_at: 'mediakit_nudge_dismissed_at' in p ? p.mediakit_nudge_dismissed_at : undefined,
      // Same undefined-until-migration-085 fallback for the ownership nudge.
      ownership_nudge_dismissed_at: 'ownership_nudge_dismissed_at' in p ? p.ownership_nudge_dismissed_at : undefined,
    };

    // Get extended profile based on role.
    // Business owner reads its full row via a SECURITY DEFINER RPC because
    // sensitive columns (gst_number, registered_address, marketing_budget)
    // are revoked from direct authenticated selects (migration 053).
    if (p.role === 'business_owner') {
      const { data: bizJson } = await supabase.rpc('get_own_business_profile');
      const biz = bizJson as any;
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
          logo_url: biz.logo_url,
          cover_image_url: biz.cover_image_url,
          contact_name: biz.contact_name,
          contact_phone: biz.contact_phone,
          contact_email: biz.contact_email,
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
          pricing_min: inf.pricing_min,
          pricing_max: inf.pricing_max,
          past_collaborations: inf.past_collaborations,
          audience_demographics: inf.audience_demographics,
          instagram_handle: inf.instagram_handle,
          youtube_handle: inf.youtube_handle,
          twitter_handle: inf.twitter_handle,
          facebook_handle: inf.facebook_handle,
          linkedin_handle: inf.linkedin_handle,
          tiktok_handle: inf.tiktok_handle,
          avatar_url: inf.avatar_url,
          cover_image_url: inf.cover_image_url,
          verified_badge: p.verified_badge ?? false,
          availability_status: inf.availability_status,
          engagement_rate: inf.engagement_rate,
          media_kit_url: inf.media_kit_url,
          // Undefined until migration 088 rather than null/{}: distinguishes
          // "this backend doesn't have the column yet" from "creator has an
          // empty (all-visible) preference", which the settings UI needs to
          // tell apart to avoid PATCHing a value it never actually read.
          profile_section_visibility: 'profile_section_visibility' in inf
            ? inf.profile_section_visibility
            : undefined,
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
    const { name, phone, location, creating_since, nudges_opt_out } = validatedData;
    // gst_number is base-profile only for a CREATOR (profiles.gst_number,
    // migration 135). A business's gst_number lives on business_profiles and
    // goes through the business branch below via BusinessProfileUpdateSchema —
    // this is a different field on a different table despite the same name.
    const creator_gst_number = role === 'influencer' ? validatedData.gst_number : undefined;

    // Update base profile
    const profileUpdates: any = {};
    if (name !== undefined) profileUpdates.name = name;
    if (phone !== undefined) profileUpdates.phone = phone;
    if (location !== undefined) profileUpdates.location = location;
    if (creating_since !== undefined) profileUpdates.creating_since = creating_since;
    if (creator_gst_number !== undefined) profileUpdates.gst_number = creator_gst_number;
    if (nudges_opt_out !== undefined) profileUpdates.nudges_opt_out = nudges_opt_out;

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
    delete validatedData.creating_since;
    delete validatedData.nudges_opt_out;
    // Only for a creator — a business's gst_number is a DIFFERENT field on
    // business_profiles and must stay in validatedData for that branch below.
    if (role === 'influencer') delete validatedData.gst_number;

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
      const { data: infRow, error: infError } = await supabase
        .from('influencer_profiles')
        .update(infUpdates)
        .eq('user_id', user.id)
        .select('youtube_handle')
        .maybeSingle();
      if (infError) {
        if (infError.code === '23505') return jsonError(409, 'That username is already taken');
        return jsonError(500, 'Failed to update influencer profile', infError);
      }

      // Connecting or updating a YouTube channel should populate the profile straight away —
      // a creator who saves their handle and sees an empty video grid assumes it
      // didn't work. The capture is two public fetches (channel page + Atom
      // feed), so it runs AFTER the response rather than making a settings save
      // wait several seconds for it. Failure is silent by design: lib/youtube.ts
      // never throws, and the creator can still refresh manually.
      if (infRow?.youtube_handle) {
        const handle = infRow.youtube_handle;
        after(async () => {
          await refreshYouTubeSnapshot(user.id, handle);
        });
      }
    }

    // Return updated profile
    const { data: updatedProfile } = await supabase.rpc('get_own_profile');

    return NextResponse.json({ profile: updatedProfile });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

/**
 * DELETE — the signed-in user removes their own account.
 *
 * Body (optional): `{ reason_code, reason_text }` from the in-app reason picker.
 *
 * Order matters (migration 153): refuse while a project is still active, write
 * the tombstone, THEN hard-delete. A tombstone that can't be written stops the
 * deletion — the admin "Deleted users" report must not silently miss anyone.
 */
const DeleteBodySchema = z.object({
  reason_code: z.enum(DELETION_REASONS).optional(),
  reason_text: z.string().max(500).optional(),
});

export async function DELETE(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { user } = auth;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return jsonError(500, 'Server misconfigured: missing service role key');
    }

    const parsed = DeleteBodySchema.safeParse(await req.json().catch(() => ({})));
    const body = parsed.success ? parsed.data : {};

    // Must use the service_role client to delete users from auth.users
    const { createClient } = await import('@supabase/supabase-js');
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const active = await activeProjectCount(serviceClient, user.id);
    if (active > 0) {
      return NextResponse.json(
        {
          error: Number.isFinite(active)
            ? `You have ${active} active project${active === 1 ? '' : 's'}. Complete or cancel ${active === 1 ? 'it' : 'them'} before deleting your account.`
            : 'We could not check your active projects. Please try again.',
          activeProjects: Number.isFinite(active) ? active : null,
        },
        { status: 409 },
      );
    }

    const { data: row } = await serviceClient
      .from('profiles')
      .select('email, phone')
      .eq('id', user.id)
      .maybeSingle();

    const platform = parseClientHeader(req).platform;
    const tomb = await recordAccountDeletion(serviceClient, {
      userId: user.id,
      via: platform === 'ios' || platform === 'android' ? 'self_mobile' : 'self_web',
      deletedBy: user.id,
      reasonCode: body.reason_code ?? null,
      reasonText: body.reason_text ?? null,
      email: (row as any)?.email ?? user.email ?? null,
      phone: (row as any)?.phone ?? null,
    });
    if (!tomb.ok) {
      return jsonError(500, 'Could not delete your account right now. Please try again.', tomb.error);
    }

    const result = await hardDeleteAccount(serviceClient, user.id);
    if (!result.ok) {
      return jsonError(500, 'Failed to delete user account', result.error);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
