-- Migration 176: admin team roles — super admin → admin → staff
--
-- Before this, "admin" was two tiers (150): a Developer / Super Admin who sees
-- everything, and a Business / Client Admin who sees every non-technical
-- section. Nobody could hand out narrower access, and the only way to mint an
-- admin was scripts/create-admin.mjs on a machine holding the service key.
--
-- Now the console has a team:
--
--   super admin  profiles.is_super_admin. Everything, including the developer
--                sections. Still provisioned only by the script.
--   admin        created by a super admin. Holds the sections it was granted.
--                With `team` access it may create STAFF — never another admin.
--   staff        created by a super admin or an admin. Holds the sections it
--                was granted. Creates nobody.
--
-- Each member holds a level per section: 'view' (read) or 'manage' (read and
-- change). A creator may only grant what they hold, at most at the level they
-- hold it, and may never reveal a field group that is hidden from them. The
-- same rule is checked in the API for a readable error and here, where it is
-- actually enforced.
--
-- Every member keeps profiles.role = 'admin' — that is what opens the console
-- and what the existing is_admin() RLS policies key on. Section scoping is
-- applied in the API (withAdmin); see "Known limit" at the bottom.

-- ── Catalog ──────────────────────────────────────────────────────────────────
-- The sections and field groups that can be delegated. Kept in step with
-- apps/web/src/lib/admin-access.ts by tests/unit/admin-access.test.ts.
CREATE OR REPLACE FUNCTION public.admin_delegable_modules()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'overview', 'founder', 'activity', 'analytics', 'customers', 'app_activity',
    'campaigns', 'projects', 'requests', 'marketplace',
    'payments', 'subscribers',
    'broadcasts', 'leads', 'early_access', 'events',
    'approvals', 'users', 'support', 'moderation', 'feedback',
    'report_builder', 'errors', 'otp',
    'team'
  ]::TEXT[];
$$;

CREATE OR REPLACE FUNCTION public.admin_field_groups()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['email', 'phone', 'money', 'location', 'device']::TEXT[];
$$;

CREATE OR REPLACE FUNCTION public.admin_level_rank(p_level TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_level WHEN 'manage' THEN 2 WHEN 'view' THEN 1 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.admin_permissions_valid(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(p) e
        WHERE e.value NOT IN ('"view"'::jsonb, '"manage"'::jsonb)
           OR NOT (e.key = ANY (public.admin_delegable_modules()))
     );
$$;

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_members (
  user_id       UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  tier          TEXT NOT NULL CHECK (tier IN ('admin', 'staff')),
  permissions   JSONB NOT NULL DEFAULT '{}'::jsonb
                CHECK (public.admin_permissions_valid(permissions)),
  hidden_fields TEXT[] NOT NULL DEFAULT '{}'
                CHECK (hidden_fields <@ public.admin_field_groups()),
  created_by    UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  disabled_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Staff never manage the team; that is what keeps the hierarchy two deep.
  CONSTRAINT admin_members_staff_no_team CHECK (tier = 'admin' OR NOT permissions ? 'team')
);

CREATE INDEX IF NOT EXISTS admin_members_created_by_idx ON public.admin_members (created_by);

COMMENT ON TABLE public.admin_members IS
  'Admin team (176). One row per non-super admin account: tier, per-section levels, hidden field groups. Read and written only through the service role.';

-- Nobody reads or writes this from a user session. The API reads it with the
-- service role after authenticating the caller; writes go through the
-- functions below.
ALTER TABLE public.admin_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_members FROM anon, authenticated;

-- Everyone who is an admin today keeps exactly what they have: every
-- non-technical section, at manage, nothing hidden.
INSERT INTO public.admin_members (user_id, tier, permissions)
SELECT p.id, 'admin',
       (SELECT jsonb_object_agg(m, 'manage') FROM unnest(public.admin_delegable_modules()) m)
  FROM public.profiles p
 WHERE p.role = 'admin' AND NOT p.is_super_admin
ON CONFLICT (user_id) DO NOTHING;

-- ── Hierarchy ────────────────────────────────────────────────────────────────
-- 3 = super admin, 2 = active admin, 1 = active staff, 0 = anything else.
CREATE OR REPLACE FUNCTION public.admin_tier_rank(p_user UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role <> 'admin' THEN 0
    WHEN p.is_super_admin THEN 3
    WHEN m.disabled_at IS NOT NULL THEN 0
    WHEN m.tier = 'admin' THEN 2
    WHEN m.tier = 'staff' THEN 1
    ELSE 0
  END
  FROM public.profiles p
  LEFT JOIN public.admin_members m ON m.user_id = p.id
  WHERE p.id = p_user;
$$;

-- Why p_actor may NOT make this grant, or NULL when it may. The API calls this
-- before creating an auth user, so a refused request leaves nothing behind.
CREATE OR REPLACE FUNCTION public.admin_grant_problem(
  p_actor       UUID,
  p_tier        TEXT,
  p_permissions JSONB,
  p_hidden      TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank   INT := coalesce(public.admin_tier_rank(p_actor), 0);
  v_target INT := CASE p_tier WHEN 'admin' THEN 2 WHEN 'staff' THEN 1 ELSE NULL END;
  v_actor  public.admin_members;
  v_key    TEXT;
  v_level  TEXT;
BEGIN
  IF v_target IS NULL THEN
    RETURN 'Unknown account type.';
  END IF;
  IF p_permissions IS NULL OR NOT public.admin_permissions_valid(p_permissions) THEN
    RETURN 'One of the sections or access levels is not recognised.';
  END IF;
  IF NOT (coalesce(p_hidden, '{}') <@ public.admin_field_groups()) THEN
    RETURN 'One of the hidden field groups is not recognised.';
  END IF;
  IF p_tier = 'staff' AND p_permissions ? 'team' THEN
    RETURN 'Staff accounts cannot manage the team.';
  END IF;
  IF v_rank <= v_target THEN
    RETURN CASE
      WHEN v_rank = 2 THEN 'Admins can create staff, not other admins.'
      ELSE 'Your account cannot create or change team members.'
    END;
  END IF;

  -- A super admin holds everything; nothing further to check.
  IF v_rank = 3 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_actor FROM public.admin_members WHERE user_id = p_actor;

  IF public.admin_level_rank(v_actor.permissions ->> 'team') < 2 THEN
    RETURN 'Your account does not have permission to manage the team.';
  END IF;

  FOR v_key, v_level IN SELECT key, value #>> '{}' FROM jsonb_each(p_permissions) LOOP
    IF public.admin_level_rank(v_level) > public.admin_level_rank(v_actor.permissions ->> v_key) THEN
      RETURN format('You cannot grant %s access to "%s" — your own access is %s.',
                    v_level, v_key, coalesce(v_actor.permissions ->> v_key, 'none'));
    END IF;
  END LOOP;

  IF NOT (v_actor.hidden_fields <@ coalesce(p_hidden, '{}')) THEN
    RETURN 'You cannot show fields that are hidden from you.';
  END IF;

  RETURN NULL;
END;
$$;

-- May p_actor change p_target? A super admin manages every member; an admin
-- with team access manages only the staff they created.
CREATE OR REPLACE FUNCTION public.admin_can_manage(p_actor UUID, p_target UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_actor IS DISTINCT FROM p_target
     AND EXISTS (SELECT 1 FROM public.admin_members t WHERE t.user_id = p_target)
     AND CASE coalesce(public.admin_tier_rank(p_actor), 0)
       WHEN 3 THEN true
       WHEN 2 THEN EXISTS (
         SELECT 1
           FROM public.admin_members t
           JOIN public.admin_members a ON a.user_id = p_actor
          WHERE t.user_id = p_target
            AND t.tier = 'staff'
            AND t.created_by = p_actor
            AND public.admin_level_rank(a.permissions ->> 'team') = 2
       )
       ELSE false
     END;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────
-- Create or update a member. For a new member the auth user must already exist
-- (the API creates it through the Auth Admin API) and must not have a profile:
-- this never converts an existing creator or business account into staff.
CREATE OR REPLACE FUNCTION public.admin_team_save(
  p_actor       UUID,
  p_user        UUID,
  p_email       TEXT,
  p_name        TEXT,
  p_tier        TEXT,
  p_permissions JSONB,
  p_hidden      TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_problem  TEXT;
  v_existing public.admin_members;
  v_hidden   TEXT[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_hidden, '{}')) ORDER BY 1);
  v_row      public.admin_members;
BEGIN
  IF NOT public.is_privileged_connection() THEN
    RAISE EXCEPTION 'admin_team_save requires a privileged connection' USING ERRCODE = '42501';
  END IF;

  v_problem := public.admin_grant_problem(p_actor, p_tier, p_permissions, v_hidden);
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing FROM public.admin_members WHERE user_id = p_user FOR UPDATE;

  IF FOUND THEN
    IF NOT public.admin_can_manage(p_actor, p_user) THEN
      RAISE EXCEPTION 'You cannot change this team member.' USING ERRCODE = '42501';
    END IF;
    -- An admin with staff under them cannot be turned into staff: their staff
    -- would be left with a creator who can no longer manage them.
    IF v_existing.tier = 'admin' AND p_tier = 'staff'
       AND EXISTS (SELECT 1 FROM public.admin_members WHERE created_by = p_user) THEN
      RAISE EXCEPTION 'This admin has staff. Reassign or disable them first.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.admin_members
       SET tier = p_tier, permissions = p_permissions, hidden_fields = v_hidden, updated_at = now()
     WHERE user_id = p_user
    RETURNING * INTO v_row;

    IF p_name IS NOT NULL THEN
      UPDATE public.profiles SET name = p_name, updated_at = now() WHERE id = p_user;
    END IF;

    -- Delegation must stay a subset after the creator loses access: clamp
    -- every staff member this admin created, and hide what is hidden from them.
    UPDATE public.admin_members s
       SET permissions = coalesce((
             SELECT jsonb_object_agg(
                      e.key,
                      CASE WHEN public.admin_level_rank(e.value #>> '{}')
                                <= public.admin_level_rank(p_permissions ->> e.key)
                           THEN e.value
                           ELSE to_jsonb(p_permissions ->> e.key) END)
               FROM jsonb_each(s.permissions) e
              WHERE p_permissions ? e.key), '{}'::jsonb),
           hidden_fields = ARRAY(SELECT DISTINCT unnest(s.hidden_fields || v_hidden) ORDER BY 1),
           updated_at = now()
     WHERE s.created_by = p_user AND s.tier = 'staff';

    INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_id, target_type, metadata)
    VALUES (p_actor, (SELECT email FROM public.profiles WHERE id = p_actor), 'admin_member_updated', p_user, 'admin_member',
            jsonb_build_object(
              'tier', p_tier, 'previous_tier', v_existing.tier,
              'permissions', p_permissions, 'previous_permissions', v_existing.permissions,
              'hidden_fields', v_hidden, 'previous_hidden_fields', v_existing.hidden_fields));
  ELSE
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user) THEN
      RAISE EXCEPTION 'auth user % does not exist', p_user;
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN
      RAISE EXCEPTION 'This email already belongs to an Influnet account.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.profiles (id, role, email, name, verification_status, is_super_admin)
    VALUES (p_user, 'admin', p_email, coalesce(nullif(p_name, ''), 'Team member'), 'verified', false);

    INSERT INTO public.admin_members (user_id, tier, permissions, hidden_fields, created_by)
    VALUES (p_user, p_tier, p_permissions, v_hidden, p_actor)
    RETURNING * INTO v_row;

    INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_id, target_type, metadata)
    VALUES (p_actor, (SELECT email FROM public.profiles WHERE id = p_actor), 'admin_member_created', p_user, 'admin_member',
            jsonb_build_object('email', p_email, 'tier', p_tier,
                               'permissions', p_permissions, 'hidden_fields', v_hidden));
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_team_set_disabled(
  p_actor    UUID,
  p_user     UUID,
  p_disabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_members;
BEGIN
  IF NOT public.is_privileged_connection() THEN
    RAISE EXCEPTION 'admin_team_set_disabled requires a privileged connection' USING ERRCODE = '42501';
  END IF;
  IF NOT public.admin_can_manage(p_actor, p_user) THEN
    RAISE EXCEPTION 'You cannot change this team member.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_members
     SET disabled_at = CASE WHEN p_disabled THEN coalesce(disabled_at, now()) ELSE NULL END,
         updated_at = now()
   WHERE user_id = p_user
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_id, target_type, metadata)
  VALUES (p_actor, (SELECT email FROM public.profiles WHERE id = p_actor), CASE WHEN p_disabled THEN 'admin_member_disabled' ELSE 'admin_member_enabled' END,
          p_user, 'admin_member', jsonb_build_object('tier', v_row.tier));

  RETURN to_jsonb(v_row);
END;
$$;

-- ── is_admin(): a disabled member is not an admin ────────────────────────────
-- Every admin RLS policy and admin_* RPC keys on this, so disabling a member
-- also shuts the direct-PostgREST path, not just the API.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.role = 'admin'
       AND NOT EXISTS (
         SELECT 1 FROM public.admin_members m
          WHERE m.user_id = p.id AND m.disabled_at IS NOT NULL
       )
  );
$$;

-- ── provision_admin(): the script path joins the team model ─────────────────
-- Same contract as 151. Additionally: a non-super admin gets a member row with
-- every section (what the script has always meant), and a super admin loses
-- any member row, whose permissions would no longer mean anything.
CREATE OR REPLACE FUNCTION public.provision_admin(
  p_user_id        UUID,
  p_email          TEXT,
  p_name           TEXT    DEFAULT NULL,
  p_is_super_admin BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing       public.user_role;
  v_existing_super BOOLEAN;
  v_super          BOOLEAN;
BEGIN
  IF NOT public.is_privileged_connection() THEN
    RAISE EXCEPTION 'provision_admin requires a privileged connection'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'auth user % does not exist', p_user_id;
  END IF;

  SELECT role, is_super_admin INTO v_existing, v_existing_super
    FROM public.profiles WHERE id = p_user_id;

  v_super := coalesce(p_is_super_admin, v_existing_super, false);

  INSERT INTO public.profiles (id, role, email, name, verification_status, is_super_admin)
  VALUES (p_user_id, 'admin', p_email, coalesce(p_name, 'Platform Admin'), 'verified', v_super)
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        name = coalesce(p_name, public.profiles.name),
        verification_status = 'verified',
        is_super_admin = v_super,
        updated_at = now();

  IF v_super THEN
    DELETE FROM public.admin_members WHERE user_id = p_user_id;
  ELSE
    INSERT INTO public.admin_members (user_id, tier, permissions)
    VALUES (p_user_id, 'admin',
            (SELECT jsonb_object_agg(m, 'manage') FROM unnest(public.admin_delegable_modules()) m))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_id, target_type, metadata)
  VALUES (p_user_id, p_email, 'admin_provisioned', p_user_id, 'profile',
          jsonb_build_object('previous_role', v_existing,
                             'previous_is_super_admin', v_existing_super,
                             'is_super_admin', v_super));

  RETURN jsonb_build_object('user_id', p_user_id, 'email', p_email, 'role', 'admin',
                            'previous_role', v_existing, 'is_super_admin', v_super);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_admin(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_tier_rank(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_grant_problem(UUID, TEXT, JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_can_manage(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_team_save(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_team_set_disabled(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ── Known limit ──────────────────────────────────────────────────────────────
-- Section scoping and field hiding are enforced by the API, not by RLS. A
-- staff member's own JWT still satisfies is_admin(), so calling an admin_*
-- RPC directly through PostgREST reaches data outside their sections. Moving
-- that check into each RPC (is_admin() → admin_has_permission('<section>'))
-- is the follow-up; until then, grant team accounts to people you would trust
-- with a read of the admin reports.
