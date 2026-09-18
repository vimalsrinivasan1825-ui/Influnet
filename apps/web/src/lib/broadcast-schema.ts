import { z } from 'zod';
import { guideById } from '@influnet/core';

/**
 * Validation for admin-composed broadcasts (migration 157). The database has
 * the same CHECK constraints; this exists so the composer gets a readable 400
 * instead of a constraint violation, and so `guide_id` can be checked against
 * the real guide registry in packages/core.
 */

/** Audience keys accepted by broadcast_audience_ids(). Unknown keys are rejected
 *  by the function too — this is the friendly copy of that list. */
export const AudienceSchema = z
  .object({
    role: z.enum(['influencer', 'business_owner', 'both']).optional(),
    creator_verification: z.array(z.enum(['verified', 'in_review', 'needs_more_info', 'unverified'])).max(4).optional(),
    business_approval: z.array(z.enum(['approved', 'pending_review', 'rejected'])).max(3).optional(),
    tier: z.array(z.enum(['free', 'pro'])).max(2).optional(),
    pro_expiring_within_days: z.number().int().min(1).max(60).optional(),
    active_within_days: z.number().int().min(1).max(365).optional(),
    dormant_for_days: z.number().int().min(1).max(365).optional(),
    signed_up_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    signed_up_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    cities: z.array(z.string().max(80)).max(50).optional(),
    niches: z.array(z.string().max(60)).max(50).optional(),
    industries: z.array(z.string().max(60)).max(50).optional(),
    has_project: z.boolean().optional(),
    platforms: z.array(z.enum(['ios', 'android'])).max(2).optional(),
    app_version_below: z.string().max(20).optional(),
    has_push_device: z.boolean().optional(),
    user_ids: z.array(z.string().uuid()).max(5000).optional(),
  })
  .strict();

const base = {
  name: z.string().min(1).max(120),
  kind: z.enum(['announcement', 'promo', 'tutorial', 'system', 'reminder']),
  // Expo truncates long push titles; 65/240 match the DB CHECKs.
  title: z.string().min(1).max(65),
  body: z.string().min(1).max(240),
  image_url: z.string().url().startsWith('https://').max(500).nullable().optional(),
  deep_link: z.string().regex(/^\/[A-Za-z0-9/_\-?=&.%]*$/, 'Must be an in-app path like /dashboard/projects').max(300).nullable().optional(),
  cta_label: z.string().max(30).nullable().optional(),
  guide_id: z.string().max(60).nullable().optional(),
  channels: z.array(z.enum(['push', 'in_app', 'email'])).min(1).max(3),
  in_app_style: z.enum(['toast', 'banner', 'modal']).optional(),
  audience: AudienceSchema.optional(),
  frequency: z.enum(['once', 'daily', 'weekly', 'monthly']).optional(),
  send_at: z.string().datetime().nullable().optional(),
  by_weekday: z.array(z.number().int().min(1).max(7)).max(7).nullable().optional(),
  by_monthday: z.number().int().min(1).max(28).nullable().optional(),
  time_ist: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  respect_quiet_hours: z.boolean().optional(),
};

export const BroadcastCreateSchema = z.object(base).superRefine(check);
export const BroadcastUpdateSchema = z.object(base).partial().superRefine(check);

function check(v: Record<string, any>, ctx: z.RefinementCtx) {
  if (v.guide_id && !guideById(v.guide_id)) {
    ctx.addIssue({ code: 'custom', path: ['guide_id'], message: 'Unknown guide id' });
  }
  if (v.frequency && v.frequency !== 'once' && !v.time_ist) {
    ctx.addIssue({ code: 'custom', path: ['time_ist'], message: 'A repeating broadcast needs a time' });
  }
  if (v.frequency === 'weekly' && !(v.by_weekday?.length)) {
    ctx.addIssue({ code: 'custom', path: ['by_weekday'], message: 'Pick at least one weekday' });
  }
  if (v.frequency === 'monthly' && v.by_monthday == null) {
    ctx.addIssue({ code: 'custom', path: ['by_monthday'], message: 'Pick a day of the month' });
  }
  if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) {
    ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'End date is before the start date' });
  }
}

/** Above this many recipients a promotional send needs a second admin's approval. */
export function approvalThreshold(): number {
  const raw = Number(process.env.BROADCAST_APPROVAL_THRESHOLD ?? 2000);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 2000;
}
