-- St. Mary's Syro-Malabar Parish PWA - Phase 2 Enhancement Migration
-- Adds:
-- 1. Granular RBAC (Super Admin / Vicar vs. Trustee / Secretary) enforced in RLS & Triggers
-- 2. Admin Governance fields (designation, invite_status, last_active_at, invited_by)
-- 3. Dynamic Theme Configuration singleton table (public.app_settings)
-- 4. Expanded Immutable Audit Log actions & triggers for admin_users and app_settings
-- 5. Safe FK cleanup (ON DELETE SET NULL) so revoking/deleting an Auth user never hits FK errors

-- ============================================================================
-- 1. EXPAND admin_users SCHEMA & RBAC HELPERS
-- ============================================================================
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS invite_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.admin_users'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%role%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admin_users DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('super_admin', 'vicar', 'trustee', 'secretary'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.admin_users'::regclass
      AND conname = 'admin_users_invite_status_check'
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_invite_status_check
      CHECK (invite_status IN ('active', 'pending_invite'));
  END IF;
END $$;

-- Ensure updated_by / invited_by FKs use ON DELETE SET NULL so deleted admins don't block auth cleanup
DO $$
DECLARE
  v_fk TEXT;
BEGIN
  SELECT c.conname INTO v_fk
  FROM pg_constraint c
  WHERE c.conrelid = 'public.weekly_bulletins'::regclass
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%updated_by%';

  IF v_fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.weekly_bulletins DROP CONSTRAINT %I', v_fk);
  END IF;

  ALTER TABLE public.weekly_bulletins
    ADD CONSTRAINT weekly_bulletins_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

  SELECT c.conname INTO v_fk
  FROM pg_constraint c
  WHERE c.conrelid = 'public.admin_users'::regclass
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%invited_by%';

  IF v_fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admin_users DROP CONSTRAINT %I', v_fk);
  END IF;

  ALTER TABLE public.admin_users
    ADD CONSTRAINT admin_users_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;

-- Backfill designation on existing admin rows if blank
UPDATE public.admin_users
SET designation = CASE
  WHEN role IN ('super_admin', 'vicar') THEN 'Parish Vicar / Super Admin'
  WHEN role = 'trustee' THEN 'Parish Trustee'
  ELSE 'Parish Secretary'
END
WHERE designation IS NULL;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = auth.uid()
      AND is_active = true
      AND role IN ('super_admin', 'vicar')
  );
$$;

-- Record active status & timestamp on admin login
CREATE OR REPLACE FUNCTION public.touch_admin_last_active()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.admin_users
  SET
    invite_status = 'active',
    last_active_at = now(),
    updated_at = now()
  WHERE user_id = auth.uid()
    AND is_active = true;
END;
$$;

-- ============================================================================
-- 2. DATABASE GUARDRAIL TRIGGER FOR admin_users (ANTI-ESCALATION & LOCKOUT)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_admin_users_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_caller_is_super BOOLEAN := false;
  v_remaining_super INTEGER := 0;
BEGIN
  -- When invoked via authenticated user JWT (REST/client), strictly enforce Super Admin RBAC
  IF v_uid IS NOT NULL THEN
    SELECT public.is_super_admin() INTO v_caller_is_super;
    IF NOT v_caller_is_super THEN
      RAISE EXCEPTION 'Forbidden: Only Super Admin / Vicar can modify admin users or roles';
    END IF;

    -- Block self-deletion or self-deactivation
    IF TG_OP = 'DELETE' THEN
      IF OLD.user_id = v_uid THEN
        RAISE EXCEPTION 'Cannot delete your own currently active admin account';
      END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF OLD.user_id = v_uid AND NEW.is_active = false THEN
        RAISE EXCEPTION 'Cannot deactivate your own currently active admin account';
      END IF;
    END IF;
  END IF;

  -- Prevent deleting, deactivating, or demoting the last active Super Admin / Vicar
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_active = true AND OLD.role IN ('super_admin', 'vicar') THEN
      SELECT COUNT(*)::INTEGER INTO v_remaining_super
      FROM public.admin_users
      WHERE user_id <> OLD.user_id
        AND is_active = true
        AND role IN ('super_admin', 'vicar');

      IF v_remaining_super < 1 THEN
        RAISE EXCEPTION 'Cannot remove the last remaining active Super Admin / Vicar';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true
       AND OLD.role IN ('super_admin', 'vicar')
       AND (NEW.is_active = false OR NEW.role NOT IN ('super_admin', 'vicar')) THEN
      SELECT COUNT(*)::INTEGER INTO v_remaining_super
      FROM public.admin_users
      WHERE user_id <> OLD.user_id
        AND is_active = true
        AND role IN ('super_admin', 'vicar');

      IF v_remaining_super < 1 THEN
        RAISE EXCEPTION 'Cannot demote or deactivate the last remaining active Super Admin / Vicar';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_admin_users_mutation ON public.admin_users;
CREATE TRIGGER trg_guard_admin_users_mutation
  BEFORE INSERT OR UPDATE OR DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_users_mutation();

-- ============================================================================
-- 3. PARISH APP SETTINGS (GLOBAL THEME OVERRIDE SINGLETON)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  theme_mode TEXT NOT NULL DEFAULT 'auto' CHECK (
    theme_mode IN (
      'auto',
      'classic',
      'subara',
      'denaha',
      'sauma-ramba',
      'qyamta',
      'sliha',
      'qaita',
      'elijah-sliba-moses',
      'mushah',
      'qudash-edta'
    )
  ),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id, theme_mode)
VALUES (1, 'auto')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read app_settings" ON public.app_settings;
CREATE POLICY "Public read app_settings"
  ON public.app_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Super admins manage app_settings" ON public.app_settings;
CREATE POLICY "Super admins manage app_settings"
  ON public.app_settings FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============================================================================
-- 4. GRANULAR RBAC RLS ON admin_users AND weekly_bulletins
-- ============================================================================
DROP POLICY IF EXISTS "Admin read self" ON public.admin_users;
DROP POLICY IF EXISTS "Admins read admin_users" ON public.admin_users;
CREATE POLICY "Admins read admin_users"
  ON public.admin_users FOR SELECT
  USING (user_id = auth.uid() OR public.is_active_admin());

DROP POLICY IF EXISTS "Super admins manage admin_users" ON public.admin_users;
CREATE POLICY "Super admins manage admin_users"
  ON public.admin_users FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Split weekly_bulletins policies so Trustees can create/edit/publish,
-- while only Super Admin / Vicar can permanently DELETE a bulletin.
DROP POLICY IF EXISTS "Admins manage bulletins" ON public.weekly_bulletins;
DROP POLICY IF EXISTS "Admins insert bulletins" ON public.weekly_bulletins;
DROP POLICY IF EXISTS "Admins update bulletins" ON public.weekly_bulletins;
DROP POLICY IF EXISTS "Super admins delete bulletins" ON public.weekly_bulletins;

CREATE POLICY "Admins insert bulletins"
  ON public.weekly_bulletins FOR INSERT
  WITH CHECK (public.is_active_admin());

CREATE POLICY "Admins update bulletins"
  ON public.weekly_bulletins FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "Super admins delete bulletins"
  ON public.weekly_bulletins FOR DELETE
  USING (public.is_super_admin());

-- ============================================================================
-- 5. EXPAND IMMUTABLE AUDIT LOGS FOR RBAC & THEME GOVERNANCE
-- ============================================================================
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  WHERE c.conrelid = 'public.audit_logs'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%action%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check
  CHECK (
    action IN (
      'CREATE',
      'UPDATE',
      'DELETE',
      'PUBLISH',
      'PUSH_DISPATCH',
      'USER_INVITE',
      'ROLE_CHANGE',
      'USER_DEACTIVATE',
      'USER_DELETE',
      'PASSWORD_RESET',
      'THEME_CHANGE'
    )
  );

-- Update generic audit logger to emit THEME_CHANGE for app_settings and ignore touch_admin_last_active noise
-- Uses to_jsonb(OLD/NEW) so table-specific columns (theme_mode, status) never fail PL/pgSQL record binding on other tables.
CREATE OR REPLACE FUNCTION public.log_admin_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_role TEXT;
  v_action TEXT := TG_OP;
  v_record_id TEXT;
  v_summary TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_data := to_jsonb(OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_data := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'app_settings'
     AND TG_OP = 'UPDATE'
     AND (v_old_data ->> 'theme_mode') IS NOT DISTINCT FROM (v_new_data ->> 'theme_mode') THEN
    RETURN NEW;
  END IF;

  SELECT email, role INTO v_email, v_role
  FROM public.admin_users
  WHERE user_id = v_uid;

  IF v_email IS NULL THEN
    v_email := COALESCE(auth.jwt() ->> 'email', 'system_seed_or_service');
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_record_id := COALESCE(v_new_data ->> 'id', v_new_data ->> 'user_id', '');
    v_summary := format('CREATE on %s (%s)', TG_TABLE_NAME, v_record_id);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := COALESCE(v_new_data ->> 'id', v_new_data ->> 'user_id', '');
    IF TG_TABLE_NAME = 'weekly_bulletins'
       AND (v_old_data ->> 'status') = 'draft'
       AND (v_new_data ->> 'status') = 'published' THEN
      v_action := 'PUBLISH';
      v_summary := format('PUBLISH on %s (%s)', TG_TABLE_NAME, v_record_id);
    ELSIF TG_TABLE_NAME = 'app_settings' THEN
      v_action := 'THEME_CHANGE';
      v_summary := format(
        'Changed active theme from "%s" to "%s"',
        COALESCE(v_old_data ->> 'theme_mode', ''),
        COALESCE(v_new_data ->> 'theme_mode', '')
      );
    ELSE
      v_action := 'UPDATE';
      v_summary := format('UPDATE on %s (%s)', TG_TABLE_NAME, v_record_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_record_id := COALESCE(v_old_data ->> 'id', v_old_data ->> 'user_id', '');
    v_summary := format('DELETE on %s (%s)', TG_TABLE_NAME, v_record_id);
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_email,
    actor_role,
    action,
    table_name,
    record_id,
    change_summary,
    old_data,
    new_data
  ) VALUES (
    v_uid,
    v_email,
    v_role,
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_summary,
    v_old_data,
    v_new_data
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_app_settings ON public.app_settings;
CREATE TRIGGER trg_audit_app_settings
  AFTER INSERT OR UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_mutation();
