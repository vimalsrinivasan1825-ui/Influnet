/**
 * Signup-completion gate: a creator who hasn't proven ownership of their
 * Instagram handle (the bio-link handshake — social_account_claims, 058) is
 * blocked from creator-to-business actions until they do. Business owners
 * are not subject to this — their own approval_status gate is separate.
 *
 * Defaults OFF, same reasoning as phone-otp.ts: flipping this on the moment
 * it ships would instantly restrict every existing creator who signed up
 * before ownership verification existed as a concept. Turn it on
 * deliberately once the signup flow change (Instagram step moved last) has
 * actually shipped and creators have had a chance to complete it.
 */
import type { NextResponse } from 'next/server';
import { jsonError } from './api';
import { flag } from './feature-flags';

/**
 * Resolved from the `feature_flags` table (migration 137), falling back to the
 * `OWNERSHIP_GATE_ENABLED` env var.
 */
export function ownershipGateEnabled(): boolean {
  return flag('ownership_gate');
}

/**
 * Call after withAuth() for an action a creator is initiating toward another
 * user (a collab request, a message, accepting a project). Returns null when
 * the action may proceed; otherwise the 403 to return as-is.
 */
export async function requireVerifiedOwnership(
  supabase: any,
  user: { id: string },
  role: string | null | undefined,
): Promise<NextResponse | null> {
  if (!ownershipGateEnabled()) return null;
  if (role !== 'influencer') return null;

  const { data: verified, error } = await supabase.rpc('has_verified_instagram_ownership', {
    p_user_id: user.id,
  });
  // Fail open on a provider hiccup — a broken RPC call should never be the
  // reason a legitimate, already-verified creator gets locked out.
  if (error) return null;

  if (!verified) {
    return jsonError(
      403,
      'Verify that you own your Instagram account before doing this — add your Influnet link to your Instagram links and confirm it in Verification.',
    );
  }
  return null;
}
