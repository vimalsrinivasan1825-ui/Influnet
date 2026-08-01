import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { fetchInstagramProfile, normalizeHandle, InstagramProviderError } from '@/lib/instagram';
import { originFromHeaders } from '@/lib/site';

// The confirm step scrapes the live bio (Apify actor ~15s).
export const maxDuration = 60;

// The marker is the creator's own public profile link, which they are expected
// to keep in their bio — so the challenge is not a secret and does not need a
// short fuse. The window only bounds one verification *session*.
const TTL_SECONDS = 24 * 60 * 60;
const MAX_ATTEMPTS = 12; // confirm attempts per challenge
const MIN_ATTEMPT_GAP_MS = 8_000; // cooldown between confirm attempts

// V1 supports Instagram (scrapable bio). linkedin/website are schema-ready but
// not yet confirmable server-side (see docs §2.12).
const CONFIRMABLE_PLATFORMS = new Set(['instagram']);

/**
 * The bio marker is the user's PUBLIC PROFILE LINK, not a throwaway code.
 *
 * A creator has a reason to keep this link in their bio permanently — it is the
 * page they want brands to land on — so verification stops being a chore they
 * undo immediately, and the link staying put is a signal we can re-check later.
 *
 * Trade-off to know about: unlike a one-time code this marker is public and
 * guessable. It cannot be forged (only the account owner can edit that bio), but
 * it IS replayable if a username is ever freed and re-registered while the old
 * owner's bio still carries the link. Blocking username reuse is the guard for
 * that; see the note in the confirm branch.
 */
function profileMarker(origin: string, username: string): string {
  // Derived from the REQUEST origin, not the build-time one: this string is
  // stored and later matched against the creator's live bio, so it has to be
  // the same host the browser told them to paste. No /c or /b segment — see
  // lib/site.ts.
  return `${origin}/${username}`;
}

/**
 * Did the scraped bio contain the marker?
 *
 * People paste links in every shape — with or without https://, with or without
 * www., with a trailing slash, wrapped in a link sticker. Matching the exact
 * stored string would fail most real bios, so compare on a normalised form.
 * Legacy `vf_` codes (claims started before this change) still match exactly.
 */
function bioContainsMarker(bio: string, marker: string): boolean {
  if (marker.startsWith('vf_')) return bio.includes(marker);

  const strip = (s: string) =>
    s
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');

  // Collapse whitespace so a bio that wraps mid-link still matches, and drop
  // zero-width characters Instagram sometimes injects into bio text.
  const haystack = strip(bio).replace(/[​-‏﻿]/g, '').replace(/\s+/g, '');

  // Profile URLs dropped their /c and /b segment, but bios did not: every
  // creator who verified before that change still has host/c/<username> sitting
  // in their Instagram bio, and it is re-scraped on every re-verification.
  // Accept the legacy shapes as well as the current one, or the switch would
  // silently un-verify everyone who already did the handshake.
  const current = strip(marker);
  const legacy = current.replace(/^([^/]+)\/(.+)$/, (_m, host, rest) => `${host}/c/${rest}`);
  const legacyBusiness = current.replace(/^([^/]+)\/(.+)$/, (_m, host, rest) => `${host}/b/${rest}`);

  return [current, legacy, legacyBusiness].some((n) => haystack.includes(n.replace(/\s+/g, '')));
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
        'Set your Influnet username first — your public profile link is what we look for in your bio.',
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
      return NextResponse.json({
        code: marker,
        profile_url: marker,
        // Kept for older clients that read `verify_url`; same value now.
        verify_url: marker,
        display_url: marker.replace(/^https?:\/\//, ''),
        expires_in: TTL_SECONDS,
        instructions:
          `Add your Influnet profile link to your Instagram bio, keep your account public, then tap Verify. Nothing is posted to your account — and you can leave the link there, it is the page you want brands to land on anyway.`,
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
      let found = false;
      try {
        const profile = await fetchInstagramProfile(normHandle);
        if (!profile) {
          return jsonError(404, "We couldn't find that public Instagram account. Make sure the handle is correct and the account is public.");
        }
        bio = profile.biography ?? '';
        found = bioContainsMarker(bio, marker) ||
          // Legacy: claims opened before the switch still carry a vf_ code.
          (claim.code?.startsWith('vf_') ? bio.includes(claim.code) : false);
      } catch (err) {
        const providerKind = err instanceof InstagramProviderError ? err.kind : 'unknown';
        // Provider hiccup — do not consume an attempt on our side beyond the RPC bump.
        return jsonError(503, `We couldn't check your bio right now (${providerKind}). Please try again in a moment.`);
      }

      // Record WHICH username's link matched. If a username is ever freed and
      // re-registered, this is what lets an admin tell a genuine claim from a
      // replay against the previous owner's untouched bio.
      const proof = found
        ? { scraped_at: new Date().toISOString(), snippet: bio.slice(0, 280), marker, username }
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
      return NextResponse.json({ verified: true, result, profile_url: marker });
    }

    return jsonError(400, "Unknown action — use 'initiate' or 'confirm'");
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
