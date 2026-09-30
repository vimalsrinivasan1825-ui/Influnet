-- Migration 174: Pre-event survey answers
--
-- Backs https://influnet.io/join/survey. While people wait for the event to
-- start, they enter the phone number they registered with (migration 170), we
-- show back their registration, and they answer a short creator or business
-- questionnaire about payments, collaborations and what would help.
--
-- One response per registration: answering again overwrites the earlier one.
-- Answers are a JSON object keyed by question id; the question set lives in
-- the landing app (apps/landing/src/components/event/survey-questions.ts).
--
-- Written only by the web app's service role. No anon/authenticated access.

CREATE TABLE IF NOT EXISTS public.event_survey_responses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id  UUID NOT NULL UNIQUE REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  event_slug       TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('creator', 'business')),
  answers          JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_survey_responses_event_idx
  ON public.event_survey_responses (event_slug, role, created_at DESC);

ALTER TABLE public.event_survey_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_survey_responses FROM anon, authenticated;
