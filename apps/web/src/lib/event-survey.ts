import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

// Pre-event survey (influnet.io/join/survey). Questions live in
// event_survey_forms (migration 175), answers in event_survey_responses (174).
// Used by /api/event-survey (public) and /api/admin/event-survey.

export const SURVEY_EVENTS = new Set(['silicon-nexus-s2']);
export const SURVEY_ROLES = ['creator', 'business'] as const;
export type SurveyRole = (typeof SURVEY_ROLES)[number];

const Id = z.string().regex(/^[a-z0-9_]{1,40}$/, 'Ids are lowercase letters, digits and _');

export const SurveyQuestionSchema = z
  .object({
    id: Id.refine((v) => !v.endsWith('_other'), 'A question id cannot end in _other'),
    kind: z.enum(['single', 'multi', 'text']),
    title: z.string().trim().min(1, 'Every question needs a title').max(200),
    hint: z.string().trim().max(200).optional(),
    placeholder: z.string().trim().max(120).optional(),
    options: z
      .array(z.object({ id: Id, label: z.string().trim().min(1, 'Every option needs a label').max(120) }))
      .max(20)
      .optional(),
    other: z.boolean().optional(),
    max: z.number().int().min(1).max(20).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.kind === 'text') return;
    const opts = q.options ?? [];
    if (opts.length < 2) ctx.addIssue({ code: 'custom', message: `“${q.title}” needs at least two options` });
    const ids = opts.map((o) => o.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: `“${q.title}” has two options with the same id` });
    if (ids.includes('other'))
      ctx.addIssue({ code: 'custom', message: `“${q.title}”: use the “Something else” switch instead of an option called other` });
  });

export const SurveyFormSchema = z
  .array(SurveyQuestionSchema)
  .min(1, 'A form needs at least one question')
  .max(30)
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, 'Two questions have the same id');

export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

/** Both roles' questions for an event, in page order. Missing rows are []. */
export async function loadSurveyForms(
  supabase: SupabaseClient,
  event: string,
): Promise<Record<SurveyRole, SurveyQuestion[]> | null> {
  const { data, error } = await supabase
    .from('event_survey_forms')
    .select('role, questions')
    .eq('event_slug', event);
  if (error) return null;
  const forms: Record<SurveyRole, SurveyQuestion[]> = { creator: [], business: [] };
  for (const row of data ?? []) forms[row.role as SurveyRole] = row.questions as SurveyQuestion[];
  return forms;
}
