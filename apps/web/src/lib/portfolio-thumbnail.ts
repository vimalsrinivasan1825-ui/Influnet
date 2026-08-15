/**
 * Finding a picture for an Instagram post a creator pasted into their portfolio.
 *
 * Instagram hands out no thumbnail to an unauthenticated caller — oEmbed has
 * needed a Facebook app token since 2020 — so portfolio cards for Instagram
 * were permanent grey placeholders while YouTube cards showed real art.
 *
 * The way out is that WE ALREADY HAVE THE PICTURE. The verification/refresh
 * pipeline downloads the images for a creator's recent posts into the
 * social-cache bucket and records the shortcode against each one (see
 * captureInstagramSnapshot). If the pasted post is one of those, the image is
 * already ours: no network call, no rate limit, no expiry, and no scraping.
 * That covers the common case, because the work a creator adds is usually work
 * they have just published.
 *
 * ── WHAT WAS TRIED AND DOES NOT WORK ──────────────────────────────────
 *
 * instagram.com/p/<code>/embed/captioned/ — the endpoint that powers
 * third-party post embeds — was implemented as a fallback for older posts and
 * removed after being measured. It answers 200 to a plain server fetch, but the
 * ~600KB it returns is a client-rendered shell (`PolarisEmbed`): no og:image,
 * no display_url, no <img> but a base64 spinner. Tested 2026-08-13 against
 * three real public posts, from a residential IP, with a desktop UA — all
 * three returned the shell. It is not a login wall and not an IP-reputation
 * problem; the image simply is not in the HTML any more.
 *
 * So do not re-add a scraper here expecting it to work. The only remaining
 * route for a post older than the snapshot window is a paid single-post fetch
 * through the Apify provider, which is a cost decision, not a code one.
 *
 * A post we cannot find a picture for keeps the branded tile the grid has
 * always drawn — see Thumb() in the portfolio grids.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger as log } from './logger';
import { socialCachePublicUrl } from './social-snapshot';

/** Restated from lib/portfolio-link.ts — nothing downstream re-validates it. */
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,32}$/;

/** One recent post as captureInstagramSnapshot writes it. */
interface SnapshotPost {
  shortcode?: string | null;
  /** Path inside social-cache — Instagram's capture path stores this. */
  thumb_path?: string | null;
  /** Provider-hosted URL — the generic capture path stores this instead. */
  thumb_url?: string | null;
}

/**
 * Best-effort thumbnail for one Instagram post, from the creator's own cached
 * snapshot. Never throws: a portfolio entry without a picture is a worse card,
 * not a failed save.
 *
 * Scoped to the caller's OWN snapshot on purpose. Looking the shortcode up
 * across every creator would let someone paste a rival's post and have its
 * thumbnail attached to their own portfolio card — a small lie the grid would
 * present as fact.
 */
export async function resolveInstagramThumbnail(
  supabase: SupabaseClient,
  userId: string,
  shortcode: string,
): Promise<string | null> {
  if (!INSTAGRAM_CODE.test(shortcode)) return null;

  try {
    const { data, error } = await supabase
      .from('social_snapshots')
      .select('recent_posts')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .maybeSingle();

    if (error || !data) return null;

    const posts = (data.recent_posts ?? []) as SnapshotPost[];
    if (!Array.isArray(posts)) return null;

    const hit = posts.find((p) => p?.shortcode === shortcode);
    if (!hit) return null;

    // thumb_path is ours and permanent; thumb_url is the provider's, and is
    // only ever set by platforms whose URLs don't expire (captureSocialSnapshot).
    if (hit.thumb_path) return socialCachePublicUrl(hit.thumb_path);
    return hit.thumb_url ?? null;
  } catch (err) {
    log.warn('instagram thumbnail resolution failed', {
      shortcode,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
