-- Fix PL/pgSQL record field binding errors in shared trigger functions
-- Specifically:
--   - `record "old" has no field "theme_mode"` when log_admin_mutation() fires on non-app_settings tables
--   - `record "old" has no field "status"` when log_admin_mutation() fires on non-weekly_bulletins tables
--   - `record "old" is not assigned yet` if guard_admin_users_mutation() fires on INSERT with auth.uid() set

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
