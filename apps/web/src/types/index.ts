export type UserRole = 'business_owner' | 'influencer' | 'admin';
export type ApprovalStatus = 'pending_review' | 'approved' | 'rejected';
export type ProjectStage =
  | 'collaboration_started'
  | 'project_discussion'
  | 'advance_payment'
  | 'content_planning'
  | 'content_confirmation'
  | 'shooting_in_progress'
  | 'editing_in_progress'
  | 'sent_for_review'
  | 'revisions'
  | 'final_approval'
  | 'final_payment'
  | 'project_completed';
export interface StageProgress {
  status: 'locked' | 'current' | 'completed' | 'skipped';
  started_at?: string | null;
  completed_at?: string | null;
  notes?: string;
  meeting_link?: string | null;
  deliverables?: { name: string; url: string; type: 'file' | 'link' }[];
  meeting_date?: string | null;
}

export type ConnectionStrength = 'new' | 'active' | 'trusted' | 'top';
export type CollabRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type AvailabilityStatus = 'open' | 'limited' | 'paused';
export type ProfileVisibility = 'public' | 'unlisted' | 'private';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          email: string;
          name: string;
          phone: string | null;
          location: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      business_profiles: {
        Row: {
          user_id: string;
          company_name: string;
          industry: string;
          business_type: string | null;
          gst_number: string | null;
          website: string | null;
          marketing_budget: string | null;
          registered_address: string | null;
          city: string | null;
          state: string | null;
          collab_preferences: string[] | null;
          approval_status: ApprovalStatus;
          username: string | null;
          logo_url: string | null;
          tagline: string | null;
          company_description: string | null;
          instagram_handle: string | null;
          facebook_handle: string | null;
          linkedin_handle: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['business_profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['business_profiles']['Insert']>;
      };
      influencer_profiles: {
        Row: {
          user_id: string;
          username: string;
          profile_slug: string | null;
          bio: string | null;
          niche: string[];
          avatar_url: string | null;
          gender: string | null;
          city: string | null;
          state: string | null;
          languages: string[];
          collab_types: string[];
          price_range: string | null;
          pricing_min: number | null;
          pricing_max: number | null;
          instagram_handle: string | null;
          facebook_handle: string | null;
          youtube_handle: string | null;
          twitter_handle: string | null;
          linkedin_handle: string | null;
          tiktok_handle: string | null;
          extra_social_links: string[] | null;
          instagram_followers: number | null;
          facebook_followers: number | null;
          youtube_subscribers: number | null;
          tiktok_followers: number | null;
          engagement_rate: number | null;
          media_kit_url: string | null;
          portfolio: { url: string; title?: string }[] | null;
          is_verified: boolean;
          headline: string | null;
          availability_status: AvailabilityStatus | null;
          onboarding_completed: boolean;
          onboarding_step: number | null;
          is_profile_complete: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['influencer_profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['influencer_profiles']['Insert']>;
      };
      collab_requests: {
        Row: {
          id: string;
          from_user_id: string;
          to_user_id: string;
          message: string;
          budget: number | null;
          status: CollabRequestStatus;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['collab_requests']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['collab_requests']['Insert']>;
      };
      conversations: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['conversations']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          user_id: string;
          last_read_at: string | null;
          joined_at: string;
        };
        Insert: Omit<Database['public']['Tables']['conversation_participants']['Row'], 'joined_at'>;
        Update: Partial<Database['public']['Tables']['conversation_participants']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_user_id: string;
          body: string;
          deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      campaign_projects: {
        Row: {
          id: string;
          owner_user_id: string;
          counterparty_user_id: string;
          title: string;
          description: string;
          budget: number | null;
          timeline: string | null;
          status: string;
          current_stage: ProjectStage;
          deliverables: string;
          stage_progress: Record<string, StageProgress>;
          history: any[];
          start_date: string | null;
          end_date: string | null;
          conversation_id: string | null;
          cancel_requested_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['campaign_projects']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['campaign_projects']['Insert']>;
      };
      connections: {
        Row: {
          id: string;
          user_id: string;
          connected_user_id: string;
          status: 'active' | 'removed';
          messages_count: number;
          projects_completed: number;
          relationship_status: ConnectionStrength;
          last_interaction_at: string;
          favorite: boolean;
          notes: string;
          connected_at: string;
        };
        Insert: Omit<Database['public']['Tables']['connections']['Row'], 'id' | 'connected_at'>;
        Update: Partial<Database['public']['Tables']['connections']['Insert']>;
      };
      user_presence: {
        Row: {
          user_id: string;
          last_seen_at: string | null;
          typing_conversation_id: string | null;
          typing_expires_at: string | null;
        };
        Insert: Database['public']['Tables']['user_presence']['Row'];
        Update: Partial<Database['public']['Tables']['user_presence']['Insert']>;
      };
    };
    Functions: {
      register_profile: {
        Args: { payload: Record<string, unknown> };
        Returns: void;
      };
      ensure_conversation: {
        Args: { other_user_id: string };
        Returns: string;
      };
      get_public_influencer: {
        Args: { p_slug: string };
        Returns: Record<string, unknown>;
      };
      get_public_business: {
        Args: { p_slug: string };
        Returns: Record<string, unknown>;
      };
      is_username_globally_taken: {
        Args: { p_username: string };
        Returns: boolean;
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface Profile {
  id: string;
  role: UserRole;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessProfile {
  user_id: string;
  company_name: string;
  industry: string;
  business_type: string | null;
  gst_number: string | null;
  website: string | null;
  marketing_budget: string | null;
  registered_address: string | null;
  city: string | null;
  state: string | null;
  collab_preferences: string[] | null;
  approval_status: ApprovalStatus;
  username: string | null;
  logo_url: string | null;
  tagline: string | null;
  company_description: string | null;
  instagram_handle: string | null;
  facebook_handle: string | null;
  linkedin_handle: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfluencerProfile {
  user_id: string;
  username: string;
  profile_slug: string | null;
  bio: string | null;
  niche: string[];
  avatar_url: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  languages: string[];
  collab_types: string[];
  price_range: string | null;
  pricing_min: number | null;
  pricing_max: number | null;
  instagram_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  twitter_handle: string | null;
  linkedin_handle: string | null;
  tiktok_handle: string | null;
  extra_social_links: string[] | null;
  instagram_followers: number | null;
  facebook_followers: number | null;
  youtube_subscribers: number | null;
  tiktok_followers: number | null;
  engagement_rate: number | null;
  media_kit_url: string | null;
  portfolio: { url: string; title?: string }[] | null;
  is_verified: boolean;
  headline: string | null;
  availability_status: AvailabilityStatus | null;
  onboarding_completed: boolean;
  onboarding_step: number | null;
  is_profile_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollabRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  budget: number | null;
  status: CollabRequestStatus;
  created_at: string;
  from_user?: CollabUser;
  to_user?: CollabUser;
}

export interface CollabUser {
  id: string;
  name: string | null;
  company_name: string | null;
  niche: string[];
  role: UserRole;
  display_role: string;
  username: string | null;
  avatar_url: string | null;
  verified: boolean;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  other_user?: ConversationParticipant;
  last_message?: Message;
  unread_count: number;
}

export interface ConversationParticipant {
  id: string;
  name: string;
  company_name: string | null;
  role: UserRole;
  display_role: string;
  username: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_online: boolean;
  is_typing: boolean;
  last_seen_at: string | null;
  availability_status: AvailabilityStatus | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  deleted: boolean;
  created_at: string;
  updated_at: string;
  sender?: ConversationParticipant;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export interface CampaignProject {
  id: string;
  owner_user_id: string;
  counterparty_user_id: string;
  title: string;
  description: string;
  budget: number | null;
  timeline: string | null;
  status: string;
  current_stage: ProjectStage;
  deliverables: string;
  start_date: string | null;
  end_date: string | null;
  conversation_id: string | null;
  cancel_requested_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: CollabUser;
  counterparty?: CollabUser;
}

export interface ProjectCard {
  id: string;
  project_id: string;
  stage_key: string;
  title: string;
  description: string;
  start_date: string | null;
  due_date: string | null;
  meeting_link: string | null;
  card_color: string | null;
  position: number;
  created_by: string;
  status: 'not_started' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface ProjectAsset {
  id: string;
  project_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_by: string;
  created_at: string;
}

export interface Connection {
  id: string;
  user_id: string;
  connected_user_id: string;
  status: 'active' | 'removed';
  messages_count: number;
  projects_completed: number;
  active_projects: number;
  relationship_status: ConnectionStrength;
  last_interaction_at: string;
  favorite: boolean;
  notes: string;
  connected_at: string;
  partner?: ConnectionProfile;
  strength_label: string;
  current_status: string;
}

export interface ConnectionProfile {
  id: string;
  role: UserRole;
  name: string | null;
  username: string | null;
  industry: string | null;
  category: string | null;
  location: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  is_verified: boolean;
}

export interface UserPresence {
  user_id: string;
  last_seen_at: string | null;
  is_online: boolean;
  typing_conversation_id: string | null;
  typing_expires_at: string | null;
}

export interface NotificationSummary {
  unread_messages_count: number;
  pending_requests_count: number;
}

export interface DashboardMetrics {
  total_connections: number;
  active_connections: number;
  completed_collaborations: number;
  profile_views_from_connections: number;
  saved_creators: number;
}

export interface InfluencerDashboard {
  profile: InfluencerProfile & Profile;
  stats: {
    profile_views: number;
    collab_requests: number;
    active_discussions: number;
    active_projects: number;
    saved_by_businesses: number;
  };
  trends: {
    views_change: number;
    requests_change: number;
    discussions_change: number;
    projects_change: number;
    saved_change: number;
  };
  recent_requests: CollabRequest[];
  recent_views: { viewer_id: string; viewed_at: string }[];
}

export interface BusinessDashboard {
  profile: BusinessProfile & Profile;
  stats: {
    saved_creators: number;
    requests_sent: number;
    requests_accepted: number;
    active_projects: number;
    project_spend: number;
    profile_views: number;
  };
  pipeline: {
    viewed: number;
    contacted: number;
    discussing: number;
    negotiation: number;
    active: number;
    completed: number;
  };
  insights: {
    acceptance_rate: number;
    response_label: string;
    top_categories: string[];
  };
  recent_activity: { type: string; description: string; timestamp: string }[];
  saved_creators: ConnectionProfile[];
  recent_views: { influencer_id: string; viewed_at: string }[];
}

export interface DiscoverFilters {
  search?: string;
  niche?: string[];
  location?: string;
  min_followers?: number;
  max_followers?: number;
  price_range?: string;
  collab_types?: string[];
  availability?: AvailabilityStatus;
  sort_by?: string;
  page?: number;
  limit?: number;
}

export interface PublicInfluencerProfile {
  id: string;
  name: string;
  username: string;
  profile_slug: string | null;
  avatar_url: string | null;
  bio: string | null;
  headline: string | null;
  niche: string[];
  location: string | null;
  city: string | null;
  state: string | null;
  languages: string[];
  collab_types: string[];
  price_range: string | null;
  pricing_min: number | null;
  pricing_max: number | null;
  instagram_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  twitter_handle: string | null;
  linkedin_handle: string | null;
  tiktok_handle: string | null;
  instagram_followers: number | null;
  facebook_followers: number | null;
  youtube_subscribers: number | null;
  tiktok_followers: number | null;
  engagement_rate: number | null;
  media_kit_url: string | null;
  portfolio: { url: string; title?: string }[] | null;
  is_verified: boolean;
  availability_status: AvailabilityStatus | null;
}

export interface PublicBusinessProfile {
  id: string;
  name: string;
  company_name: string;
  username: string | null;
  logo_url: string | null;
  tagline: string | null;
  company_description: string | null;
  industry: string | null;
  business_type: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  instagram_handle: string | null;
  facebook_handle: string | null;
  linkedin_handle: string | null;
  marketing_budget: string | null;
  collab_preferences: string[] | null;
  approval_status: ApprovalStatus;
}
