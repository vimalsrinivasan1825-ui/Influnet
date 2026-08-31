import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolveEntitlements } from '@/lib/entitlements';

/**
 * Reveal a business owner's direct contact details to the calling creator.
 *
 * Free creators may reveal 5 distinct businesses, lifetime; the 6th needs Pro.
 * The count-check-insert is atomic inside reveal_business_contact() (migration
 * 141) behind an advisory lock. An already-revealed business never re-charges.
 *
 * Only reachable for a business the creator can already SEE — the same
 * relationship gate the profile itself uses (get_business_eligibility). No
 * relationship → 404, exactly like the profile route.
 *
 * Envelope: `{ contact }` on success; 402 `{ error, feature, used, limit }` at
 * the cap.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    if (role !== 'influencer') {
      return jsonError(403, 'Only creators reveal business contact details.');
    }

    const { username } = await params;

    const limited = await enforceRateLimit(req, {
      bucket: 'business:reveal-contact', limit: 20, windowMs: 60_000, key: user.id,
    });
    if (limited) return limited;

    const { data: profileData } = await (supabase.rpc as any)('get_business_eligibility', {
      p_slug: username,
      p_viewer_user_id: user.id,
    });
    if (!profileData) return jsonError(404, 'Profile not found');
    const businessUserId = (profileData as { userId: string }).userId;

    const { data, error } = await (supabase.rpc as any)('reveal_business_contact', {
      p_business_id: businessUserId,
    });

    if (error) {
      return jsonError(500, 'Could not reveal contact details', error);
    }

    const result = data as
      | { allowed: true; contact: Record<string, string | null> }
      | { allowed: false; used: number; limit: number };

    if (!result.allowed) {
      const ent = await resolveEntitlements(supabase, user.id);
      return NextResponse.json(
        {
          error: `You've revealed contact details for ${result.limit} businesses. Upgrade to Pro to see more.`,
          feature: 'business.reveal_contact',
          tier: ent.tier,
          used: result.used,
          limit: result.limit,
          upgradeUrl: '/dashboard/billing',
        },
        { status: 402 },
      );
    }

    return NextResponse.json({ contact: result.contact });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
