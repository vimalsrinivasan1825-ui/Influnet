import { NextResponse } from 'next/server';
import { withAuth, jsonError } from '@/lib/api';
import { buildSignals } from '@/lib/verification-scraper';
import { decide, VERIFICATION_NOTIFICATION, type Role } from '@/lib/verification';

// GET: the caller's current verification status + latest check (for the UI panel).
export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('verification_status, verified_badge, verified_at')
      .eq('id', user.id)
      .single();
    if (profErr) return jsonError(500, 'Failed to load verification status', profErr);

    const { data: latest } = await supabase
      .from('verification_checks')
      .select('status, ai_score, ai_reason, created_at, decided_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      status: prof?.verification_status ?? 'unverified',
      verified_badge: prof?.verified_badge ?? false,
      verified_at: prof?.verified_at ?? null,
      latest_check: latest ?? null,
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

    const signals = buildSignals(role as Role, input);
    const decision = decide(role as Role, signals);
    const notif = VERIFICATION_NOTIFICATION[decision.status];

    const { data: result, error: rpcErr } = await supabase.rpc('submit_verification', {
      p_signals: signals,
      p_score: decision.score,
      p_reason: decision.reason,
      p_status: decision.status,
      p_notif_type: notif.type,
      p_notif_title: notif.title,
      p_notif_body: notif.body,
    });
    if (rpcErr) return jsonError(500, 'Failed to record verification', rpcErr);

    return NextResponse.json({
      status: decision.status,
      score: decision.score,
      reason: decision.reason,
      result,
    });
  } catch (error: any) {
    return jsonError(500, 'Internal server error', error);
  }
}
