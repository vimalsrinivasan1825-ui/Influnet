import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSocialHandler, PLATFORM_LABEL, SocialProviderError } from '@/lib/social';
import { logger } from '@/lib/logger';

// One preview endpoint for every platform. The older /api/auth/scrape-instagram
// route stays exactly as it is: already-installed mobile builds call it, and
// they can't be updated retroactively.
//
// Apify actors run synchronously and routinely take 20–50s on a cold start; a
// short cap turns those into a platform 504 that reads to the user as "network
// error" instead of a real answer.
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform') ?? '';
    const rawHandle = url.searchParams.get('handle') ?? '';

    const handler = getSocialHandler(platform);
    if (!handler) return jsonError(400, 'Unknown platform');
    if (!rawHandle.trim()) return jsonError(400, 'A handle is required');

    const handle = handler.normalizeHandle(rawHandle);
    if (!handle) {
      return NextResponse.json({ status: 'invalid', platform, profile: null });
    }

    // Link-only platforms (Snapchat) short-circuit BEFORE the rate limiter:
    // there's no provider call to protect, and burning a user's window on a
    // lookup we never make would block the platforms that do cost something.
    if (!handler.supported) {
      return NextResponse.json({
        status: 'unsupported',
        platform,
        handle,
        url: handler.profileUrl(handle),
        profile: null,
      });
    }

    // Unauthenticated route spending provider credits — strictly capped per IP.
    // Now that the client only calls this on an explicit "Connect" tap (rather
    // than on every keystroke pause), 5/min is generous for a real user and
    // still tight against a scraper farming our Apify balance.
    const limited = await enforceRateLimit(req, {
      bucket: `social:preview:${platform}`,
      limit: 5,
      windowMs: 60_000,
    });
    if (limited) return limited;

    if (!handler.isConfigured()) {
      return NextResponse.json(
        { status: 'unavailable', platform, message: `${PLATFORM_LABEL[handler.platform]} lookup isn't configured yet` },
        { status: 503 },
      );
    }

    const profile = await handler.fetchProfile(handle);
    if (!profile) {
      return NextResponse.json({ status: 'notfound', platform, handle, profile: null }, { status: 404 });
    }

    // Data minimisation: this route is UNAUTHENTICATED, so it returns only the
    // fields the preview card renders and signup prefills. Provider payloads
    // also carry public emails, phone numbers and internal ids — none of that
    // is ever proxied to an anonymous caller. isPrivate is included because
    // that's the whole point of the check.
    return NextResponse.json({
      status: profile.isPrivate ? 'private' : 'found',
      platform,
      handle: profile.handle,
      url: profile.url,
      profile: {
        displayName: profile.displayName,
        biography: profile.biography,
        followerCount: profile.followerCount,
        avatarUrl: profile.avatarUrl,
        isVerified: profile.isVerified,
        isPrivate: profile.isPrivate,
      },
    });
  } catch (error: any) {
    if (error instanceof SocialProviderError) {
      // Logged with the real reason (plan limits, credit exhausted, a renamed
      // actor) because the user-facing copy deliberately doesn't carry it —
      // and without this line, "couldn't reach X" is all anyone would ever see.
      logger.warn('social-preview: provider error', {
        platform: error.platform,
        kind: error.kind,
        detail: error.message,
      });
      // A provider outage is not a verdict on the user's handle — say so, so
      // the UI can offer a retry instead of telling them their account is gone.
      return NextResponse.json(
        { status: 'error', kind: error.kind, message: `Couldn't reach ${PLATFORM_LABEL[error.platform]} right now` },
        { status: 503 },
      );
    }
    return jsonError(500, 'Internal server error', error);
  }
}
