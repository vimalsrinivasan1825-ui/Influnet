import { describe, it, expect, vi } from 'vitest';
import {
  bioContainsMarker,
  bioLinksToUsername,
  hasVerifiedInstagramClaim,
  profileMarker,
  rescoreAfterOwnership,
  syncOwnershipFromBio,
} from '@/lib/verification-ownership';
import { scoreBreakdown, type VerificationSignals } from '@/lib/verification';

const ORIGIN = 'https://influnet.in';
const MARKER = profileMarker(ORIGIN, 'priya');

/**
 * Minimal stand-in for the request-scoped Supabase client. Records the RPCs
 * that were called so a test can assert what was written, not just what was
 * returned — the bugs these tests cover were both "the right answer was
 * computed and then not persisted anywhere the UI reads".
 */
function fakeDb(opts: {
  claimStatus?: string | null;
  username?: string | null;
  latestSignals?: VerificationSignals | null;
  initiateError?: unknown;
}) {
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const calls: { fn: string; args: Record<string, unknown> }[] = [];

  const db = {
    from(table: string) {
      const row =
        table === 'social_account_claims'
          ? opts.claimStatus === undefined || opts.claimStatus === null
            ? null
            : { status: opts.claimStatus }
          : table === 'influencer_profiles' || table === 'business_profiles'
            ? opts.username === undefined
              ? { username: 'priya' }
              : opts.username === null
                ? null
                : { username: opts.username }
            : table === 'verification_checks'
              ? opts.latestSignals === undefined || opts.latestSignals === null
                ? null
                : { ai_signals: opts.latestSignals }
              : null;

      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) {
        chain[m] = () => chain;
      }
      chain.maybeSingle = async () => ({ data: row, error: null });
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'initiate_social_claim' && opts.initiateError) {
        return { data: null, error: opts.initiateError };
      }
      return rpc();
    },
  };

  return { db, calls };
}

describe('bioContainsMarker', () => {
  it('matches the link however it was pasted', () => {
    for (const bio of [
      `Food creator ${MARKER}`,
      'Food creator influnet.in/priya',
      'Food creator https://www.influnet.in/priya/',
      'Food creator\nINFLUNET.IN/PRIYA',
    ]) {
      expect(bioContainsMarker(bio, MARKER), bio).toBe(true);
    }
  });

  it('still matches bios carrying the old /c/ path', () => {
    expect(bioContainsMarker('influnet.in/c/priya', MARKER)).toBe(true);
  });

  it('does not match a different creator', () => {
    expect(bioContainsMarker('influnet.in/priyanka', MARKER)).toBe(false);
  });

  it('does not match the bare domain', () => {
    expect(bioContainsMarker('I use influnet.in', MARKER)).toBe(false);
  });
});

describe('syncOwnershipFromBio', () => {
  const base = { userId: 'u1', role: 'influencer' as const, handle: 'priya', origin: ORIGIN };

  it('records a claim when the signup link is still in the bio', async () => {
    const { db, calls } = fakeDb({ claimStatus: null });
    const ok = await syncOwnershipFromBio(db, { ...base, bio: `hi ${MARKER}` });

    expect(ok).toBe(true);
    expect(calls.map((c) => c.fn)).toEqual(['initiate_social_claim', 'confirm_social_claim']);
    expect(calls[1].args.p_matched).toBe(true);
  });

  it('does not re-initiate an already verified claim', async () => {
    // initiate_social_claim resets a row to pending, so calling it on a
    // verified claim would un-verify the user on every verification run.
    const { db, calls } = fakeDb({ claimStatus: 'verified' });
    const ok = await syncOwnershipFromBio(db, { ...base, bio: 'no link here' });

    expect(ok).toBe(true);
    expect(calls).toEqual([]);
  });

  it('writes nothing when the link is absent', async () => {
    const { db, calls } = fakeDb({ claimStatus: null });
    const ok = await syncOwnershipFromBio(db, { ...base, bio: 'just a bio' });

    expect(ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it('does not claim someone else’s handle when the RPC refuses', async () => {
    const { db, calls } = fakeDb({
      claimStatus: null,
      initiateError: { message: 'This instagram account is already verified by another Influnet account' },
    });
    const ok = await syncOwnershipFromBio(db, { ...base, bio: `hi ${MARKER}` });

    expect(ok).toBe(false);
    expect(calls.map((c) => c.fn)).toEqual(['initiate_social_claim']);
  });

  it('reports unproven rather than throwing when there is no username yet', async () => {
    const { db } = fakeDb({ claimStatus: null, username: null });
    await expect(syncOwnershipFromBio(db, { ...base, bio: `hi ${MARKER}` })).resolves.toBe(false);
  });
});

describe('rescoreAfterOwnership', () => {
  it('flips the ownership item in the stored breakdown', async () => {
    const stored: VerificationSignals = {
      social_handles_live: { instagram: true },
      follower_count: 20_000,
      last_post_days_ago: 3,
      bio_matches_niche: true,
      platform_verified: true,
    };
    const before = scoreBreakdown('influencer', stored)
      .find((i) => i.label.includes('ownership'))!;
    expect(before.met).toBe(false);

    const { db, calls } = fakeDb({ latestSignals: stored });
    const out = await rescoreAfterOwnership(db, { userId: 'u1', role: 'influencer' });

    const submit = calls.find((c) => c.fn === 'submit_verification');
    expect(submit).toBeTruthy();
    const written = submit!.args.p_signals as VerificationSignals;
    expect(written.ownership_verified).toBe(true);

    const after = scoreBreakdown('influencer', written).find((i) => i.label.includes('ownership'))!;
    expect(after.met).toBe(true);
    // Strong metrics were being held in review purely by the ownership gate;
    // proving ownership has to release them without another full pipeline run.
    expect(out?.status).toBe('verified');
  });

  it('does nothing when there is no earlier check to re-score', async () => {
    const { db, calls } = fakeDb({ latestSignals: null });
    const out = await rescoreAfterOwnership(db, { userId: 'u1', role: 'influencer' });

    expect(out).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('bioContainsMarker · username prefix collision', () => {
  /**
   * Regression guard for an impersonation route that existed in the in-app
   * ownership check: a plain substring test let the marker for a SHORTER
   * username match a bio carrying a longer one. Registering `priya` was enough
   * to confirm ownership of the Instagram account belonging to `priyanka`, and
   * that claim is what gates the Verified badge.
   */
  it('refuses a marker that is only a prefix of the bio link', () => {
    const attacker = profileMarker(ORIGIN, 'priya');
    for (const victimBio of [
      'influnet.in/priyanka',
      'https://influnet.in/priyanka/',
      'Food creator · influnet.in/priyanka_official',
      'influnet.in/c/priyanka',
    ]) {
      expect(bioContainsMarker(victimBio, attacker), victimBio).toBe(false);
    }
  });

  it('still matches the real owner when text follows the link', () => {
    const marker = profileMarker(ORIGIN, 'priya');
    for (const bio of [
      'influnet.in/priya food & travel creator',
      'influnet.in/priya · Chennai',
      'book me: influnet.in/priya',
      'influnet.in/priya/',
    ]) {
      expect(bioContainsMarker(bio, marker), bio).toBe(true);
    }
  });
});

describe('bioLinksToUsername', () => {
  /**
   * The signup gate and the in-app reconciliation used to run different
   * matchers: signup accepted any Influnet host, the pipeline demanded the
   * request's own origin. So a creator whose bio read `influnet.io/vimal` was
   * let through signup on staging and then refused by the reconciliation, which
   * was looking for `staging.influnet.io/vimal` — proof accepted at the door and
   * rejected one minute later, which is exactly what "I already verified this"
   * looked like from the outside.
   */
  it('accepts the username on any Influnet host', () => {
    for (const bio of [
      'influnet.in/priya',
      'https://staging.influnet.io/priya',
      'www.influnet.io/priya',
      'dev.influnet.io/c/priya',
      'influnet.io/b/priya',
    ]) {
      expect(bioLinksToUsername(bio, 'priya'), bio).toBe(true);
    }
  });

  it('keeps the prefix guard that stops /priya claiming /priyanka', () => {
    expect(bioLinksToUsername('influnet.in/priyanka', 'priya')).toBe(false);
    expect(bioLinksToUsername('influnet.in/priya_official', 'priya')).toBe(false);
  });

  it('needs the username, not just the brand', () => {
    expect(bioLinksToUsername('I use influnet.in', 'priya')).toBe(false);
    expect(bioLinksToUsername('influnet.in/someoneelse', 'priya')).toBe(false);
  });

  it('survives what mobile keyboards paste', () => {
    expect(bioLinksToUsername('influnet.in​/priya', 'priya')).toBe(true);
    expect(bioLinksToUsername('influnet.in／priya', 'priya')).toBe(true);
    expect(bioLinksToUsername('INFLUNET.IN/PRIYA', 'priya')).toBe(true);
  });

  it('refuses a username that could carry regex metacharacters', () => {
    expect(bioLinksToUsername('influnet.in/anything', '.*')).toBe(false);
  });
});

describe('syncOwnershipFromBio · cross-host signup proof', () => {
  it('accepts the link the signup gate accepted, on a different host', async () => {
    // Bio written against production, account created on staging.
    const { db, calls } = fakeDb({ claimStatus: null });
    const ok = await syncOwnershipFromBio(db, {
      userId: 'u1',
      role: 'influencer',
      handle: 'priya',
      origin: 'https://staging.influnet.io',
      bio: 'Food creator · influnet.in/priya',
    });

    expect(ok).toBe(true);
    expect(calls.map((c) => c.fn)).toEqual(['initiate_social_claim', 'confirm_social_claim']);
  });

  it('still refuses a bio carrying somebody else’s username', async () => {
    const { db, calls } = fakeDb({ claimStatus: null });
    const ok = await syncOwnershipFromBio(db, {
      userId: 'u1',
      role: 'influencer',
      handle: 'priya',
      origin: 'https://staging.influnet.io',
      bio: 'Food creator · influnet.in/priyanka',
    });

    expect(ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('hasVerifiedInstagramClaim', () => {
  /**
   * The claim, not the last check's stored signals. Those two answer different
   * questions and drift apart the instant someone proves ownership — which is
   * the exact moment the answer is being asked for.
   */
  function claimDb(opts: { handle?: string | null; verifiedHandles?: string[] }) {
    const queries: Record<string, unknown>[] = [];
    const db = {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        };
        chain.maybeSingle = async () => ({
          data:
            opts.handle === undefined
              ? { instagram_handle: 'priya_ig' }
              : opts.handle === null
                ? null
                : { instagram_handle: opts.handle },
          error: null,
        });
        chain.limit = async () => {
          queries.push({ table, ...filters });
          const match = (opts.verifiedHandles ?? []).includes(String(filters.handle));
          return { data: match ? [{ handle: filters.handle }] : [], error: null };
        };
        return chain;
      },
      rpc: async () => ({ data: null, error: null }),
    };
    return { db, queries };
  }

  it('is true when the claim matches the handle on the profile', async () => {
    const { db } = claimDb({ verifiedHandles: ['priya_ig'] });
    await expect(hasVerifiedInstagramClaim(db, 'u1', 'influencer')).resolves.toBe(true);
  });

  it('is false when the profile has moved to a handle that was never proven', async () => {
    // Verifying @old and then editing the profile to @new proves nothing about
    // @new; reporting ownership here would hand the badge gate a free pass.
    const { db } = claimDb({ handle: 'new_handle', verifiedHandles: ['old_handle'] });
    await expect(hasVerifiedInstagramClaim(db, 'u1', 'influencer')).resolves.toBe(false);
  });

  it('normalises the profile handle before matching', async () => {
    const { db, queries } = claimDb({ handle: ' @Priya_IG ', verifiedHandles: ['priya_ig'] });
    await expect(hasVerifiedInstagramClaim(db, 'u1', 'influencer')).resolves.toBe(true);
    expect(queries[0].handle).toBe('priya_ig');
  });

  it('is false when there is no handle on the profile at all', async () => {
    const { db } = claimDb({ handle: null, verifiedHandles: ['priya_ig'] });
    await expect(hasVerifiedInstagramClaim(db, 'u1', 'influencer')).resolves.toBe(false);
  });

  it('reads the business profile for a business account', async () => {
    const { db, queries } = claimDb({ verifiedHandles: ['priya_ig'] });
    await hasVerifiedInstagramClaim(db, 'u1', 'business_owner');
    expect(queries[0].table).toBe('social_account_claims');
  });
});
