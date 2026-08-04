import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { fetchInstagramProfile, InstagramProviderError } from '@/lib/instagram';
import { enforceRateLimit } from '@/lib/rate-limit';

// The default provider (Apify) runs a synchronous actor via
// run-sync-get-dataset-items, which routinely takes 20–50s on a cold start.
// A 15s cap killed nearly every call with a platform 504 (a bad "Network error"
// at signup) instead of letting the provider finish or fail gracefully (503).
// 60s covers the common case; the provider's own AbortController is the backstop.
export const maxDuration = 60;

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
    // isPrivate is the exception: signup needs it to refuse private handles
    // up front, since a private account can never be scraped or bio-verified.
    return NextResponse.json({
      profile: {
        fullName: profile.fullName ?? null,
        biography: profile.biography ?? null,
        followerCount: profile.followerCount ?? null,
        profilePicUrl: profile.profilePicUrl ?? null,
        isVerified: profile.isVerified ?? null,
        isPrivate: profile.isPrivate ?? null,
      },
    });
  } catch (error: any) {
    if (error instanceof InstagramProviderError) {
      return jsonError(503, `Provider error: ${error.kind}`);
    }
    return jsonError(500, 'Internal server error', error);
  }
}
