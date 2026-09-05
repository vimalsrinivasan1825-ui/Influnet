import { z } from 'zod';
import { isValidIndianPhone, toE164India } from './phone';

// Usernames become public URLs at the ROOT (/<username>) — block anything that
// collides with app routes or impersonates the platform. This list matters more
// than it looks: a username now shares its namespace with every top-level route.
// Static segments still win in Next's matcher, so a collision would strand the
// profile rather than shadow the route, but it must not be reachable either way.
// The format rules below already make the rest unregisterable — hyphens are
// rejected (reset-password, ui-preview) and the 3-char minimum covers b, c, vf.
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

/**
 * Optional phone — blank/undefined allowed, since not every flow that carries
 * this field requires one. Anything that IS typed must be a real 10-digit
 * Indian mobile number.
 *
 * This is the fix for a real gap: every schema below used to have
 * `phone: z.string().optional()`, which is not a phone validator at all — it
 * accepts a 26-digit paste, a string of letters, anything. That schema is what
 * actually runs server-side on submit (RegisterProfileSchema, specifically),
 * so no amount of client-side keyboard restriction mattered; the one place
 * enforced took whatever arrived. Normalises to E.164 on success so every
 * write lands in the one shape migration 107's availability check expects —
 * see phone.ts for why that consistency matters.
 */
export const PhoneSchema = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || isValidIndianPhone(v), 'Enter a valid 10-digit mobile number')
  .transform((v) => (v ? toE164India(v) : v));

// GSTIN: 2-digit state code, 5-letter PAN prefix, 4 digits, 1 letter, 1
// entity digit/letter, literal 'Z', 1 alphanumeric checksum. Case-insensitive
// on input; callers should upper-case before storing.
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(value: string): boolean {
  return GSTIN_RE.test(value.trim().toUpperCase());
}

/** Optional GST number — blank is allowed, but a value must be a real GSTIN. */
export const GstNumberSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => v === '' || GSTIN_RE.test(v), 'Enter a valid 15-character GST number (e.g. 22AAAAA0000A1Z5)');

// Users type "example.com" far more often than "https://example.com", so a bare
// host is accepted and normalised rather than rejected.
export function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidWebsite(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(normalizeWebsite(trimmed));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    // Require a dotted, non-trailing-dot hostname so "foo" or "foo." fail.
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname);
  } catch {
    return false;
  }
}

/** Optional website — blank is allowed; a value is normalised to an absolute URL. */
export const WebsiteSchema = z
  .string()
  .trim()
  .refine(isValidWebsite, 'Enter a valid website (e.g. yourcompany.com)')
  .transform(normalizeWebsite);

/**
 * 0-4 signup password strength score, shared so mobile and web enforce the
 * SAME bar rather than each guessing at one. Not a full entropy estimate (no
 * zxcvbn) — just enough to reject a password built from one character class,
 * which "8 characters, any character" let straight through (e.g. a bare
 * '12345678' scored a 1 here — "present but weak" — and used to be accepted
 * outright because the old check was only pw.length >= 8).
 */
export function passwordStrengthScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

/** The bar signup actually gates on — score 2 ("Fair") or better: at least 8
 *  characters AND not just one character class (so a 12+ character password,
 *  or an 8+ one mixing case, digits or symbols, passes; 'password' and
 *  '12345678' do not). */
export function isStrongEnoughPassword(pw: string): boolean {
  return passwordStrengthScore(pw) >= 2;
}

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
  phone: PhoneSchema,
  role: z.enum(['business_owner', 'influencer']),
  companyName: z.string().optional(),
  industry: z.string().optional(),
  gstNumber: GstNumberSchema.optional(),
  website: WebsiteSchema.optional(),
  location: z.string().optional(),
  collabPreferences: z.array(z.string()).optional(),
  bio: z.string().optional(),
  niche: z.array(z.string()).optional(),
  username: UsernameSchema.optional(),
  instagramHandle: z.string().optional(),
  youtubeHandle: z.string().optional(),
  twitterHandle: z.string().optional(),
  facebookHandle: z.string().optional(),
  snapchatHandle: z.string().optional(),
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
  phone: PhoneSchema,
  // Proof of mobile OTP verification, minted by the phone-otp Edge Function.
  // Carries no trust on its own — /api/auth/register re-validates it against
  // phone_otp_sessions before the profile is created.
  // `.nullable()` matters: when the phone-OTP feature is OFF the wizards have no
  // token and send `null` (not `undefined`). Without this a flag toggle turns
  // every signup into a 400 "Invalid registration payload". The route re-checks
  // this against phone_otp_sessions only when phoneOtpEnabled(), and strips it
  // either way before the RPC.
  phoneVerificationToken: z.string().uuid().nullable().optional(),
  // business fields
  companyName: z.string().optional(),
  businessType: z.string().optional(),
  industry: z.string().optional(),
  website: WebsiteSchema.optional(),
  gstNumber: GstNumberSchema.optional(),
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
  // Link-only platform (no public metrics to read — see lib/social/snapchat.ts).
  // register_profile doesn't know this column, so /api/auth/register writes it
  // in a follow-up update rather than through the RPC's fixed column list.
  snapchatHandle: z.string().optional(),
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
  twitterFollowers: z.number().optional(),
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
  phone: PhoneSchema,
  location: z.string().optional(),
  /** Turn off "you've been away" re-engagement nudges (migration 142). */
  nudges_opt_out: z.boolean().optional(),
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
  // Creating since: year the creator started making content (S2).
  creating_since: z.number().int().min(1990).max(new Date().getFullYear()).optional(),
  // Optional — most individual creators are not GST-registered, and that is
  // the legally correct default, not a gap (B4: an unregistered supplier gets
  // a Bill of Supply instead of a Tax Invoice with a GST breakup).
  gst_number: GstNumberSchema.optional(),
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
  phone: PhoneSchema,
  location: z.string().optional(),
  /** Turn off "you've been away" re-engagement nudges (migration 142). */
  nudges_opt_out: z.boolean().optional(),
  username: UsernameSchema.optional(),
  company_name: z.string().min(1).optional(),
  industry: z.string().optional(),
  business_type: z.string().optional(),
  gst_number: GstNumberSchema.optional(),
  website: WebsiteSchema.optional(),
  marketing_budget: z.string().optional(),
  registered_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  collab_preferences: z.array(z.string()).optional(),
  tagline: z.string().max(160).optional(),
  company_description: z.string().max(2000).optional(),
  // Direct contact details — shown to a creator only after they spend a
  // contact reveal (migration 141). Stored on business_profiles, never in a
  // public RPC.
  contact_name: z.string().max(120).optional().or(z.literal('')),
  contact_phone: z.string().max(30).optional().or(z.literal('')),
  contact_email: z.string().email().max(200).optional().or(z.literal('')),
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
  // Nullish, not optional: budget is an optional field in the UI, and clients
  // send an explicit null for "not specified" rather than omitting the key.
  budget: z.number().positive().nullish(),
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
