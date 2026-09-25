import { NextResponse } from 'next/server';
import { jsonError, withAdmin } from '@/lib/api';
import { SURVEY_EVENTS, SURVEY_ROLES, SurveyFormSchema, loadSurveyForms } from '@/lib/event-survey';

// Admin view of the pre-event survey (migrations 174, 175).
//   GET ?event=           → { responses, forms: { creator, business }, formsUpdatedAt }
//   PUT { event, role, questions } → { ok, questions }  (replaces that role's form)
//
// responses: newest first, each with the registrant's details, capped at 1000
// (one per registration for a single event, so the cap is far above a room).

const DEFAULT_EVENT = 'silicon-nexus-s2';

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const event = new URL(req.url).searchParams.get('event') || DEFAULT_EVENT;
    if (!SURVEY_EVENTS.has(event)) return jsonError(400, 'Unknown event');

    const [responses, forms, stamps] = await Promise.all([
      auth.supabase
        .from('event_survey_responses')
        .select(
          'id, role, answers, created_at, updated_at, registration:event_registrations(id, name, pass_code, phone_digits, email, location, instagram_handle, checked_in_at, deleted_at)',
        )
        .eq('event_slug', event)
        .order('updated_at', { ascending: false })
        .limit(1000),
      loadSurveyForms(auth.supabase, event),
      auth.supabase.from('event_survey_forms').select('role, updated_at').eq('event_slug', event),
    ]);
    if (responses.error) return jsonError(500, 'Could not load survey responses', responses.error);
    if (!forms) return jsonError(500, 'Could not load the survey form');

    return NextResponse.json({
      responses: responses.data ?? [],
      forms,
      formsUpdatedAt: Object.fromEntries((stamps.data ?? []).map((r: { role: string; updated_at: string }) => [r.role, r.updated_at])),
    });
  } catch (error) {
    return jsonError(500, 'Could not load survey responses', error);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;

    const body = await req.json().catch(() => null);
    const event = body?.event || DEFAULT_EVENT;
    if (!SURVEY_EVENTS.has(event)) return jsonError(400, 'Unknown event');
    if (!SURVEY_ROLES.includes(body?.role)) return jsonError(400, 'Role must be creator or business');

    const parsed = SurveyFormSchema.safeParse(body?.questions);
    if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? 'The form is not valid');

    // Drop fields that don't apply to the kind, so switching a question from
    // multi to text doesn't leave its old options behind.
    const questions = parsed.data.map((q) =>
      q.kind === 'text'
        ? { id: q.id, kind: q.kind, title: q.title, hint: q.hint || undefined, placeholder: q.placeholder || undefined }
        : {
            id: q.id,
            kind: q.kind,
            title: q.title,
            hint: q.hint || undefined,
            options: q.options,
            other: q.other || undefined,
            max: q.kind === 'multi' ? q.max : undefined,
          },
    );

    const { error } = await auth.supabase.from('event_survey_forms').upsert(
      {
        event_slug: event,
        role: body.role,
        questions,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
      },
      { onConflict: 'event_slug,role' },
    );
    if (error) return jsonError(500, 'Could not save the form', error);

    return NextResponse.json({ ok: true, questions });
  } catch (error) {
    return jsonError(500, 'Could not save the form', error);
  }
}
