-- Add start_date column to project_cards for Gantt-style date range
ALTER TABLE public.project_cards
  ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
