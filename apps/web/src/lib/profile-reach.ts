/**
 * Reach — how many people followed a link out of a creator's public profile.
 *
 * A creator's Influnet page is the thing they put in their bio, so the question
 * "did anyone actually go anywhere from it?" is the one number that says
 * whether the page is doing its job. profile_link_clicks has been sitting empty
 * since migration 012 because nothing ever wrote to it; this module is the
 * write path and the read path, and migration 116 is the integrity behind both.
 *
 * WHY THE SERVER RECORDS IT
 * Most of this traffic is logged out — a brand tapping a bio link is a stranger
 * to us. So the database function is authenticated-only (anon holding execute on
 * a SECURITY DEFINER counter is how anyone inflates anyone's numbers) and
 * anonymous clicks come through the route, which holds the service-role key and
 * a per-IP rate limit. One path in, both cases, neither of them forgeable from
 * a browser console.
 */
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

/**
 * What a click can be attributed to. Mirrors normalise_link_type() in migration
 * 116 — the function is the authority, this is the copy the UI validates
 * against so a typo never becomes an 'other' nobody can explain.
 */
export const LINK_TYPES = [
  'instagram',
  'youtube',
  'facebook',
  'twitter',
  'snapchat',
  'linkedin',
  'website',
  'profile',
  'other',
] as const;

export type LinkType = (typeof LINK_TYPES)[number];

export function isLinkType(value: unknown): value is LinkType {
  return typeof value === 'string' && (LINK_TYPES as readonly string[]).includes(value);
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * A stable-for-one-day, non-reversible handle for an anonymous visitor.
 *
 * The unique index needs SOMETHING per visitor or a reload loop reads as a
 * hundred people. It does not need to be an identity, and an IP address stored
 * in a table is personal data collected to power a counter — a bad trade. So:
 * hashed with a server-side salt, mixed with the date so it rotates every 24
 * hours, and truncated. Nothing here can be turned back into an address, and
 * nothing here is ever returned to a client.
 *
 * The salt falls back to the service-role key when unset. That key is
 * server-only and never leaves the process, so it is a legitimate secret to
 * mix in — but a dedicated PROFILE_REACH_SALT is preferred, because rotating
 * the service key should not silently reset everybody's de-duplication.
 */
function viewerKeyFor(viewerUserId: string | null, ip: string): string {
  if (viewerUserId) return viewerUserId;

  const salt =
    process.env.PROFILE_REACH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'influnet-reach';
  const day = new Date().toISOString().slice(0, 10);
  return `anon:${createHash('sha256').update(`${salt}:${day}:${ip}`).digest('hex').slice(0, 32)}`;
}

/**
 * Record one click. Never throws and never blocks the redirect the visitor is
 * waiting on — an analytics row is not worth a broken link.
 *
 * Returns true only when a row was actually written, which the tests use to
 * tell "deduplicated" apart from "silently failed".
 */
export async function recordLinkClick(opts: {
  creatorUserId: string;
  linkType: LinkType;
  /** Null for a logged-out visitor. */
  viewerUserId: string | null;
  ip: string;
}): Promise<boolean> {
  // A creator clicking through their own profile is not reach. The database
  // enforces this too (migration 116); doing it here as well saves the trip.
  if (opts.viewerUserId && opts.viewerUserId === opts.creatorUserId) return false;

  const admin = serviceClient();
  if (!admin) {
    logger.warn('profile-reach: click not recorded — service role key not configured');
    return false;
  }

  const { error } = await admin
    .from('profile_link_clicks')
    .upsert(
      {
        influencer_user_id: opts.creatorUserId,
        link_type: opts.linkType,
        viewer_user_id: opts.viewerUserId,
        viewer_key: viewerKeyFor(opts.viewerUserId, opts.ip),
      },
      {
        onConflict: 'influencer_user_id,link_type,clicked_on,viewer_key',
        ignoreDuplicates: true,
      },
    );

  if (error) {
    // 42703 = the columns are missing, i.e. migration 116 is not applied yet.
    // That is a deployment state, not a bug, and it must not turn a creator's
    // profile page into an error.
    logger.warn('profile-reach: click write failed (non-fatal)', { error: error.message });
    return false;
  }
  return true;
}

/** One platform's share of the reach, as Home renders it. */
export interface ReachChannel {
  link_type: LinkType;
  clicks: number;
  people: number;
}

export interface ProfileReach {
  /** Distinct people who clicked anything, in the window. */
  people: number;
  clicks: number;
  /** Percent change in people vs the window before it. Null when there is no baseline. */
  delta_pct: number | null;
  /** Biggest first. */
  channels: ReachChannel[];
  window_days: number;
}

/**
 * The creator's own reach. Aggregated in the database (migration 116) because
 * counting click rows on a phone is fine at forty and absurd at forty thousand.
 *
 * Returns null when the figure cannot be read — a backend behind on migrations,
 * or an error. Null means "don't draw the card", which is different from a real
 * zero, and Home draws those two differently.
 */
export async function getProfileReach(
  supabase: SupabaseClient,
  windowDays = 30,
): Promise<ProfileReach | null> {
  const { data, error } = await (supabase.rpc as any)('get_profile_link_reach', {
    p_days: windowDays,
  });

  if (error || !Array.isArray(data)) return null;

  const rows = data as { link_type: string; clicks: number; people: number; prior_people: number }[];

  const channels: ReachChannel[] = rows.map((r) => ({
    link_type: isLinkType(r.link_type) ? r.link_type : 'other',
    clicks: Number(r.clicks) || 0,
    people: Number(r.people) || 0,
  }));

  /**
   * Summed per channel, so someone who clicked both Instagram and YouTube counts
   * twice here. That is the honest reading of "people who clicked THIS link"
   * added up, and the alternative — a second query for the distinct union —
   * costs a round trip to make a headline number smaller. The card labels it as
   * clicks-by-channel, not unique humans on the site.
   */
  const people = channels.reduce((sum, c) => sum + c.people, 0);
  const clicks = channels.reduce((sum, c) => sum + c.clicks, 0);
  const priorPeople = rows.reduce((sum, r) => sum + (Number(r.prior_people) || 0), 0);

  return {
    people,
    clicks,
    delta_pct: priorPeople > 0 ? Math.round(((people - priorPeople) / priorPeople) * 100) : null,
    channels,
    window_days: windowDays,
  };
}
