/**
 * The creator's portfolio, for the public profile.
 *
 * Reads the same get_creator_portfolio RPC (migration 087) the creator's own
 * app calls, so what a brand sees on /c/[username] and what the creator sees on
 * their Profile tab cannot drift apart — the two disagreeing about a creator's
 * own work is the fastest way to make both look untrustworthy.
 */
import { logger as log } from '../logger';

export interface PublicPortfolioItem {
  id: string;
  /** 'platform' entries are completed Influnet projects; 'manual' are self-added. */
  source: 'manual' | 'platform';
  /** Derived from source by the RPC — never a creator-writable field. */
  verified: boolean;
  title: string;
  brandName: string | null;
  description: string | null;
  platform: 'instagram' | 'youtube' | 'other';
  contentUrl: string | null;
  thumbnailUrl: string | null;
  views: number | null;
  happenedAt: string | null;
}

export async function getCreatorPortfolio(
  supabase: any,
  userId: string,
): Promise<PublicPortfolioItem[]> {
  try {
    const { data, error } = await supabase.rpc('get_creator_portfolio', {
      p_user_id: userId,
      p_limit: 24,
    });

    // A database that has not had 087 applied yet renders an empty portfolio
    // section rather than a 500 on somebody's public profile.
    if (error || !Array.isArray(data)) {
      if (error) log.warn('portfolio rpc unavailable', { err: error.message });
      return [];
    }

    return data.map((row: any) => {
      // Anything that is not explicitly a platform row is manual. Defaulting
      // the OTHER way would make an unrecognised source render as verified.
      const source: 'manual' | 'platform' = row.source === 'platform' ? 'platform' : 'manual';

      return {
      id: String(row.id),
      source,
      /**
       * Re-derived from the source rather than trusted from the payload.
       * The RPC computes it correctly today, but `verified` is one careless
       * edit away from being selected off the table — at which point a
       * creator-writable column would decide who gets the trust mark. That is
       * exactly the hole migration 083 closed for the profile badge, and it
       * costs one boolean to make it un-repeatable here.
       */
      verified: source === 'platform',
      title: String(row.title ?? 'Untitled'),
      brandName: row.brand_name ?? null,
      description: row.description ?? null,
      platform: ['instagram', 'youtube'].includes(row.platform) ? row.platform : 'other',
      contentUrl: row.content_url ?? null,
      thumbnailUrl: row.thumbnail_url ?? null,
      views: row.views != null ? Number(row.views) : null,
      happenedAt: row.happened_at ?? null,
      };
    });
  } catch (err: any) {
    log.warn('portfolio lookup failed', { err: err?.message });
    return [];
  }
}
