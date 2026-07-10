import { z } from 'zod';

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
  username: z.string().min(3).max(30).optional(),
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

export const SendOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const VerifyOtpSchema = z.object({
  email: z.string().email('Invalid email address'),
  token: z.string().length(6, 'OTP must be 6 digits'),
  type: z.enum(['signup', 'magiclink', 'recovery']),
});

export const ProfileUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  bio: z.string().max(2000).optional(),
  niche: z.array(z.string()).optional(),
  username: z.string().min(3).max(30).optional(),
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
  portfolio: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional(),
});

export const BusinessProfileUpdateSchema = z.object({
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
