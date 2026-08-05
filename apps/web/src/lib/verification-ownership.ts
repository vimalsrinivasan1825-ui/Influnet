/**
 * Instagram ownership: the bio-link handshake, shared by every route that
 * needs it.
 *
 * There are two places a creator can prove they control a handle, and they
 * used to be strangers to each other:
 *
 *   1. SIGNUP — /api/auth/verify-instagram-bio, before an account exists.
 *      Unauthenticated, so it could only answer yes/no and write nothing.
 *   2. IN-APP — /api/verification/ownership, which records a verified row in
 *      social_account_claims.
 *
 * Both look for the same thing: the claimant's own public profile link in the
 * live Instagram bio. Because signup could not persist its result, a creator
 * who had just done the whole bio dance during signup was asked to do it again
 * the moment they entered the app — the same proof, refused the first time
 * purely because of when it happened.
 *
 * `syncOwnershipFromBio` closes that gap without trusting the client: it
 * re-reads the marker out of a bio the server has *already scraped* under an
 * authenticated session, and records the claim itself. No client flag, no new
 * provider call, and the evidence is byte-for-byte what the in-app flow
 * accepts — so this grants nothing that flow would not have granted a minute
 * later anyway.
 */
import {
  VERIFICATION_NOTIFICATION,
  decide,
  type Role,
  type VerificationSignals,
} from '@/lib/verification';

/**
 * The request-scoped Supabase client from withAuth(). Typed loosely on purpose,
 * exactly as lib/api.ts hands it out — every query here goes through RLS as the
 * caller, so the safety that matters is enforced by the database, not by this
 * annotation.
 */
type Db = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

/** How long a verification session stays open. Mirrors the ownership route. */
export const OWNERSHIP_TTL_SECONDS = 24 * 60 * 60;

/**
 * The marker is the creator's own public profile link, not a throwaway code.
 *
 * Derived from the REQUEST origin, not the build-time one: this string is
 * stored and later matched against a live bio, so it has to be the same host
 * the user was told to paste. No /c or /b segment — see lib/site.ts.
 */
export function profileMarker(origin: string, username: string): string {
  return `${origin}/${username}`;
}

/**
 * Did the scraped bio contain the marker?
 *
 * People paste links in every shape — with or without https://, with or
 * without www., with a trailing slash, wrapped in a link sticker. Matching the
 * exact stored string would fail most real bios, so compare on a normalised
 * form. Legacy `vf_` codes (claims started before the link switch) still match
 * exactly.
 */
export function bioContainsMarker(bio: string, marker: string): boolean {
  if (marker.startsWith('vf_')) return bio.includes(marker);

  const strip = (s: string) =>
    s
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');

  const zeroWidth = /[​-‏﻿]/g;
  const base = strip(bio).replace(zeroWidth, '');
  // Two readings of the same bio. Whitespace collapsed to a single space is the
  // one that matters — it keeps "influnet.in/priya · food creator" matching
  // while leaving a boundary the check below can see. Whitespace removed
  // entirely is a fallback for a link broken across lines.
  const haystacks = [base.replace(/\s+/g, ' '), base.replace(/\s+/g, '')];

  // Profile URLs dropped their /c and /b segment, but bios did not: every
  // creator who verified before that change still has host/c/<username> sitting
  // in their Instagram bio, and it is re-scraped on every re-verification.
  // Accept the legacy shapes as well as the current one, or the switch would
  // silently un-verify everyone who already did the handshake.
  const current = strip(marker);
  const legacy = current.replace(/^([^/]+)\/(.+)$/, (_m, host, rest) => `${host}/c/${rest}`);
  const legacyBusiness = current.replace(/^([^/]+)\/(.+)$/, (_m, host, rest) => `${host}/b/${rest}`);

  // The trailing boundary is load-bearing, not tidiness.
  //
  // A plain substring test let a marker verify against a LONGER username: a bio
  // reading "influnet.in/priyanka" contains "influnet.in/priya", so anyone who
  // registered the username `priya` could confirm ownership of the Instagram
  // handle belonging to `priyanka` — and this claim is the anti-impersonation
  // gate the Verified badge depends on. The signup-time checker
  // (/api/auth/verify-instagram-bio) has always had this guard; the in-app path
  // that actually writes the claim did not. Same rule in both places now.
  const boundary = (needle: string) =>
    new RegExp(`${needle.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?![a-z0-9_.])`);

  return [current, legacy, legacyBusiness].some((n) => {
    const spaced = boundary(n);
    const tight = boundary(n.replace(/\s+/g, ''));
    return spaced.test(haystacks[0]) || tight.test(haystacks[1]);
  });
}

/** The caller's own Influnet username — the tail of the marker we look for. */
export async function ownUsername(db: Db, userId: string, role: Role): Promise<string | null> {
  const table = role === 'business_owner' ? 'business_profiles' : 'influencer_profiles';
  const { data } = await db.from(table).select('username').eq('user_id', userId).maybeSingle();
  return (data as { username?: string | null } | null)?.username?.trim() || null;
}

/**
 * Bring social_account_claims in line with what the live bio actually says,
 * and report whether this handle is proven.
 *
 * Called from the verification pipeline, which has already paid for the scrape
 * — this adds no provider cost. Returns true when the handle is verified for
 * this user, whether it already was or was recorded just now.
 *
 * Never throws: ownership is one signal among several, and a hiccup here must
 * degrade the score, not fail the whole verification run.
 */
export async function syncOwnershipFromBio(
  db: Db,
  opts: { userId: string; role: Role; handle: string; bio: string | null; origin: string },
): Promise<boolean> {
  const { userId, role, handle, bio, origin } = opts;
  try {
    const { data: claim } = await db
      .from('social_account_claims')
      .select('status')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .eq('handle', handle)
      .maybeSingle();

    // Already proven. Return early and, critically, do NOT re-initiate:
    // initiate_social_claim resets an existing row to 'pending', so calling it
    // here would un-verify someone every time their verification re-ran.
    if ((claim as { status?: string } | null)?.status === 'verified') return true;

    if (!bio) return false;
    const username = await ownUsername(db, userId, role);
    if (!username) return false;

    const marker = profileMarker(origin, username);
    if (!bioContainsMarker(bio, marker)) return false;

    // Open a claim and close it in one go. Two calls rather than a direct
    // insert because these RPCs own the invariants: initiate refuses a handle
    // another account has already verified, and confirm holds the partial
    // unique index that stops two owners.
    const { error: initErr } = await db.rpc('initiate_social_claim', {
      p_platform: 'instagram',
      p_handle: handle,
      p_code: marker,
      p_ttl_seconds: OWNERSHIP_TTL_SECONDS,
    });
    // The usual cause is "already verified by another Influnet account", which
    // is a legitimate refusal, not an error to surface here.
    if (initErr) return false;

    const { error: confirmErr } = await db.rpc('confirm_social_claim', {
      p_platform: 'instagram',
      p_handle: handle,
      p_matched: true,
      p_proof: {
        scraped_at: new Date().toISOString(),
        snippet: bio.slice(0, 280),
        marker,
        username,
        source: 'verification_pipeline',
      },
    });
    return !confirmErr;
  } catch {
    return false;
  }
}

/**
 * Re-decide the caller's verification now that ownership is proven, reusing
 * the signals from their last run.
 *
 * Confirming ownership used to change nothing visible. The checklist item
 * ("Account ownership confirmed") is rendered from the *stored* signals of the
 * most recent check, so it kept saying "not met" until a whole new pipeline
 * run happened to finish — and the clients refresh the panel immediately after
 * confirming, long before a fire-and-forget run could land. Worse, a creator
 * whose metrics were already strong sat in `in_review` for exactly the reason
 * they had just fixed, because the anti-impersonation gate in decide() is only
 * consulted while scoring.
 *
 * This re-scores from what we already know instead of scraping again: same
 * signals, ownership flipped on. Cheap, instant, and it cannot invent a pass —
 * every other signal is the one the last real run measured.
 *
 * Returns null when there is nothing to re-score (no prior check), in which
 * case the caller's own pipeline trigger is what will populate it.
 */
export async function rescoreAfterOwnership(
  db: Db,
  opts: { userId: string; role: Role },
): Promise<{ status: string; score: number } | null> {
  try {
    const { data: latest } = await db
      .from('verification_checks')
      .select('ai_signals')
      .eq('user_id', opts.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const signals = (latest as { ai_signals?: VerificationSignals } | null)?.ai_signals;
    if (!signals || Object.keys(signals).length === 0) return null;

    // An unchanged score means the ownership gate was never what held this
    // account back — still worth writing, because the checklist the user is
    // looking at is rendered from these stored signals.
    const updated: VerificationSignals = { ...signals, ownership_verified: true };
    const decision = decide(opts.role, updated);
    const notif = VERIFICATION_NOTIFICATION[decision.status];

    await db.rpc('submit_verification', {
      p_signals: updated,
      p_score: decision.score,
      p_reason: `${decision.reason} — re-scored after ownership was confirmed.`,
      p_status: decision.status,
      p_notif_type: notif.type,
      p_notif_title: notif.title,
      p_notif_body: notif.body,
    });

    return { status: decision.status, score: decision.score };
  } catch {
    return null;
  }
}
