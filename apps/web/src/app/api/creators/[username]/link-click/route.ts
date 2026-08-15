/**
 * "Someone followed a link out of this creator's profile."
 *
 * Called from the public creator page (web and mobile) when a visitor taps one
 * of the creator's outbound links — their Instagram, their YouTube, their site.
 * It is the write half of the reach number on Home; see lib/profile-reach.ts
 * for why the server does this rather than the browser calling the RPC direct.
 *
 * THREE THINGS THIS ROUTE ALWAYS DOES
 *
 * 1. Answers 204, always. A visitor is mid-tap and a link is opening; there is
 *    no failure here worth a response body, and an error shape would only
 *    invite the client to do something about it. An unknown username, an
 *    unapplied migration and a successful write are indistinguishable from
 *    outside — which also means this cannot be used to test whether a username
 *    exists in a way the public page doesn't already answer.
 *
 * 2. Accepts anonymous callers. Most clicks are logged out — that is the whole
 *    point of a link a creator puts in their bio — so an Authorization header
 *    is read when present and simply absent otherwise.
 *
 * 3. Rate-limits per IP. This is an unauthenticated write endpoint, so the
 *    limiter is the thing standing between it and someone's shell loop. The
 *    daily unique index (migration 116) means a flood cannot inflate the
 *    number anyway; the limit is about not paying to find that out.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clientKey } from '@/lib/rate-limit';
import { isLinkType, recordLinkClick } from '@/lib/profile-reach';
import { logger } from '@/lib/logger';

/** Empty, and deliberately so — see the header. */
const noContent = () => new NextResponse(null, { status: 204 });

/**
 * The signed-in visitor, when there is one. A bad or expired token is treated
 * as "logged out" rather than an error: the click is still real.
 */
async function viewerFrom(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const limited = await enforceRateLimit(req, {
    bucket: 'profile:link-click',
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => null)) as { link_type?: unknown } | null;
    if (!isLinkType(body?.link_type)) return noContent();

    const { username } = await params;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return noContent();

    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Usernames are stored lowercase; a link tapped from a shared URL may not be.
    const { data: creator } = await admin
      .from('influencer_profiles')
      .select('user_id')
      .ilike('username', username)
      .maybeSingle();

    if (!creator?.user_id) return noContent();

    await recordLinkClick({
      creatorUserId: creator.user_id,
      linkType: body!.link_type as never,
      viewerUserId: await viewerFrom(req),
      ip: clientKey(req),
    });
  } catch (error) {
    logger.warn('link-click: not recorded (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return noContent();
}
