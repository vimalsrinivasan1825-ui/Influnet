-- 118: Remarks left by readers of the internal product documents at /r/<token>.
--
-- WHY THIS IS NOT `product_feedback` (098)
-- That table is for signed-in users of the app: every row carries a
-- `user_id` referencing profiles, its RLS policies are written in terms of
-- `auth.uid()`, and the admin feedback inbox reads it as product signal from
-- real accounts. The readers of the plan documents are not signed in and in
-- general do not have accounts — they are people the link was shared with.
-- Pointing them at `product_feedback` would mean either loosening its policies
-- or inventing a fake user, and it would mix "a stranger's opinion on a draft"
-- into the queue an admin triages as customer feedback. Separate table.
--
-- WHY RLS IS ON WITH NO POLICY
-- Deliberate, not an oversight. Enabled RLS with zero policies denies both
-- `anon` and `authenticated` outright, which is what we want: the anon key is
-- in every browser bundle, and this table is reachable from an unauthenticated
-- page. Only the service role — which bypasses RLS and never leaves the server
-- — reads or writes it, via /r/<token>/remarks. So the API route is the single
-- door, and its validation and rate limiting cannot be walked around by
-- talking to PostgREST directly.

CREATE TABLE IF NOT EXISTS public.report_remarks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which document the remark was left on: 'release-1', 'plan'. Free text
  -- rather than an enum so adding a document does not need a migration; the
  -- route validates it against the list of documents that actually exist.
  doc         text NOT NULL,
  -- Optional. Readers are anonymous by design and we would rather have an
  -- unsigned remark than no remark, but most people do put a name.
  author      text,
  -- 'suggestion' | 'question' | 'concern' | 'agree' — a coarse sort, so a
  -- blocking objection is not read as a nice-to-have.
  kind        text NOT NULL DEFAULT 'suggestion',
  -- Which part of the document it is about, e.g. 'Short-term projects'.
  topic       text,
  body        text NOT NULL,
  -- TRUE hides a remark from the page without deleting it. There is no UI for
  -- this: it is an UPDATE in the SQL editor for spam, which an unauthenticated
  -- form on a shared link will eventually attract.
  hidden      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_remarks_body_len CHECK (char_length(body) BETWEEN 3 AND 4000),
  CONSTRAINT report_remarks_author_len CHECK (author IS NULL OR char_length(author) <= 80),
  CONSTRAINT report_remarks_topic_len CHECK (topic IS NULL OR char_length(topic) <= 120),
  CONSTRAINT report_remarks_doc_len CHECK (char_length(doc) BETWEEN 1 AND 40),
  CONSTRAINT report_remarks_kind_valid
    CHECK (kind IN ('suggestion', 'question', 'concern', 'agree'))
);

-- The only read the page performs: visible remarks on one document, newest last.
CREATE INDEX IF NOT EXISTS report_remarks_doc_idx
  ON public.report_remarks (doc, created_at)
  WHERE hidden = false;

ALTER TABLE public.report_remarks ENABLE ROW LEVEL SECURITY;
-- No policies. See the note above — this is the deny-all case, on purpose.

COMMENT ON TABLE public.report_remarks IS
  'Reader remarks on the internal product documents served at /r/<token>. '
  'Service-role only: RLS is enabled with no policies so anon and '
  'authenticated are both denied, and the API route is the only way in.';
