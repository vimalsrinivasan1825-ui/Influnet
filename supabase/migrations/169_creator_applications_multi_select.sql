-- Migration 169: Expand creator_type length constraint to support multi-select formats
--
-- Allows applicants to select multiple creator roles/formats without hitting the previous 80-char limit.

ALTER TABLE public.creator_join_applications 
  DROP CONSTRAINT IF EXISTS creator_join_applications_creator_type_check;

ALTER TABLE public.creator_join_applications
  ADD CONSTRAINT creator_join_applications_creator_type_check 
  CHECK (char_length(creator_type) BETWEEN 1 AND 250);
