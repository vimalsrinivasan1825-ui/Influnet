// Data contracts shared between the live dashboard pages and the UI preview.

export interface InfluencerHomeData {
  profile: {
    name: string;
    username: string;
    niche: string[];
    is_verified: boolean;
    headline: string | null;
    avatar_url: string | null;
    bio: string | null;
    location: string | null;
  };
  stats: {
    collab_requests: number;
    active_discussions: number;
    active_projects: number;
    completed_projects: number;
    total_earnings: number;
  };
  earnings_trend: { week: string; amount: number }[];
  request_breakdown: { name: string; value: number; fill: string }[];
  recent_collabs:
    | { id: string; name: string; amount: string; status: string; sender_id: string }[]
    | null;
}

export interface BusinessHomeData {
  profile: { name: string; company_name: string; industry: string };
  stats: {
    active_collabs_count: number;
    completed_collabs_count: number;
    pending_collabs_count: number;
    total_budget_sum: number;
  };
  weekly_spend: { week: string; spend: number }[];
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
