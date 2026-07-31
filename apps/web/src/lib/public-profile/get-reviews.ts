// Public rating summary for a user, via the get_public_reviews RPC (migration
// 080). Restricted server-side to reviews attached to COMPLETED projects, so a
// cancelled collaboration can't keep advertising a rating.

import { createClient } from '@supabase/supabase-js';
import type { ReviewSummary } from './creator-profile';

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function getPublicReviews(userId: string, limit = 6): Promise<ReviewSummary | null> {
  // Cast: this RPC is newer than the generated Supabase types.
  const { data, error } = await (supabaseAnon.rpc as any)('get_public_reviews', {
    p_user_id: userId,
    p_limit: limit,
  });
  // A missing RPC (migration not yet applied) must degrade to "no reviews
  // section", never to a broken profile page.
  if (error || !data) return null;

  const raw = data as {
    count?: number;
    average?: number | string | null;
    items?: {
      id: string;
      rating: number;
      comment: string | null;
      reviewer_name: string | null;
      created_at: string | null;
    }[];
  };

  const count = Number(raw.count ?? 0);
  if (!Number.isFinite(count) || count <= 0) return null;

  return {
    count,
    average: raw.average != null ? Number(raw.average) : null,
    items: (raw.items ?? []).map((r) => ({
      id: String(r.id),
      rating: Number(r.rating) || 0,
      comment: r.comment?.trim() || null,
      reviewerName: r.reviewer_name?.trim() || 'A brand',
      createdAt: r.created_at ?? null,
    })),
  };
}
