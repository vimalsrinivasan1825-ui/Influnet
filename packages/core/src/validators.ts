import { z } from 'zod';

// Usernames become public URLs (/c/<username>, /b/<username>) — block anything
// that collides with app routes or impersonates the platform.
const RESERVED_USERNAMES = new Set([
  'admin', 'api', 'app', 'b', 'c', 'business', 'connections', 'creator',
  'dashboard', 'discover', 'help', 'influnet', 'login', 'logout', 'mail',
  'messages', 'official', 'profile', 'projects', 'requests', 'reset-password',
  'root', 'settings', 'setup', 'signup', 'support', 'system', 'team', 'www',
]);

export const UsernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers and underscores are allowed')
  .refine((u) => !RESERVED_USERNAMES.has(u), 'This username is reserved');

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  role: z.enum(['business_owner', 'influencer']),
  companyName: z.string().optional(),
  industry: z.string().optional(),
  gstNumber: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  location: z.string().optional(),
  collabPreferences: z.array(z.string()).optional(),
  bio: z.string().optional(),
  niche: z.array(z.string()).optional(),
  username: UsernameSchema.optional(),
  instagramHandle: z.string().optional(),
  youtubeHandle: z.string().optional(),
  twitterHandle: z.string().optional(),
  facebookHandle: z.string().optional(),
  linkedinHandle: z.string().optional(),
  tiktokHandle: z.string().optional(),
  gender: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  languages: z.array(z.string()).optional(),
  collabTypes: z.array(z.string()).optional(),
  priceRange: z.string().optional(),
  businessType: z.string().optional(),
  marketingBudget: z.string().optional(),
  registeredAddress: z.string().optional(),
});

// Server-side guard for the register_profile RPC payload.
// Note: email/password are NOT part of this body — they go to supabase.auth.signUp separately.
// The critical field is `role` — it must NEVER be 'admin'. .passthrough() preserves any
// additional fields the RPC reads without silently dropping them.
export const RegisterProfileSchema = z.object({
  role: z.enum(['business_owner', 'influencer']),  // 'admin' is deliberately excluded
  name: z.string().min(1),
  phone: z.string().optional(),
  // business fields
  companyName: z.string().optional(),
  businessType: z.string().optional(),
  industry: z.string().optional(),
  website: z.string().optional(),
  gstNumber: z.string().optional(),
  registeredAddress: z.string().optional(),
  marketingBudget: z.string().optional(),
  businessUsername: z.string().optional(),
  // NOTE: approvalStatus is deliberately NOT accepted here — approval is
  // server-authoritative (admin flow / register_profile always inserts
  // 'pending_review'). The register route also strips it defensively because
  // this schema uses .passthrough().
  collabPreferences: z.array(z.string()).optional(),
  instagramHandle: z.string().optional(),
  facebookHandle: z.string().optional(),
  linkedinHandle: z.string().optional(),
  // influencer fields
  username: z.string().optional(),
  bio: z.string().optional(),
  niche: z.array(z.string()).optional(),
  gender: z.string().optional(),
  youtubeHandle: z.string().optional(),
  twitterHandle: z.string().optional(),
  tiktokHandle: z.string().optional(),
  languages: z.array(z.string()).optional(),
  collabTypes: z.array(z.string()).optional(),
  priceRange: z.string().optional(),
  instagramFollowers: z.number().optional(),
  facebookFollowers: z.number().optional(),
  youtubeSubscribers: z.number().optional(),
  tiktokFollowers: z.number().optional(),
  extraSocialLinks: z.array(z.string()).optional(),
  // shared / location
  city: z.string().optional(),
  state: z.string().optional(),
  location: z.string().optional(),
}).passthrough().superRefine((data, ctx) => {
  if (data.role === 'influencer') {
    const handles = [
      data.instagramHandle,
      data.youtubeHandle,
      data.twitterHandle,
      data.facebookHandle,
      data.linkedinHandle,
      data.tiktokHandle,
    ];
    const hasAtLeastOneHandle = handles.some((h) => h && h.trim().length > 0);
    if (!hasAtLeastOneHandle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Influencers must provide at least one social media handle.',
        path: ['instagramHandle'],
      });
    }
  }
});

export const SendOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const VerifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  token: z.string().length(6, 'OTP must be 6 digits'),
  type: z.enum(['signup', 'magiclink', 'recovery']),
});

// One audience slice, e.g. { label: 'India', pct: 72 }. Rendered by the media
// kit's tolerant parseSlices (lib/public-profile/media-kit.ts).
export const AudienceSliceSchema = z.object({
  label: z.string().min(1).max(40),
  pct: z.number().min(0).max(100),
});

export const ProposeTermsSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  budget: z.number().positive().optional(),
  advance_amount: z.number().nonnegative().optional(),
  deliverables: z.string().optional(),
  timeline: z.string().optional(),
});

export const ProfileUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().max(2000).optional(),
  niche: z.array(z.string()).optional(),
  username: UsernameSchema.optional(),
  gender: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  languages: z.array(z.string()).optional(),
  collab_types: z.array(z.string()).optional(),
  price_range: z.string().optional(),
  instagram_handle: z.string().optional(),
  youtube_handle: z.string().optional(),
  twitter_handle: z.string().optional(),
  facebook_handle: z.string().optional(),
  linkedin_handle: z.string().optional(),
  tiktok_handle: z.string().optional(),
  extra_social_links: z.array(z.string()).optional(),
  headline: z.string().max(120).optional(),
  availability_status: z.enum(['open', 'limited', 'paused']).optional(),
  engagement_rate: z.number().min(0).max(100).optional(),
  media_kit_url: z.string().url().optional().or(z.literal('')),
  avatar_url: z.string().url().optional().or(z.literal('')),
  cover_image_url: z.string().url().optional().or(z.literal('')),
  portfolio: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional(),
  // Media-kit fields collected from settings (not signup — keeps signup light).
  pricing_min: z.number().min(0).max(100_000_000).optional(),
  pricing_max: z.number().min(0).max(100_000_000).optional(),
  past_collaborations: z.array(z.string().min(1).max(80)).max(24).optional(),
  // Always sent as the FULL current 3-key object, never a partial diff — a
  // JSONB column write replaces the whole value, so a partial PATCH would
  // silently re-show whatever section the client's copy didn't know about.
  profile_section_visibility: z
    .object({
      instagram_posts: z.boolean().optional(),
      youtube_videos: z.boolean().optional(),
      portfolio: z.boolean().optional(),
    })
    .strict()
    .optional(),
  audience_demographics: z
    .object({
      locations: z.array(AudienceSliceSchema).max(12).optional(),
      age: z.array(AudienceSliceSchema).max(12).optional(),
      gender: z.array(AudienceSliceSchema).max(12).optional(),
    })
    .optional(),
});

export const BusinessProfileUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  username: UsernameSchema.optional(),
  company_name: z.string().min(1).optional(),
  industry: z.string().optional(),
  business_type: z.string().optional(),
  gst_number: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  marketing_budget: z.string().optional(),
  registered_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  collab_preferences: z.array(z.string()).optional(),
  tagline: z.string().max(160).optional(),
  company_description: z.string().max(2000).optional(),
  instagram_handle: z.string().optional(),
  facebook_handle: z.string().optional(),
  linkedin_handle: z.string().optional(),
  logo_url: z.string().url().optional().or(z.literal('')),
  cover_image_url: z.string().url().optional().or(z.literal('')),
});

export const CollabRequestSchema = z.object({
  to_user_id: z.string().uuid(),
  project_title: z.string().max(200).optional(),
  project_description: z.string().max(2000).optional(),
  message: z.string().max(2000).optional(),
  budget: z.number().positive().optional(),
});

export const ProjectCreateSchema = z.object({
  counterparty_user_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  budget: z.number().positive().optional(),
  duration_days: z.number().positive().optional(),
  content_types: z.array(z.string()).min(1),
});

export const MessageSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const ConnectionUpdateSchema = z.object({
  favorite: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['active', 'removed']).optional(),
});

export const ProjectUpdateSchema = z.object({
  status: z.string().optional(),
  current_stage: z.enum([
    'collaboration_started',
    'project_discussion',
    'advance_payment',
    'content_planning',
    'content_confirmation',
    'shooting_in_progress',
    'editing_in_progress',
    'sent_for_review',
    'revisions',
    'final_approval',
    'final_payment',
    'project_completed'
  ]).optional(),
});

export const CollabUpdateSchema = z.object({
  status: z.enum(['pending', 'accepted', 'declined', 'cancelled']).optional(),
  action: z.enum(['accept', 'decline', 'cancel']).optional(),
});
