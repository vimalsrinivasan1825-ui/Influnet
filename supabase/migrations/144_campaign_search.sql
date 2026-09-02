-- Migration 144: campaign keyword search
--
-- /api/campaigns could filter by an exact `category` or `platform` and nothing
-- else. There was no way to type "food" and get food campaigns: a creator had
-- to already know which category tag a brand happened to pick. This adds real
-- full-text search over the fields a creator would actually search.
--
-- ── WHY A TRIGGER AND NOT A GENERATED COLUMN ─────────────────────────────
--
-- `GENERATED ALWAYS AS (...) STORED` requires every function in the expression
-- to be IMMUTABLE, and the array flattening this needs (`categories` is text[])
-- sits close enough to that line that a wrong guess fails the migration during
-- a deploy rather than here. A BEFORE trigger has no such constraint, is the
-- older and better-trodden pattern, and costs one function.
--
-- ── WEIGHTS ──────────────────────────────────────────────────────────────
--
-- A  title       — what the campaign calls itself
-- B  categories  — the tags a brand chose, and location
-- C  description / deliverables — the body, where a word is weaker evidence
--
-- Weights are stored so ts_rank can order by them later; nothing reads the
-- ranking yet (the route filters and keeps its existing sort), but the data has
-- to be there before anything can.

-- ── The searchable column ────────────────────────────────────────────────
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.campaigns_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
-- No table reads, so no search_path exposure; set explicitly all the same
-- because every other function in this schema does.
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A')
   || setweight(to_tsvector('english', coalesce(array_to_string(NEW.categories, ' '), '')), 'B')
   || setweight(to_tsvector('english', coalesce(array_to_string(NEW.platforms, ' '), '')), 'B')
   || setweight(to_tsvector('english', coalesce(NEW.location, '')), 'B')
   || setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C')
   || setweight(to_tsvector('english', coalesce(NEW.deliverables, '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_search_vector_trg ON public.campaigns;
CREATE TRIGGER campaigns_search_vector_trg
  BEFORE INSERT OR UPDATE OF title, description, deliverables, categories, platforms, location
  ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.campaigns_search_vector_update();

-- Backfill everything already on the board. The trigger only fires on write,
-- so without this every existing campaign is invisible to search.
UPDATE public.campaigns SET updated_at = updated_at WHERE search_vector IS NULL;

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS campaigns_search_idx
  ON public.campaigns USING GIN (search_vector);

-- `?category=` and `?platform=` use `contains`, which is a @> array containment
-- and had no index at all — a sequential scan of the whole board per filtered
-- request.
CREATE INDEX IF NOT EXISTS campaigns_categories_idx
  ON public.campaigns USING GIN (categories);
CREATE INDEX IF NOT EXISTS campaigns_platforms_idx
  ON public.campaigns USING GIN (platforms);

-- The public board's own predicate. Partial, because every browse query is
-- `status = 'live' AND expires_at > now()` and drafts should not bloat it.
CREATE INDEX IF NOT EXISTS campaigns_live_board_idx
  ON public.campaigns (published_at DESC)
  WHERE status = 'live';

COMMENT ON COLUMN public.campaigns.search_vector IS
  'Weighted full-text index of title/categories/platforms/location/description/deliverables. Maintained by campaigns_search_vector_update(). Queried via /api/campaigns?q=';
