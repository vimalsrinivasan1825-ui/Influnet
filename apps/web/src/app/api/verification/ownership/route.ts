import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { fetchInstagramProfile, normalizeHandle, InstagramProviderError } from '@/lib/instagram';
import { originFromHeaders } from '@/lib/site';
import { deliverEmail } from '@/lib/email/policy';
import { profileNames, nameOf } from '@/lib/email/context';
import {
  OWNERSHIP_TTL_SECONDS,
  bioContainsMarker,
  profileLinksToUsername,
  profileMarker,
  rescoreAfterOwnership,
} from '@/lib/verification-ownership';
import type { Role } from '@/lib/verification';

// The confirm step scrapes the live bio (Apify actor ~15s).
export const maxDuration = 60;

// The marker is the creator's own public profile link, which they are expected
// to keep in their bio — so the challenge is not a secret and does not need a
// short fuse. The window only bounds one verification *session*.
//
// profileMarker/bioContainsMarker now live in lib/verification-ownership.ts:
// the verification pipeline has to look for exactly the same string in the
// same way, and two copies of a matcher this fiddly would drift.
const TTL_SECONDS = OWNERSHIP_TTL_SECONDS;
const MAX_ATTEMPTS = 12; // confirm attempts per challenge
const MIN_ATTEMPT_GAP_MS = 8_000; // cooldown between confirm attempts

// V1 supports Instagram (scrapable bio). linkedin/website are schema-ready but
// not yet confirmable server-side (see docs §2.12).
const CONFIRMABLE_PLATFORMS = new Set(['instagram']);

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

    // The marker is derived from the caller's own username, so it is resolved
    // server-side on every action — a client can never nominate what we look for.
    const kind: 'c' | 'b' = auth.role === 'business_owner' ? 'b' : 'c';
    const table = kind === 'b' ? 'business_profiles' : 'influencer_profiles';
    const { data: ownRow } = await supabase
      .from(table)
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle();
    const username = (ownRow as { username?: string | null } | null)?.username?.trim();
    if (!username) {
      return jsonError(
        400,
        'Set your Influnet username first — your public profile link is what we look for on your Instagram.',
      );
    }
    const origin = originFromHeaders(req.headers);
    const marker = profileMarker(origin, username);

    // ── INITIATE ────────────────────────────────────────────────────────────
    if (action === 'initiate') {
      const { error } = await supabase.rpc('initiate_social_claim', {
        p_platform: platform,
        p_handle: normHandle,
        p_code: marker,
        p_ttl_seconds: TTL_SECONDS,
      });
      if (error) {
        // The DB raises a friendly message when the handle is owned by someone else.
        const already = /already verified/i.test(error.message || '');
        return jsonError(already ? 409 : 500, already ? error.message : 'Could not start verification', error);
      }
      // Mail the marker too. Verification is a two-device job — you start it on
      // the desktop dashboard and finish it in the Instagram app on your phone —
      // so the link needs to exist somewhere reachable from the phone.
      try {
        const names = await profileNames([user.id]);
        await deliverEmail({
          userId: user.id,
          templateId: 'verification_code',
          // One mail per claim window per handle. Re-initiating the same handle
          // inside the window is the common "I lost the tab" case and should
          // not produce a second identical mail.
          dedupeKey: `ownership:${platform}:${normHandle}:${user.id}`,
          data: {
            name: nameOf(names, user.id),
            platform: platform.charAt(0).toUpperCase() + platform.slice(1),
            handle: `@${normHandle}`,
            code: marker,
            expiresInMinutes: Math.round(TTL_SECONDS / 60),
            dashboardUrl: '/dashboard/verify',
          },
        });
      } catch (emailErr) {
        console.error('[ownership] verification email failed:', emailErr);
      }

      return NextResponse.json({
        code: marker,
        profile_url: marker,
        // Kept for older clients that read `verify_url`; same value now.
        verify_url: marker,
        display_url: marker.replace(/^https?:\/\//, ''),
        expires_in: TTL_SECONDS,
        instructions:
          `Add your Influnet profile link to your Instagram links (Edit profile → Links), keep your account public, then tap Verify. Nothing is posted to your account — and you can leave the link there, it is the page you want brands to land on anyway.`,
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

      // Server-side proof: scrape the LIVE bio and look for the profile link.
      // Match against the marker we would issue RIGHT NOW, not the one stored on
      // the claim — a creator who renamed themselves mid-flow should verify with
      // their current link, and a stale stored link must never keep working.
      let bio = '';
      let links: string[] = [];
      let viaLink = false;
      let found = false;
      try {
        const profile = await fetchInstagramProfile(normHandle);
        if (!profile) {
          return jsonError(404, "We couldn't find that public Instagram account. Make sure the handle is correct and the account is public.");
        }
        bio = profile.biography ?? '';
        links = profile.externalUrls ?? [];
        // The clickable link field is what we now ask for. Bio text (and the
        // legacy vf_ code) stay accepted so nobody who followed the older
        // instructions is turned away.
        viaLink = profileLinksToUsername(links, username);
        found = viaLink ||
          bioContainsMarker(bio, marker) ||
          // Legacy: claims opened before the switch still carry a vf_ code.
          (claim.code?.startsWith('vf_') ? bio.includes(claim.code) : false);
      } catch (err) {
        const providerKind = err instanceof InstagramProviderError ? err.kind : 'unknown';
        // Provider hiccup — do not consume an attempt on our side beyond the RPC bump.
        return jsonError(503, `We couldn't check your profile right now (${providerKind}). Please try again in a moment.`);
      }

      // Record WHICH username's link matched. If a username is ever freed and
      // re-registered, this is what lets an admin tell a genuine claim from a
      // replay against the previous owner's untouched bio.
      const proof = found
        ? {
            scraped_at: new Date().toISOString(),
            proof_source: viaLink ? 'external_url' : 'bio',
            snippet: (viaLink ? links.join(' ') : bio).slice(0, 280),
            marker,
            username,
          }
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
            "We couldn't find your profile link in the bio yet. Make sure it's saved and your account is public, then try again.",
        });
      }
      // Ownership is a signal in the confidence score, and the checklist the
      // user is staring at renders from the STORED signals of the last check.
      // Without this the item they just satisfied keeps reading "not met"
      // until some later pipeline run lands — and the clients refresh this
      // panel immediately, so in practice it read as broken. Re-scoring here
      // also releases anyone the anti-impersonation gate was holding in
      // review for exactly the reason they have now fixed.
      const rescored = await rescoreAfterOwnership(supabase, {
        userId: user.id,
        role: auth.role as Role,
      });

      return NextResponse.json({ verified: true, result, profile_url: marker, verification: rescored });
    }

    return jsonError(400, "Unknown action — use 'initiate' or 'confirm'");
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
