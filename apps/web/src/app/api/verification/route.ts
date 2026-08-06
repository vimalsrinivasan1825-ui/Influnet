import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { buildSignals } from '@/lib/verification-scraper';
import { enrichWithLiveData } from '@/lib/verification-live';
import { captureInstagramSnapshot } from '@/lib/social-snapshot';
import { refreshYouTubeSnapshot } from '@/lib/youtube';
import { normalizeHandle } from '@/lib/instagram';
import { originFromHeaders } from '@/lib/site';
import { hasVerifiedInstagramClaim, syncOwnershipFromBio } from '@/lib/verification-ownership';
import { decide, scoreBreakdown, AUTO_APPROVE_THRESHOLD, OWNERSHIP_KEY, VERIFICATION_NOTIFICATION, type Role, type VerificationSignals } from '@/lib/verification';

// The live provider (Apify actor) can take ~15s to return. Allow headroom so the
// serverless function doesn't time out mid-verification. The signup trigger is
// fire-and-forget, so users never wait on this; the Settings button shows a
// spinner. (For higher scale, move to the async verification_jobs queue.)
export const maxDuration = 60;

// GET: the caller's current verification status + latest check (for the UI panel).
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('role, verification_status, verified_badge, verified_at')
      .eq('id', user.id)
      .single();
    if (profErr) return jsonError(500, 'Failed to load verification status', profErr);

    const { data: latest } = await supabase
      .from('verification_checks')
      .select('status, ai_score, ai_reason, ai_signals, created_at, decided_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // What's actually missing, not just the blended score — a creator or
    // business sitting below the auto-approve threshold has no other way to
    // tell "add more followers" from "we still need your ownership proof".
    const rawBreakdown =
      latest?.ai_signals && Object.keys(latest.ai_signals as object).length > 0
        ? scoreBreakdown(prof.role as Role, latest.ai_signals as VerificationSignals)
        : null;

    // Ownership is the one checklist item with a source of truth OUTSIDE the
    // stored signals, and it is the item most likely to be stale: someone who
    // proved ownership at signup, or thirty seconds ago on the ownership
    // screen, has a verified claim and a check that predates it. Rendering the
    // photograph rather than the fact is what made the app keep demanding proof
    // it already held. Read the claim and let it win.
    const ownershipVerified = await hasVerifiedInstagramClaim(supabase, user.id, prof.role as Role);
    const breakdown = rawBreakdown?.map((item) =>
      item.key === OWNERSHIP_KEY && ownershipVerified ? { ...item, met: true } : item,
    ) ?? null;

    return NextResponse.json({
      status: prof?.verification_status ?? 'unverified',
      verified_badge: prof?.verified_badge ?? false,
      verified_at: prof?.verified_at ?? null,
      ownership_verified: ownershipVerified,
      auto_approve_threshold: AUTO_APPROVE_THRESHOLD,
      latest_check: latest
        ? {
            status: latest.status,
            ai_score: latest.ai_score,
            ai_reason: latest.ai_reason,
            created_at: latest.created_at,
            decided_at: latest.decided_at,
            breakdown,
          }
        : null,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}

// POST: run (or re-run) verification for the caller. This NEVER blocks product
// access — it only scores the account and moves the badge state. Scrape+score
// happen server-side here; a real deployment can move this to a queue worker.
export async function POST(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user, role } = auth;

    if (role !== 'business_owner' && role !== 'influencer') {
      return jsonError(400, 'Only business and creator accounts can be verified');
    }

    // Each run spends a paid scrape (~$0.0026 + ~15s). Cap re-runs per user.
    const limited = await enforceRateLimit(req, { bucket: 'verification:run', limit: 6, windowMs: 60_000, key: user.id });
    if (limited) return limited;

    // Gather the user's own submitted data as scraper input.
    const { data: baseProfile } = await supabase.rpc('get_own_profile');
    const phone = (baseProfile as any)?.phone ?? null;

    let input: Record<string, unknown>;
    if (role === 'business_owner') {
      const { data: biz } = await supabase.rpc('get_own_business_profile');
      const b = (biz as any) ?? {};
      input = {
        company_name: b.company_name,
        website: b.website,
        gst_number: b.gst_number,
        instagram_handle: b.instagram_handle,
        linkedin_handle: b.linkedin_handle,
        phone,
      };
    } else {
      const { data: inf } = await supabase
        .from('influencer_profiles')
        .select('bio, niche, instagram_handle, youtube_handle, twitter_handle, instagram_followers, youtube_subscribers')
        .eq('user_id', user.id)
        .single();
      const i = inf ?? {};
      input = { ...i, phone };
    }

    // 1) Structural signals from the user's own submission (pure, sync).
    const baseSignals = buildSignals(role as Role, input);
    // 2) Live enrichment: confirm the Instagram handle against HikerAPI (real
    //    followers, IG's own verified flag, recency). Never throws — a provider
    //    outage degrades to structural signals + human review.
    const { signals, note, profile: liveProfile } = await enrichWithLiveData(
      role as Role,
      {
        instagram_handle: (input as any).instagram_handle ?? null,
        instagram_followers: (input as any).instagram_followers ?? null,
      },
      baseSignals,
    );

    // Reuse the paid scrape: persist a public-profile snapshot (followers, posts
    // count, engagement, recent posts + cached thumbnails). Best-effort — a
    // snapshot failure must never affect the verification outcome.
    if (role === 'influencer' && liveProfile) {
      await captureInstagramSnapshot(user.id, liveProfile);
    }
    // Same fallback as /api/profile/refresh: creators re-run verification to get
    // their public numbers updated, so a channel we have captured before must
    // refresh even when the profile column has since been cleared.
    if (role === 'influencer') {
      let ytHandle: string | null = (input as any).youtube_handle || null;
      if (!ytHandle) {
        const { data: captured } = await supabase
          .from('social_snapshots')
          .select('handle')
          .eq('user_id', user.id)
          .eq('platform', 'youtube')
          .maybeSingle();
        ytHandle = (captured as { handle: string | null } | null)?.handle || null;
      }
      if (ytHandle) await refreshYouTubeSnapshot(user.id, ytHandle);
    }

    // Ownership gate: has the user PROVEN control of this Instagram handle via the
    // bio-link handshake? Without it, decide() will not auto-verify (anti-impersonation).
    //
    // This does not merely READ the claim, it reconciles it against the bio we
    // just scraped. Signup asks for the same proof (see
    // /api/auth/verify-instagram-bio) but runs before an account exists, so it
    // can only answer yes/no and persist nothing — which meant a creator who
    // had just put the link in their bio during signup was asked to do the
    // whole thing again on their first visit to the verification screen. This
    // run happens automatically right after signup, the link is still in the
    // bio, and the claim gets recorded from evidence the server read itself.
    const igHandle = normalizeHandle((input as any).instagram_handle)?.toLowerCase() ?? null;
    if (igHandle) {
      signals.ownership_verified = await syncOwnershipFromBio(supabase, {
        userId: user.id,
        role: role as Role,
        handle: igHandle,
        bio: (liveProfile as { biography?: string | null } | null)?.biography ?? null,
        links: (liveProfile as { externalUrls?: string[] | null } | null)?.externalUrls ?? null,
        origin: originFromHeaders(req.headers),
      });
    }

    const decision = decide(role as Role, signals);
    const reason = note ? `${decision.reason} — ${note}` : decision.reason;
    const notif = VERIFICATION_NOTIFICATION[decision.status];

    const { data: result, error: rpcErr } = await supabase.rpc('submit_verification', {
      p_signals: signals,
      p_score: decision.score,
      p_reason: reason,
      p_status: decision.status,
      p_notif_type: notif.type,
      p_notif_title: notif.title,
      p_notif_body: notif.body,
    });
    if (rpcErr) return jsonError(500, 'Failed to record verification', rpcErr);

    return NextResponse.json({
      status: decision.status,
      score: decision.score,
      reason,
      result,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
