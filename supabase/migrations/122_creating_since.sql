-- Migration 122: Creating since
--
-- One nullable smallint on profiles. Optional signup question and profile
-- line. Validated server-side (not before ~1990, not in the future).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creating_since SMALLINT
    CHECK (creating_since IS NULL OR (creating_since >= 1990 AND creating_since <= EXTRACT(YEAR FROM now())::int));
