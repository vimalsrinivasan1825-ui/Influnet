// Data contracts shared between the live dashboard pages and the UI preview.

export interface InfluencerHomeData {
  profile: {
    name: string;
    // Null when the creator hasn't picked a username yet — never a slug
    // guessed from their display name, which routinely doesn't match the
    // real /c/[username] row and hands out a link that 404s.
    username: string | null;
    niche: string[];
    verified_badge: boolean;
    headline: string | null;
    avatar_url: string | null;
    bio: string | null;
    location: string | null;
    /**
     * Whether the signup welcome card has already been shown to this ACCOUNT.
     * Undefined when migration 074 is not applied yet.
     */
    welcome_seen?: boolean;
  };
  stats: {
    collab_requests: number;
    active_discussions: number;
    active_projects: number;
    completed_projects: number;
    // Budget of AGREED, in-progress projects (status='active') — not the
    // brand's opening ask on every conversation accepting a request ever
    // opened, which may represent nothing more than a polite reply.
    pipeline_value: number;
    completed_value?: number;
    // Terms a brand proposed that are waiting on THIS creator's response —
    // the one thing genuinely blocked on them, previously invisible here.
    proposals_awaiting_you: number;
  };
  // Real payments received (project_payments, status='paid'), not requests exchanged.
  earnings_trend: { week: string; amount: number }[];
  /**
   * The same money as earnings_trend, reshaped one series per brand instead of
   * one total — see lib/earnings-buckets.ts. Optional: an older backend omits
   * these three fields, and the chart falls back to the single-series trend.
   */
  earnings_by_brand?: Record<string, number | string>[];
  earnings_series?: { key: string; label: string }[];
  earnings_range?: "week" | "month" | "year";
  request_breakdown: { name: string; value: number; fill: string }[];
  recent_collabs:
    | { id: string; name: string; amount: string; status: string; sender_id: string }[]
    | null;
  active_roster:
    | { id: number | string; brand_name: string; project_title: string; status?: string; budget?: number }[]
    | null;
}

export interface BusinessHomeData {
  profile: { name: string; company_name: string; industry: string };
  stats: {
    active_collabs_count: number;
    completed_collabs_count: number;
    pending_collabs_count: number;
    pipeline_value: number;
    completed_value?: number;
  };
  weekly_spend: { week: string; spend: number }[];
  /** Same reshape as InfluencerHomeData's earnings_by_brand, one series per creator. */
  earnings_by_brand?: Record<string, number | string>[];
  earnings_series?: { key: string; label: string }[];
  earnings_range?: "week" | "month" | "year";
  pipeline_data: { name: string; value: number; fill: string }[];
  recent_collabs:
    | {
        id: string;
        name: string;
        amount: string;
        status: string;
        platform: string;
        reach: string;
      }[]
    | null;
}

export interface AdminHomeData {
  total_users: number;
  total_businesses: number;
  total_influencers: number;
  pending_approvals: number;
  total_collabs: number;
  active_collabs: number;
  pending_collabs: number;
  active_projects: number;
  completed_projects: number;
}
