import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';

/**
 * JSON twin of /<username>'s business branch (apps/web's
 * app/[username]/business-profile.tsx), for the mobile app's native business
 * profile screen — same shape of thing /api/creators/[username] is for the
 * creator branch of that page.
 *
 * Business profiles are PRIVATE, unlike creator ones: a business is visible
 * only to itself and to a creator with an established relationship (a collab
 * request or a campaign project). `get_business_eligibility` enforces this in
 * the database (SECURITY DEFINER) — a viewer with no access gets NULL back,
 * which this route reports as a 404, exactly like the web page's `notFound()`.
 * There is no path here that leaks "this username exists but you can't see
 * it" the way the web page's login-redirect briefly could for a logged-out
 * visitor; withAuth already requires a session before this runs.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const auth = await withAuth(req);
  if (!auth.ok) return auth.res;
  const { supabase, user } = auth;

  const { username } = await params;

  const { data: profileData, error } = await (supabase.rpc as any)('get_business_eligibility', {
    p_slug: username,
    p_viewer_user_id: user.id,
  });
  // No relationship (or no such business) → 404, same as the web page. A
  // shared link with no relationship behind it is worthless either way.
  if (error || !profileData) return jsonError(404, 'Profile not found');

  const profile = profileData as {
    userId: string;
    name: string | null;
    location: string | null;
    memberSince: string | null;
    verificationStatus: string | null;
    companyName: string | null;
    industry: string | null;
    businessType: string | null;
    teamSize: string | null;
    website: string | null;
    city: string | null;
    state: string | null;
    mission: string | null;
    brandStory: string | null;
    products: string | null;
    services: string | null;
    trustedPartner: boolean;
    approvalStatus: string | null;
    avatarUrl: string | null;
    completedCollaborations: number;
    totalPartners: number;
  };

  const isOwner = user.id === profile.userId;

  // Fire-and-forget view recording — never counts the owner's own visits, and
  // the RPC pins the viewer to auth.uid() so it can't be spoofed from the
  // client. Same migration (113) and same pattern as the creator route's
  // record_profile_view call.
  if (!isOwner) {
    (supabase.rpc as any)('record_business_profile_view', {
      p_business_user_id: profile.userId,
    }).then(() => {}, () => {});
  }

  return NextResponse.json({
    data: {
      userId: profile.userId,
      name: profile.companyName || profile.name || 'Business',
      companyName: profile.companyName,
      location: profile.location || [profile.city, profile.state].filter(Boolean).join(', ') || null,
      industry: profile.industry,
      businessType: profile.businessType,
      teamSize: profile.teamSize,
      website: profile.website,
      mission: profile.mission,
      brandStory: profile.brandStory,
      products: profile.products,
      services: profile.services,
      avatarUrl: profile.avatarUrl,
      isVerified: profile.trustedPartner || profile.verificationStatus === 'verified',
      approvalStatus: profile.approvalStatus,
      memberSince: profile.memberSince,
      completedCollaborations: profile.completedCollaborations ?? 0,
      totalPartners: profile.totalPartners ?? 0,
    },
    isOwner,
  });
}
