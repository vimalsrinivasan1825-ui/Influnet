-- 147: Opt-in read-only sharing for the two-phone test-run sessions (146).
--
-- WHY THIS EXISTS
-- 146 made a run private to one device, deliberately: "one device can modify
-- it, nobody else can even see it". That is right for a run in progress and
-- wrong for a run that is finished — a tester who has walked 154 steps has
-- built the most useful document on the project, and the only way to get it to
-- the rest of the team was to copy the plaintext export out by hand. Worse,
-- the next tester had no way to see which steps were already covered, so runs
-- duplicated each other.
--
-- WHY A SECOND ID RATHER THAN HANDING OUT THE SECRET
-- The obvious shortcut is to share the URL with `secret` in it. That hands
-- over WRITE access — the secret is the only thing standing between a reader
-- and a PATCH — and it cannot be taken back without destroying the owner's own
-- access too. So sharing mints a SEPARATE, independent id that grants reads
-- and nothing else. Revoking sets it to NULL: the old link stops resolving and
-- the owner's secret is untouched.
--
-- WHY IT IS NULL BY DEFAULT
-- Sharing is an act, not a setting. A run is private exactly as 146 promised
-- until its owner presses the button; nothing here changes what happens to a
-- run whose owner never does. That also keeps the "a session's existence is
-- not confirmed to a caller without its secret" property true for every
-- unshared row — the shared-runs listing can only ever see rows that opted in.
--
-- WHY share_id IS STORED IN PLAINTEXT WHEN secret_hash IS NOT
-- They defend against different things. secret_hash is hashed because a leaked
-- row must not yield write access. share_id grants only what the owner already
-- chose to publish to everyone holding the document token, and the listing
-- endpoint has to return it so the page can build links — hashing a value you
-- then hand out in the same response protects nothing.

ALTER TABLE public.report_test_sessions
  ADD COLUMN IF NOT EXISTS share_id  text,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz;

-- Partial: NULL means "not shared", and many rows are NULL at once, so the
-- uniqueness constraint must not treat them as colliding.
CREATE UNIQUE INDEX IF NOT EXISTS report_test_sessions_share_id_key
  ON public.report_test_sessions (share_id)
  WHERE share_id IS NOT NULL;

-- Listing shared runs is "newest first, shared only" on every request.
CREATE INDEX IF NOT EXISTS report_test_sessions_shared_idx
  ON public.report_test_sessions (shared_at DESC)
  WHERE share_id IS NOT NULL;

COMMENT ON COLUMN public.report_test_sessions.share_id IS
  'Opt-in read-only handle. NULL until the owning device shares the run; '
  'presenting it to GET /r/<token>/test-sessions?share=... returns the run '
  'without its secret and grants no write access. Set back to NULL to revoke.';

COMMENT ON COLUMN public.report_test_sessions.shared_at IS
  'When sharing was last turned on. NULL whenever share_id is NULL.';
