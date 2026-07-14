import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { fetchInstagramProfile, normalizeHandle, InstagramProviderError } from '@/lib/instagram';

// The confirm step scrapes the live bio (Apify actor ~15s).
export const maxDuration = 60;

const TTL_SECONDS = 30 * 60; // challenge validity
const MAX_ATTEMPTS = 12; // confirm attempts per challenge
const MIN_ATTEMPT_GAP_MS = 8_000; // cooldown between confirm attempts

// V1 supports Instagram (scrapable bio). linkedin/website are schema-ready but
// not yet confirmable server-side (see docs §2.12).
const CONFIRMABLE_PLATFORMS = new Set(['instagram']);

function newCode(): string {
  return `vf_${randomBytes(18).toString('base64url')}`;
}

function verifyUrl(code: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://influnet.app').replace(/\/$/, '');
  return `${base}/vf/${code}`;
}

// GET: current ownership-claim status for the caller's handle (drives the UI).
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const url = new URL(req.url);
    const platform = (url.searchParams.get('platform') || 'instagram').toLowerCase();
    const handle = normalizeHandle(url.searchParams.get('handle'))?.toLowerCase();
    if (!handle) return NextResponse.json({ status: 'none' });

    const { data: claim } = await supabase
      .from('social_account_claims')
      .select('status, verified_at, expires_at')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('handle', handle)
      .maybeSingle();

    return NextResponse.json({ status: claim?.status ?? 'none', verified_at: claim?.verified_at ?? null });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    // Coarse per-user guard over the per-claim cooldowns below (confirm spends a scrape).
    const limited = await enforceRateLimit(req, { bucket: 'ownership:action', limit: 20, windowMs: 60_000, key: user.id });
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    const platform = (body?.platform as string | undefined)?.toLowerCase() || 'instagram';
    const handle = normalizeHandle(body?.handle);

    if (!handle) return jsonError(400, 'A handle is required');
    if (!CONFIRMABLE_PLATFORMS.has(platform)) {
      return jsonError(400, `Ownership verification for ${platform} is not available yet`);
    }
    // Instagram handles are case-insensitive — store lowercased for stable matching.
    const normHandle = handle.toLowerCase();

    // ── INITIATE ────────────────────────────────────────────────────────────
    if (action === 'initiate') {
      const code = newCode();
      const { error } = await supabase.rpc('initiate_social_claim', {
        p_platform: platform,
        p_handle: normHandle,
        p_code: code,
        p_ttl_seconds: TTL_SECONDS,
      });
      if (error) {
        // The DB raises a friendly message when the handle is owned by someone else.
        const already = /already verified/i.test(error.message || '');
        return jsonError(already ? 409 : 500, already ? error.message : 'Could not start verification', error);
      }
      return NextResponse.json({
        code,
        verify_url: verifyUrl(code),
        expires_in: TTL_SECONDS,
        instructions:
          `Add this link (or just the code ${code}) to your Instagram bio, keep your account public, then tap Verify. You can remove it once verified.`,
      });
    }

    // ── CONFIRM ─────────────────────────────────────────────────────────────
    if (action === 'confirm') {
      const { data: claim, error: claimErr } = await supabase
        .from('social_account_claims')
        .select('code, status, attempts, last_attempt_at, expires_at')
        .eq('user_id', user.id)
        .eq('platform', platform)
        .eq('handle', normHandle)
        .maybeSingle();
      if (claimErr) return jsonError(500, 'Could not load your verification', claimErr);
      if (!claim || claim.status !== 'pending' || new Date(claim.expires_at).getTime() < Date.now()) {
        return jsonError(400, 'This verification expired — start it again');
      }
      // Rate-limit BEFORE spending a scrape call.
      if ((claim.attempts ?? 0) >= MAX_ATTEMPTS) {
        return jsonError(429, 'Too many attempts — start verification again in a little while');
      }
      if (claim.last_attempt_at && Date.now() - new Date(claim.last_attempt_at).getTime() < MIN_ATTEMPT_GAP_MS) {
        return jsonError(429, 'Please wait a few seconds before retrying');
      }

      // Server-side proof: scrape the LIVE bio and look for the exact code.
      let bio = '';
      let found = false;
      try {
        const profile = await fetchInstagramProfile(normHandle);
        if (!profile) {
          return jsonError(404, "We couldn't find that public Instagram account. Make sure the handle is correct and the account is public.");
        }
        bio = profile.biography ?? '';
        found = bio.includes(claim.code);
      } catch (err) {
        const kind = err instanceof InstagramProviderError ? err.kind : 'unknown';
        // Provider hiccup — do not consume an attempt on our side beyond the RPC bump.
        return jsonError(503, `We couldn't check your bio right now (${kind}). Please try again in a moment.`);
      }

      const proof = found
        ? { scraped_at: new Date().toISOString(), snippet: bio.slice(0, 280) }
        : null;

      const { data: result, error: confErr } = await supabase.rpc('confirm_social_claim', {
        p_platform: platform,
        p_handle: normHandle,
        p_matched: found,
        p_proof: proof,
      });
      if (confErr) {
        const taken = /already verified/i.test(confErr.message || '');
        return jsonError(taken ? 409 : 500, taken ? confErr.message : 'Could not record verification', confErr);
      }

      if (!found) {
        return NextResponse.json({
          verified: false,
          message:
            "We couldn't find your code in the bio yet. Make sure it's saved and your account is public, then try again.",
        });
      }
      return NextResponse.json({ verified: true, result });
    }

    return jsonError(400, "Unknown action — use 'initiate' or 'confirm'");
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
