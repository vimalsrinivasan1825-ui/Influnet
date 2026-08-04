-- 101: Admin issue/fix tracker.
--
-- A running list of known product issues the admin team is working through,
-- tracked from the admin dashboard itself instead of an external doc. Each
-- row is one issue: what's wrong, when it was reported, its status, and once
-- fixed — what was done and exactly when it was marked fixed. `fixed_at` is
-- set server-side the moment status flips to 'fixed', never client-supplied,
-- so it's a real record rather than something that can be backdated.

CREATE TABLE IF NOT EXISTS public.admin_issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text NOT NULL,
  fix_notes    text,
  status       text NOT NULL DEFAULT 'pending',
    -- 'pending'|'in_progress'|'fixed'
  issue_date   date NOT NULL DEFAULT current_date,
  fixed_at     timestamptz,
  created_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_issues_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT admin_issues_status_valid
    CHECK (status IN ('pending', 'in_progress', 'fixed')),
  -- Lets the seed insert below use ON CONFLICT DO NOTHING so re-running this
  -- migration can never duplicate the seeded rows. Titles are otherwise free
  -- text an admin can edit after creation.
  CONSTRAINT admin_issues_title_unique UNIQUE (title)
);

CREATE INDEX IF NOT EXISTS admin_issues_status_idx
  ON public.admin_issues (status, issue_date DESC);

ALTER TABLE public.admin_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_issues_select ON public.admin_issues;
CREATE POLICY admin_issues_select ON public.admin_issues
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS admin_issues_insert ON public.admin_issues;
CREATE POLICY admin_issues_insert ON public.admin_issues
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_issues_update ON public.admin_issues;
CREATE POLICY admin_issues_update ON public.admin_issues
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS admin_issues_delete ON public.admin_issues;
CREATE POLICY admin_issues_delete ON public.admin_issues
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ── Seed: the 13 issues reported 2026-08-03 ──────────────────────────────
INSERT INTO public.admin_issues (title, description, status, issue_date) VALUES
  ('City suggestions on signup',
   'City field on signup (web + mobile, influencer + business) is plain free text. Needs a searchable city-suggestion list.',
   'pending', '2026-08-03'),
  ('Real-time username/email validation',
   'Username and email should be checked against existing accounts as the user types and show a clear "already exists" message. Live on web influencer signup; missing on mobile business signup.',
   'pending', '2026-08-03'),
  ('Block private Instagram accounts',
   'Private accounts currently get flagged as informational only, not blocked. Only public accounts should be allowed to complete verification / use the platform.',
   'pending', '2026-08-03'),
  ('Verification card is unclear',
   'When confidence score is under the threshold, the card just says "not verified" with no explanation. Needs to show the actual score, that it is pending admin review, and what is missing so the creator can act on it.',
   'pending', '2026-08-03'),
  ('Instagram browser sign-in should offer app vs web',
   'Tapping the app link from inside Instagram should prompt "Continue in app" vs "Continue in browser" instead of always opening the web page.',
   'pending', '2026-08-03'),
  ('Profile On/Off switch has UI delay and does not work reliably',
   'Toggling a profile section visibility switch does not take effect properly on mobile; also feels slow/laggy.',
   'pending', '2026-08-03'),
  ('Messaging: connection errors between devices',
   'Chat fails to connect on iOS<->Android, and shows a connection error Android<->Android. Reported with a screenshot: "Couldn''t connect to chat. Pull down to try again."',
   'pending', '2026-08-03'),
  ('Admin search should match URL or username',
   'Admin search only matches on username substring. Searching by a pasted Instagram URL or handle should also find the creator.',
   'pending', '2026-08-03'),
  ('Business profile edit missing on mobile',
   'There is no way for a business account to edit their profile from the mobile app.',
   'pending', '2026-08-03'),
  ('Phone number OTP verification',
   'Phone number should be verified with an OTP at signup. Password stays — this is in addition to it, not a replacement.',
   'pending', '2026-08-03'),
  ('Manual project delete + Deleted Projects section',
   'Users should be able to manually delete a project (e.g. after cancellation) without needing mutual verification. Deleted projects move to a separate "Deleted Projects" section and are kept there, never removed entirely.',
   'pending', '2026-08-03'),
  ('Connections count on Portfolio page',
   'Add a visible count of My Connections and move it to the top of the Portfolio/Profile page.',
   'pending', '2026-08-03'),
  ('Coloured verified tick reserved for Premium',
   'The coloured/animated verified tick should only show for Premium users; Free users get a plain tick. No premium tier exists yet — this is queued until that is built.',
   'pending', '2026-08-03')
ON CONFLICT DO NOTHING;
