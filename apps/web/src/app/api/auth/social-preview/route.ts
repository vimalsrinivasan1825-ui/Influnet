import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSocialHandler, PLATFORM_LABEL, SocialProviderError } from '@/lib/social';
import { inlineAvatar } from '@/lib/social/avatar';
import { logger } from '@/lib/logger';

// One preview endpoint for every platform. The older /api/auth/scrape-instagram
// route stays exactly as it is: already-installed mobile builds call it, and
// they can't be updated retroactively.
//
// Apify actors run synchronously and routinely take 20–50s on a cold start; a
// short cap turns those into a platform 504 that reads to the user as "network
// error" instead of a real answer.
export const maxDuration = 60;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

// In-memory cache to prevent repeated actor calls and rate-limiting
const PREVIEW_CACHE = new Map<string, { time: number; data: any }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform') ?? '';
    const rawHandle = url.searchParams.get('handle') ?? '';

    const handler = getSocialHandler(platform);
    if (!handler) return NextResponse.json({ error: 'Unknown platform' }, { status: 400, headers: CORS_HEADERS });
    if (!rawHandle.trim()) return NextResponse.json({ error: 'A handle is required' }, { status: 400, headers: CORS_HEADERS });

    const handle = handler.normalizeHandle(rawHandle);
    if (!handle) {
      return NextResponse.json({ status: 'invalid', platform, profile: null }, { headers: CORS_HEADERS });
    }

    // Check fast memory cache
    const cacheKey = `${platform}:${handle}`;
    const cached = PREVIEW_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return NextResponse.json(cached.data, { headers: CORS_HEADERS });
    }

    if (!handler.supported) {
      return NextResponse.json({
        status: 'unsupported',
        platform,
        handle,
        url: handler.profileUrl(handle),
        profile: null,
      }, { headers: CORS_HEADERS });
    }

    // Unauthenticated rate-limit protection
    const limited = await enforceRateLimit(req, {
      bucket: `social:preview:${platform}`,
      limit: 15,
      windowMs: 60_000,
    });
    if (limited) {
      // Return CORS headers with rate limit response
      return new NextResponse(limited.body, {
        status: limited.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (!handler.isConfigured()) {
      return NextResponse.json(
        { status: 'unavailable', platform, message: `${PLATFORM_LABEL[handler.platform]} lookup isn't configured yet` },
        { status: 503, headers: CORS_HEADERS },
      );
    }

    // Wrap in a promise with 28s timeout (Apify cold-starts take 15–25s;
    // client aborts at 30s so server fires first and returns a clean 504)
    const fetchWithTimeout = Promise.race([
      handler.fetchProfile(handle),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('SCRAPER_TIMEOUT')), 28_000)
      ),
    ]);

    const profile = await fetchWithTimeout;
    if (!profile) {
      return NextResponse.json({
        status: 'notfound',
        platform,
        handle,
        isPrivate: false,
        profile: null,
        message: `Instagram account @${handle} was not found.`,
      }, { status: 404, headers: CORS_HEADERS });
    }

    if (profile.isPrivate) {
      // Private account: verification succeeds without fetching public media or data
      const payload = {
        status: 'private',
        platform,
        handle: profile.handle,
        url: profile.url,
        isPrivate: true,
        profile: null,
      };
      PREVIEW_CACHE.set(cacheKey, { time: Date.now(), data: payload });
      return NextResponse.json(payload, { headers: CORS_HEADERS });
    }

    const payload = {
      status: 'found',
      platform,
      handle: profile.handle,
      url: profile.url,
      isPrivate: false,
      profile: {
        displayName: profile.displayName || profile.handle,
        biography: profile.biography || '',
        followerCount: profile.followerCount,
        avatarUrl: await inlineAvatar(profile.avatarUrl),
        isVerified: Boolean(profile.isVerified),
        isPrivate: false,
        postsCount: profile.postsCount,
      },
    };

    PREVIEW_CACHE.set(cacheKey, { time: Date.now(), data: payload });
    return NextResponse.json(payload, { headers: CORS_HEADERS });
  } catch (error: any) {
    if (error?.message === 'SCRAPER_TIMEOUT') {
      logger.warn('social-preview: timeout contacting scraper', { error: error.message });
      return NextResponse.json(
        { status: 'timeout', message: 'Instagram lookup took too long. Proceeding with handle.' },
        { status: 504, headers: CORS_HEADERS }
      );
    }

    if (error instanceof SocialProviderError) {
      logger.warn('social-preview: provider error', {
        platform: error.platform,
        kind: error.kind,
        detail: error.message,
      });
      return NextResponse.json(
        { status: 'error', kind: error.kind, message: `Couldn't reach ${PLATFORM_LABEL[error.platform]} right now` },
        { status: 503, headers: CORS_HEADERS },
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', detail: String(error?.message || error) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
