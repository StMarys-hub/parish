-- St. Mary's Syro-Malabar Parish PWA - Phase 1 Initial Schema
-- Zero-Cost, Zero-Credit-Card Architecture on Supabase Free Tier
-- Includes strict RLS, Storage policies, and tamper-proof append-only audit logs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. AUTHORIZED ADMINS ALLOW-LIST
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('vicar', 'trustee', 'secretary')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_active_admin()
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
  );
$$;

-- ============================================================================
-- 2. PARISH INFO (SINGLETON FOR "ABOUT PARISH" MODULE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.parish_info (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  parish_name TEXT NOT NULL,
  diocese_name TEXT NOT NULL,
  address_line TEXT NOT NULL,
  maps_url TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  website_url TEXT NOT NULL,
  vicar_name TEXT NOT NULL,
  vicar_title TEXT NOT NULL DEFAULT 'Parish Vicar',
  trustees JSONB NOT NULL DEFAULT '[]'::jsonb,
  office_hours TEXT,
  general_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. REGULAR RECURRING SCHEDULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.regular_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order INT NOT NULL DEFAULT 0,
  group_name TEXT NOT NULL,
  day_label TEXT NOT NULL,
  time_label TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. WEEKLY BULLETINS (SINGLE-PAYLOAD FETCH + 3-WEEK ROLLING ARCHIVE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.weekly_bulletins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version SMALLINT NOT NULL DEFAULT 1,
  week_start DATE NOT NULL UNIQUE,
  week_end DATE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT 'Church Services & Parish Announcements',
  greeting TEXT NOT NULL DEFAULT 'Praise be to Jesus Christ, Now, Always, and Forever!',
  intro_text TEXT,
  daily_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  announcements JSONB NOT NULL DEFAULT '[]'::jsonb,
  collection_summary JSONB,
  sign_off JSONB NOT NULL DEFAULT '{
    "closing": "With Prayers,",
    "name": "Fr. Rajeev Valiyaveettil",
    "title": "Vicar, St. Mary''s Syro Malabar Catholic Church",
    "email": "vicar@stmarysyroclt.org",
    "website": "https://stmarysyroclt.org/"
  }'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  push_sent_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_week_dates CHECK (week_end >= week_start)
);

CREATE INDEX IF NOT EXISTS idx_bulletins_published_week
  ON public.weekly_bulletins (week_start DESC)
  WHERE status = 'published';

-- ============================================================================
-- 5. WEB PUSH SUBSCRIPTIONS (PRIVATE TO SERVICE ROLE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios_pwa', 'android', 'desktop', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at TIMESTAMPTZ
);

-- Allow a device to unsubscribe itself using only its secret endpoint URL
-- without granting public SELECT/DELETE on other parishioners' rows.
CREATE OR REPLACE FUNCTION public.unsubscribe_push(p_endpoint TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.push_subscriptions
  SET is_active = false
  WHERE endpoint = p_endpoint;
END;
$$;

-- Allow active admins to read aggregate subscriber count for Publish confirmation
CREATE OR REPLACE FUNCTION public.get_active_subscriber_count()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.push_subscriptions
  WHERE is_active = true;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- 6. TAMPER-PROOF APPEND-ONLY AUDIT LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID,
  actor_email TEXT NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'PUSH_DISPATCH')),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

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
BEGIN
  SELECT email, role INTO v_email, v_role
  FROM public.admin_users
  WHERE user_id = v_uid;

  IF v_email IS NULL THEN
    v_email := COALESCE(auth.jwt() ->> 'email', 'system_seed_or_service');
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_record_id := NEW.id::text;
  ELSIF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'weekly_bulletins' AND OLD.status = 'draft' AND NEW.status = 'published' THEN
      v_action := 'PUBLISH';
    ELSE
      v_action := 'UPDATE';
    END IF;
    v_record_id := NEW.id::text;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_record_id := OLD.id::text;
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
    format('%s on %s (%s)', v_action, TG_TABLE_NAME, v_record_id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bulletins ON public.weekly_bulletins;
CREATE TRIGGER trg_audit_bulletins
  AFTER INSERT OR UPDATE OR DELETE ON public.weekly_bulletins
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_mutation();

DROP TRIGGER IF EXISTS trg_audit_schedules ON public.regular_schedules;
CREATE TRIGGER trg_audit_schedules
  AFTER INSERT OR UPDATE OR DELETE ON public.regular_schedules
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_mutation();

DROP TRIGGER IF EXISTS trg_audit_parish ON public.parish_info;
CREATE TRIGGER trg_audit_parish
  AFTER INSERT OR UPDATE OR DELETE ON public.parish_info
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_mutation();

-- Strict Immutability Lock on audit_logs
CREATE OR REPLACE FUNCTION public.prevent_audit_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is strictly append-only and immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_tampering();

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;

-- ============================================================================
-- 7. ROW LEVEL SECURITY (ZERO-TRUST DEFAULTS)
-- ============================================================================
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parish_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regular_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Public Read-Only Policies
CREATE POLICY "Public read parish_info"
  ON public.parish_info FOR SELECT
  USING (true);

CREATE POLICY "Public read active schedules"
  ON public.regular_schedules FOR SELECT
  USING (is_active = true OR public.is_active_admin());

CREATE POLICY "Public read published bulletins"
  ON public.weekly_bulletins FOR SELECT
  USING (status = 'published' OR public.is_active_admin());

-- Admin Read/Write Policies
CREATE POLICY "Admin read self"
  ON public.admin_users FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage parish_info"
  ON public.parish_info FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "Admins manage schedules"
  ON public.regular_schedules FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "Admins manage bulletins"
  ON public.weekly_bulletins FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "Admins read audit_logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_active_admin());

-- Push Subscriptions: Public INSERT only with structural sanity checks
CREATE POLICY "Anyone can subscribe push"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (
    char_length(endpoint) BETWEEN 20 AND 1000
    AND endpoint LIKE 'https://%'
    AND char_length(p256dh) BETWEEN 20 AND 200
    AND char_length(auth) BETWEEN 10 AND 100
  );

-- ============================================================================
-- 8. STORAGE BUCKET FOR FLYERS & BROCHURES (5 MB MAX, SAFE MIME TYPES ONLY)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'flyers',
  'flyers',
  true,
  5242880,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Public read flyers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'flyers');

CREATE POLICY "Admins upload flyers"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'flyers' AND public.is_active_admin());

CREATE POLICY "Admins delete flyers"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'flyers' AND public.is_active_admin());
