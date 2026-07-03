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
  collabTypes: z.array(z.string()).optional(),
  priceRange: z.string().optional(),
  instagramHandle: z.string().optional(),
  youtubeHandle: z.string().optional(),
  twitterHandle: z.string().optional(),
  facebookHandle: z.string().optional(),
  linkedinHandle: z.string().optional(),
  tiktokHandle: z.string().optional(),
  extraSocialLinks: z.array(z.string()).optional(),
  headline: z.string().max(120).optional(),
  availabilityStatus: z.enum(['open', 'limited', 'paused']).optional(),
  engagementRate: z.number().min(0).max(100).optional(),
  mediaKitUrl: z.string().url().optional().or(z.literal('')),
  portfolio: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional(),
});

export const BusinessProfileUpdateSchema = z.object({
  companyName: z.string().min(1).optional(),
  industry: z.string().optional(),
  businessType: z.string().optional(),
  gstNumber: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  marketingBudget: z.string().optional(),
  registeredAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  collabPreferences: z.array(z.string()).optional(),
  tagline: z.string().max(160).optional(),
  companyDescription: z.string().max(2000).optional(),
  instagramHandle: z.string().optional(),
  facebookHandle: z.string().optional(),
  linkedinHandle: z.string().optional(),
});

export const CollabRequestSchema = z.object({
  toUserId: z.string().uuid(),
  message: z.string().max(2000).optional(),
  budget: z.number().positive().optional(),
});

export const ProjectCreateSchema = z.object({
  counterpartyUserId: z.string().uuid(),
  name: z.string().min(1).max(200),
  budget: z.number().positive().optional(),
  durationDays: z.number().positive().optional(),
  contentTypes: z.array(z.string()).min(1),
});

export const MessageSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const ConnectionUpdateSchema = z.object({
  favorite: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['active', 'removed']).optional(),
});
