import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { fetchInstagramProfile, InstagramProviderError } from '@/lib/instagram';
import { enforceRateLimit } from '@/lib/rate-limit';

export const maxDuration = 15;

export async function GET(req: Request) {
  try {
    // This is an unauthenticated route used during signup.
    // Strictly rate-limit to prevent abuse of our scraping provider credits.
    // 5 hits per minute per IP.
    const limited = await enforceRateLimit(req, {
      bucket: 'scrape:instagram',
      limit: 5,
      windowMs: 60_000,
    });
    if (limited) return limited;

    const url = new URL(req.url);
    const handle = url.searchParams.get('handle');

    if (!handle) {
      return jsonError(400, 'Instagram handle is required');
    }

    const profile = await fetchInstagramProfile(handle);

    if (!profile) {
      return jsonError(404, 'Instagram profile not found');
    }

    // Data minimization: this route is UNAUTHENTICATED, so only return the few
    // fields signup actually prefills. The provider payload also carries e.g.
    // publicEmail / internal ids — never proxy those to anonymous callers.
    return NextResponse.json({
      profile: {
        fullName: profile.fullName ?? null,
        biography: profile.biography ?? null,
        followerCount: profile.followerCount ?? null,
        profilePicUrl: profile.profilePicUrl ?? null,
        isVerified: profile.isVerified ?? null,
      },
    });
  } catch (error: any) {
    if (error instanceof InstagramProviderError) {
      return jsonError(503, `Provider error: ${error.kind}`);
    }
    return jsonError(500, 'Internal server error', error);
  }
}
