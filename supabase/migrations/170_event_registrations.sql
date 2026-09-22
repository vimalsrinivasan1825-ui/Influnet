-- Migration 170: Event registrations with a personal entry pass
--
-- Backs https://influnet.io/join for the Silicon Nexus S2 soft launch (and any
-- later event, keyed by event_slug). Each registrant gets a pass code such as
-- INF-7KQ2MX, shown to them as a QR card.
--
-- One registration per phone number per event: registering again returns the
-- existing pass instead of minting a second one, so a refresh or a double tap
-- never leaves someone holding two codes.
--
-- Written only through register_for_event(), called by the web app's service
-- role. No anon/authenticated access to the table at all.

CREATE TABLE IF NOT EXISTS public.event_registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug        TEXT NOT NULL CHECK (event_slug ~ '^[a-z0-9-]{1,60}$'),
  pass_code         TEXT NOT NULL UNIQUE CHECK (pass_code ~ '^INF-[A-Z0-9]{6}$'),
  name              TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  phone             TEXT NOT NULL CHECK (char_length(phone) BETWEEN 7 AND 30),
  -- Digits only, with country code, so "+91 98xxx" and "98xxx" are one person.
  phone_digits      TEXT NOT NULL CHECK (phone_digits ~ '^[0-9]{7,15}$'),
  email             TEXT CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 160),
  location          TEXT CHECK (location IS NULL OR char_length(location) <= 120),
  instagram_handle  TEXT CHECK (instagram_handle IS NULL OR char_length(instagram_handle) <= 60),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_in_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_slug, phone_digits)
);

CREATE INDEX IF NOT EXISTS event_registrations_event_created_idx
  ON public.event_registrations (event_slug, created_at DESC);

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_registrations FROM anon, authenticated;

-- Register (or look up) a pass. Returns the pass plus whether it already existed.
-- The code alphabet drops 0/O/1/I/L so a code read aloud or typed at the door
-- can't be misread; 31^6 ≈ 887M codes, retried on the rare collision.
CREATE OR REPLACE FUNCTION public.register_for_event(
  p_event_slug TEXT,
  p_name TEXT,
  p_phone TEXT,
  p_phone_digits TEXT,
  p_email TEXT,
  p_location TEXT,
  p_instagram_handle TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (pass_code TEXT, name TEXT, created_at TIMESTAMPTZ, already_registered BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_attempt INT := 0;
  v_row public.event_registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.event_registrations r
   WHERE r.event_slug = p_event_slug AND r.phone_digits = p_phone_digits;
  IF FOUND THEN
    RETURN QUERY SELECT v_row.pass_code, v_row.name, v_row.created_at, TRUE;
    RETURN;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'INF-' || (
      SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
        FROM generate_series(1, 6)
    );
    BEGIN
      INSERT INTO public.event_registrations
        (event_slug, pass_code, name, phone, phone_digits, email, location, instagram_handle, metadata)
      VALUES
        (p_event_slug, v_code, p_name, p_phone, p_phone_digits,
         NULLIF(p_email, ''), NULLIF(p_location, ''), NULLIF(p_instagram_handle, ''),
         coalesce(p_metadata, '{}'::jsonb))
      RETURNING * INTO v_row;
      RETURN QUERY SELECT v_row.pass_code, v_row.name, v_row.created_at, FALSE;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- Either the same phone raced us in (return that pass) or the code collided (retry).
      SELECT * INTO v_row
        FROM public.event_registrations r
       WHERE r.event_slug = p_event_slug AND r.phone_digits = p_phone_digits;
      IF FOUND THEN
        RETURN QUERY SELECT v_row.pass_code, v_row.name, v_row.created_at, TRUE;
        RETURN;
      END IF;
      IF v_attempt >= 8 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.register_for_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
