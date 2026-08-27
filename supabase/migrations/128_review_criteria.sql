-- Migration 128: Review criteria scoring
--
-- Adds criteria-level scoring alongside the existing rating column.
-- The rating column is kept as the derived average so every profile that
-- reads it today keeps working. New reviews populate both.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS quality_score     smallint CHECK (quality_score IS NULL OR (quality_score >= 1 AND quality_score <= 5)),
  ADD COLUMN IF NOT EXISTS communication_score smallint CHECK (communication_score IS NULL OR (communication_score >= 1 AND communication_score <= 5)),
  ADD COLUMN IF NOT EXISTS timeliness_score  smallint CHECK (timeliness_score IS NULL OR (timeliness_score >= 1 AND timeliness_score <= 5)),
  ADD COLUMN IF NOT EXISTS professionalism_score smallint CHECK (professionalism_score IS NULL OR (professionalism_score >= 1 AND professionalism_score <= 5));
