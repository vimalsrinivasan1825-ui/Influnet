// Live-data enrichment for verification.
//
// `buildSignals()` (verification-scraper.ts) is pure/structural — it validates
// the SHAPE of what the user submitted. This module adds the REAL-WORLD layer:
// it asks HikerAPI whether the submitted Instagram handle actually exists, how
// many followers it really has, whether Instagram itself verifies it, and how
// recently it posted — then folds those facts into the same `VerificationSignals`
// the pure scorer (`decide()`) already understands.
//
// INVARIANTS
//  - Never throws. Any provider failure (no HikerAPI credit → 402, bad key → 401,
//    network, rate-limit) degrades to structural-only signals + a `live_check_unavailable`
//    flag, which pushes the decision to human review instead of crashing.
//  - Only touches the user's OWN submitted handle.
//  - The heavy lifting (scoring) stays in verification.ts; this only produces signals.

import type { Role, VerificationSignals } from './verification';
import {
  fetchInstagramProfile,
  isInstagramProviderConfigured,
  activeProvider,
  normalizeHandle,
  InstagramProviderError,
} from './instagram';

export interface LiveInput {
  instagram_handle?: string | null;
  // creator's self-reported follower count (used to detect inflation)
  instagram_followers?: number | null;
}

// A claimed count this many times larger than reality trips the inflation flag.
const INFLATION_RATIO = 3;
const INFLATION_FLOOR = 5_000; // ignore small accounts where ratios are noisy

function dedupeFlags(flags: string[]): string[] {
  return Array.from(new Set(flags.filter(Boolean)));
}

/**
 * Enrich structural signals with live Instagram data. Returns a NEW signals
 * object (input is not mutated) plus a short human-readable note for admins.
 */
export async function enrichWithLiveData(
  role: Role,
  input: LiveInput,
  baseSignals: VerificationSignals,
): Promise<{ signals: VerificationSignals; note: string | null }> {
  const signals: VerificationSignals = {
    ...baseSignals,
    social_handles_live: { ...(baseSignals.social_handles_live ?? {}) },
    flags: [...(baseSignals.flags ?? [])],
  };

  const handle = normalizeHandle(input.instagram_handle);

  // No handle to check, or provider not configured → structural only.
  if (!handle) {
    signals.live = { provider: 'none', status: 'skipped' };
    return { signals, note: null };
  }
  if (!isInstagramProviderConfigured()) {
    signals.live = { provider: 'none', status: 'skipped' };
    signals.flags = dedupeFlags([...(signals.flags ?? []), 'live_check_not_configured']);
    return { signals, note: 'Live verification provider not configured — structural signals only.' };
  }

  const providerName = activeProvider();
  try {
    const user = await fetchInstagramProfile(handle);

    if (!user) {
      // The handle does not resolve to a real Instagram account — suspicious.
      signals.social_handles_live = { ...signals.social_handles_live, instagram: false };
      signals.flags = dedupeFlags([...(signals.flags ?? []), 'instagram_handle_not_found']);
      signals.live = {
        provider: providerName,
        status: 'not_found',
        instagram: { handle, found: false, follower_count: null, is_verified: false, is_private: false, last_post_days_ago: null },
      };
      return { signals, note: `Instagram @${handle} did not resolve to a real account.` };
    }

    // Real account confirmed live.
    signals.social_handles_live = { ...signals.social_handles_live, instagram: true };
    signals.follower_count = user.followerCount ?? signals.follower_count;
    signals.platform_verified = user.isVerified || signals.platform_verified;

    // Recency: providers that return it inline (Apify) fill user.lastPostDaysAgo;
    // otherwise the selector already made the follow-up call.
    const lastPostDays = user.lastPostDaysAgo ?? null;
    if (lastPostDays != null) signals.last_post_days_ago = lastPostDays;

    // Real audience data now exists → drop the structural "no audience" flag.
    const flags = (signals.flags ?? []).filter((f) => f !== 'no_audience_data_found' && f !== 'no_social_handles');

    // Inflation check: a self-reported count wildly above reality is a red flag.
    const claimed = input.instagram_followers ?? 0;
    const real = user.followerCount ?? 0;
    if (claimed >= INFLATION_FLOOR && real > 0 && claimed > real * INFLATION_RATIO) {
      flags.push('follower_count_inflated');
    }
    if (user.isPrivate) flags.push('instagram_private'); // informational, not fraud
    signals.flags = dedupeFlags(flags);

    signals.live = {
      provider: providerName,
      status: 'ok',
      instagram: {
        handle,
        found: true,
        follower_count: user.followerCount,
        is_verified: user.isVerified,
        is_private: user.isPrivate,
        last_post_days_ago: lastPostDays,
      },
    };

    const parts = [`@${handle}: ${real.toLocaleString()} followers`];
    if (user.isVerified) parts.push('IG-verified');
    if (lastPostDays != null) parts.push(`last post ${lastPostDays}d ago`);
    return { signals, note: parts.join(' · ') };
  } catch (err) {
    // Provider unavailable (402/401/429/network) → keep structural signals,
    // flag it, and let decide() escalate to a human. Product access is untouched.
    const kind = err instanceof InstagramProviderError ? err.kind : 'unknown';
    signals.flags = dedupeFlags([...(signals.flags ?? []), 'live_check_unavailable']);
    signals.live = {
      provider: providerName,
      status: 'unavailable',
      instagram: { handle, found: false, follower_count: null, is_verified: false, is_private: false, last_post_days_ago: null, error: kind },
    };
    const human =
      kind === 'insufficient_funds'
        ? 'Live check unavailable: provider credit/balance exhausted.'
        : kind === 'unauthorized'
          ? 'Live check unavailable: provider rejected the credentials.'
          : `Live check unavailable (${kind}).`;
    return { signals, note: human };
  }
}

/** Roles whose Instagram handle we can enrich (both, when a handle is present). */
export function supportsLiveEnrichment(role: Role): boolean {
  return role === 'influencer' || role === 'business_owner';
}
