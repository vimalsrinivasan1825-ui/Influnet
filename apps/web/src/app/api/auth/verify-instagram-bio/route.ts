import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { fetchInstagramProfile, InstagramProviderError } from '@/lib/instagram';
import { enforceRateLimit } from '@/lib/rate-limit';
import { bioLinksToUsername, profileLinksToUsername } from '@/lib/verification-ownership';

// Same ceiling as scrape-instagram: the Apify actor routinely takes 20-50s on a
// cold start, and a shorter cap turns a working check into a platform 504.
export const maxDuration = 60;

/**
 * POST /api/auth/verify-instagram-bio  { handle, username }
 *
 * Signup-time proof that the person claiming an Instagram handle can edit that
 * account's bio: they paste their own future profile link into it and we read
 * it back server-side. Unauthenticated by design — this runs BEFORE the account
 * exists, which is the whole point of gating signup on it.
 *
 * ── What this is and is not ────────────────────────────────────────────────
 * The match is deliberately strict: the bio must contain the claimant's OWN
 * username as the profile path, not merely the word "influnet". A loose match
 * would let anyone claim a creator's handle the moment that creator's bio
 * mentioned Influnet at all; requiring the claimant's own unique username
 * means the string they need is one only they were shown.
 *
 * This endpoint writes NOTHING, and cannot: it runs before the account exists,
 * so there is no user to attach a claim to and no session to trust. It gates
 * signup and nothing else.
 *
 * That used to mean the proof was thrown away — the same person was asked for
 * the same bio link again on their first visit to the verification screen. It
 * is no longer wasted: the verification pipeline (/api/verification, fired
 * automatically right after signup) looks for the same marker in the bio it
 * scrapes anyway and records the ownership claim itself, authenticated and
 * server-side. See syncOwnershipFromBio in lib/verification-ownership.ts.
 *
 * Note what that does and does not concede. The marker is a public profile
 * link, not the single-use code of migration 058: it is readable by anyone and
 * does not expire, so a recycled username could let a new holder inherit an old
 * holder's proof. But the IN-APP ownership flow already accepts exactly this
 * marker, so persisting it grants nothing that flow would not have granted a
 * minute later. The Verified badge itself is still decided by the pipeline
 * under the rules migration 083 locked down — ownership is one input to that
 * decision, never a substitute for it.
 */
export async function POST(req: Request) {
  try {
    // Unauthenticated AND spends provider credit per call — keep it on the
    // same tight budget as the signup scrape.
    const limited = await enforceRateLimit(req, {
      bucket: 'auth:verify-instagram-bio',
      limit: 6,
      windowMs: 60_000,
    });
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const handle = typeof body.handle === 'string' ? body.handle.replace(/^@/, '').trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';

    if (!handle || !username) {
      return jsonError(400, 'Instagram handle and username are required');
    }
    // The username is interpolated into a RegExp below; keep it to the charset
    // the username rules already allow so no pattern metacharacter reaches it.
    if (!/^[a-z0-9_.]{3,30}$/i.test(username)) {
      return jsonError(400, 'Invalid username');
    }

    const profile = await fetchInstagramProfile(handle);
    if (!profile) {
      return jsonError(404, 'Instagram profile not found');
    }
    if (profile.isPrivate) {
      return NextResponse.json({
        verified: false,
        reason: 'private',
        message: "That account is private, so we can't read its bio.",
      });
    }

    // The matcher moved to lib/verification-ownership.ts, which is where the
    // authenticated pipeline reads it from too. It was duplicated here, and the
    // two copies had already drifted: this one is host-agnostic (the link shown
    // differs across dev / staging / prod), the other host-exact — so a bio
    // that passed this gate could be refused by the reconciliation a minute
    // later, and the creator was asked for proof they had just given.
    // The clickable link field is what we now ask for; bio text stays accepted
    // so anyone who followed the older instructions still gets through.
    const viaLink = profileLinksToUsername(profile.externalUrls, username);
    const verified = viaLink || bioLinksToUsername(profile.biography ?? '', username);

    return NextResponse.json({
      verified,
      ...(verified
        ? {}
        : {
            reason: 'not_found',
            message: "We couldn't find your link yet — check it's saved in your profile's website/link field.",
          }),
    });
  } catch (error: any) {
    if (error instanceof InstagramProviderError) {
      return jsonError(503, `Provider error: ${error.kind}`);
    }
    return jsonError(500, 'Internal server error', error);
  }
}
