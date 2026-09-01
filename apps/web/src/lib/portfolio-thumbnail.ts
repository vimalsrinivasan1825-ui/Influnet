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
 * ── AND WHEN IT ISN'T OURS: THE /media/ REDIRECT ──────────────────────
 *
 * The snapshot only holds a creator's most recent posts, and "past work" is
 * frequently older than that — measured on live data 2026-08-29, both
 * Instagram entries on this instance were outside the window and both drew the
 * grey tile, while the YouTube entry beside them had real art. So the snapshot
 * alone was never going to be enough.
 *
 * `instagram.com/p/<code>/media/?size=l` closes the gap. It is not a page and
 * not a scrape: it answers 302 with a `Location` pointing straight at the
 * post's image on Instagram's CDN, and 404 for a code that doesn't resolve.
 * Verified 2026-08-29 against both stranded posts, one of them from 2023 — a
 * valid JPEG in each case.
 *
 * Two things this must do, and both are load-bearing:
 *
 *   1. Follow the redirect MANUALLY and check the target's host. We construct
 *      the instagram.com URL ourselves (see the SSRF note in
 *      lib/portfolio-link.ts), but a redirect target is a URL somebody else
 *      chose, and following it blindly would hand that guarantee back.
 *   2. Store OUR OWN COPY, never the CDN link. Those URLs carry a signed
 *      expiry — persisting one yields a card that works this week and is
 *      broken by the time anyone looks at the profile.
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
 * So do not re-add THAT scraper expecting it to work. The /media/ endpoint
 * above is a different thing entirely — a redirect, not a document — which is
 * why it survives where parsing the embed HTML does not.
 *
 * A post we still cannot find a picture for keeps the branded tile the grid has
 * always drawn — see Thumb() in the portfolio grids. Every failure path here
 * ends in that tile rather than in an error.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger as log } from './logger';
import { cacheSocialImage, socialCachePublicUrl } from './social-snapshot';

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
 * Best-effort thumbnail for one Instagram post: the creator's own cached
 * snapshot first, then the /media/ redirect. Never throws — a portfolio entry
 * without a picture is a worse card, not a failed save.
 *
 * The snapshot lookup is scoped to the caller's OWN snapshot on purpose.
 * Looking the shortcode up across every creator would let someone paste a
 * rival's post and have its thumbnail attached to their own portfolio card — a
 * small lie the grid would present as fact. The redirect below carries no such
 * risk: it reads the post the creator actually linked to, which is public and
 * is the very thing their card claims to show.
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

    // No snapshot at all is the normal state for a creator who has never run
    // verification, and it used to end the search here — which meant the
    // feature only worked for people who had already connected Instagram.
    // Every one of these is now a reason to fall through, not to give up.
    const posts = (!error && data ? data.recent_posts ?? [] : []) as SnapshotPost[];

    const hit = Array.isArray(posts) ? posts.find((p) => p?.shortcode === shortcode) : undefined;
    if (hit) {
      // thumb_path is ours and permanent; thumb_url is the provider's, and is
      // only ever set by platforms whose URLs don't expire (captureSocialSnapshot).
      if (hit.thumb_path) return socialCachePublicUrl(hit.thumb_path);
      if (hit.thumb_url) return hit.thumb_url;
    }
  } catch (err) {
    log.warn('instagram thumbnail resolution failed', {
      shortcode,
      err: err instanceof Error ? err.message : String(err),
    });
    // Fall through — a snapshot that could not be read is a reason to try the
    // redirect, not a reason to give up.
  }

  return fromMediaRedirect(userId, shortcode);
}

/** Hosts Instagram serves post images from. Nothing else is followed. */
const INSTAGRAM_CDN_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

/** A desktop UA — the endpoint answers a bare fetch inconsistently without one. */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const REDIRECT_TIMEOUT_MS = 8_000;

/**
 * Resolve a post's picture through Instagram's /media/ redirect and keep a copy.
 *
 * Best-effort by construction — see the header. Every branch that isn't a clean
 * success returns null, which leaves the caller with the branded tile it drew
 * before this existed.
 *
 * The cache path deliberately matches the snapshot pipeline's
 * (`ig/<user>/<shortcode>.jpg`), so if this post later lands inside the
 * snapshot window the refresh overwrites the same object rather than orphaning
 * this one.
 */
async function fromMediaRedirect(userId: string, shortcode: string): Promise<string | null> {
  try {
    // Built here from a shortcode already matched against INSTAGRAM_CODE — no
    // part of the pasted URL reaches this string.
    const res = await fetch(`https://www.instagram.com/p/${shortcode}/media/?size=l`, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept: 'image/*,*/*' },
      signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
      cache: 'no-store',
    });

    // 404 for a code that resolves to nothing; 200 would mean a page, not an
    // image, which is the login/consent wall and not something to parse.
    const location = res.status === 301 || res.status === 302 ? res.headers.get('location') : null;
    if (!location) return null;

    let target: URL;
    try {
      target = new URL(location);
    } catch {
      return null;
    }
    // The guarantee from lib/portfolio-link.ts is that we choose every host we
    // talk to. This is where that has to be re-established by hand.
    if (target.protocol !== 'https:' || !INSTAGRAM_CDN_HOST.test(target.hostname)) return null;

    const path = await cacheSocialImage(target.toString(), `ig/${userId}/${shortcode}.jpg`);
    return path ? socialCachePublicUrl(path) : null;
  } catch (err) {
    log.warn('instagram media redirect lookup failed', {
      shortcode,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
