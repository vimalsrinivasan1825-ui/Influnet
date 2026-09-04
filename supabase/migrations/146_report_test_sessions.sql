-- 146: Two-phone test-run sessions for the QA checklist at /r/<token>/test-run.
--
-- WHY A SEPARATE TABLE FROM report_remarks (118)
-- A remark is a one-shot, public, append-only note — everyone with the link
-- sees every remark. A test-run session is the opposite: one device owns it,
-- keeps updating the same row for hours, and nobody else may read or write it
-- — not even another tester on the same link. Mixing the two would mean
-- either making remarks editable (defeats their append-only audit value) or
-- making sessions public (defeats the one-device restriction). Separate table.
--
-- HOW THE ONE-DEVICE RESTRICTION WORKS WITHOUT ACCOUNTS
-- Readers here are not signed in, same as report_remarks. Creating a session
-- (POST /r/<token>/test-sessions) mints a random secret, returned to the
-- caller exactly once and never again; only its SHA-256 is stored, in
-- secret_hash. The creating device keeps the secret in localStorage. Every
-- later read or write of that session must present the secret, and a
-- mismatch is answered identically to a session that does not exist — see
-- the route for why. So "one device can modify it, nobody else can even see
-- it" falls out of who holds the secret, not out of any account system.
--
-- WHY RLS IS ON WITH NO POLICY
-- Same reasoning as 118: the anon key ships in the browser bundle and this
-- table is reachable from an unauthenticated page, so RLS with zero policies
-- denies anon and authenticated outright, and the service-role route is the
-- only door — its secret check cannot be bypassed by talking to PostgREST
-- directly with the anon key.

CREATE TABLE IF NOT EXISTS public.report_test_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 hex digest of the per-device secret. Never store the secret
  -- itself — a leaked row (a SQL export, a support screenshot) must not hand
  -- out write access the way a stored plaintext secret would.
  secret_hash  text NOT NULL,
  tester       text,
  build        text,
  -- {"1.1": {"s": "pass", "n": "..."}, ...} — one entry per checklist step.
  -- Whole-document replace on every save (see the route), never merged
  -- server-side, so there is no read-modify-write race to worry about for a
  -- store that by construction has exactly one writer.
  results      jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_test_sessions_tester_len CHECK (tester IS NULL OR char_length(tester) <= 120),
  CONSTRAINT report_test_sessions_build_len CHECK (build IS NULL OR char_length(build) <= 120),
  CONSTRAINT report_test_sessions_results_is_object CHECK (jsonb_typeof(results) = 'object')
);

ALTER TABLE public.report_test_sessions ENABLE ROW LEVEL SECURITY;
-- No policies. See the note above — this is the deny-all case, on purpose.

COMMENT ON TABLE public.report_test_sessions IS
  'Per-device test-run sessions for the QA checklist at /r/<token>/test-run. '
  'Service-role only: RLS is enabled with no policies so anon and '
  'authenticated are both denied, and /r/<token>/test-sessions is the only '
  'way in. A session is readable and writable only by whoever holds the '
  'secret whose SHA-256 matches secret_hash — nobody else can see it exists.';
