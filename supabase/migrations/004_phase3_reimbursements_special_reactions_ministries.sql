-- St. Mary's Syro-Malabar Parish PWA - Phase 3 Enhancement Migration
-- Adds:
-- 1. Parishioner Expense Reimbursement Portal (`public.reimbursements`) + private `receipts` Storage bucket
-- 2. Standalone Vicar / Special Announcements (`public.special_announcements`)
-- 3. Privacy-Safe "Like / Appreciate" Reactions (`public.announcement_reactions`) + Batch/Toggle RPCs
-- 4. Ministry Weekly Updates (`public.ministry_updates`)
-- 5. Strict RLS, Audit Log extensions & Triggers (reuses `003_fix_audit_trigger.sql` `log_admin_mutation()`)

-- ============================================================================
-- 1. EXPAND AUDIT LOG ACTIONS FOR REIMBURSEMENTS
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
      'THEME_CHANGE',
      'REIMBURSEMENT_APPROVED',
      'REIMBURSEMENT_PAID',
      'REIMBURSEMENT_DECLINED'
    )
  );

-- ============================================================================
-- 2. EXPENSE REIMBURSEMENT PORTAL (PRIVATE BY DEFAULT + TRUSTEE RBAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reimbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT NOT NULL UNIQUE,
  claim_secret_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  contact_info TEXT NOT NULL,
  ministry TEXT NOT NULL,
  expense_date DATE NOT NULL,
  amount_cents INT NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000),
  description TEXT NOT NULL,
  payout_method TEXT NOT NULL CHECK (payout_method IN ('Check', 'Zelle', 'Direct Reimbursement')),
  receipt_path TEXT,
  receipt_mime_type TEXT,
  receipt_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'paid', 'declined')),
  trustee_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reimbursements_status_created
  ON public.reimbursements (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reimbursements_reference
  ON public.reimbursements (reference_code);

ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;

-- Zero anon policies: parishioners submit and track only via the `reimbursements` Edge Function
-- validating SHA-256 `claim_secret_hash` or matching reference + contact, never exposing other claims.
DROP POLICY IF EXISTS "Admins read reimbursements" ON public.reimbursements;
CREATE POLICY "Admins read reimbursements"
  ON public.reimbursements FOR SELECT
  TO authenticated
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins update reimbursements" ON public.reimbursements;
CREATE POLICY "Admins update reimbursements"
  ON public.reimbursements FOR UPDATE
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- ============================================================================
-- 3. PRIVATE RECEIPTS STORAGE BUCKET (NOT PUBLIC)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "Admins read private receipts" ON storage.objects;
CREATE POLICY "Admins read private receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'receipts' AND public.is_active_admin());

-- ============================================================================
-- 4. STANDALONE VICAR / SPECIAL ANNOUNCEMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.special_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date_label TEXT,
  location_label TEXT,
  maps_url TEXT,
  web_url TEXT,
  web_link_label TEXT,
  flyer_url TEXT,
  flyer_storage_path TEXT,
  flyer_mime_type TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived')),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_special_announcements_published
  ON public.special_announcements (status, is_pinned DESC, published_at DESC);

ALTER TABLE public.special_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published special_announcements" ON public.special_announcements;
CREATE POLICY "Public read published special_announcements"
  ON public.special_announcements FOR SELECT
  USING (status = 'published' OR public.is_active_admin());

DROP POLICY IF EXISTS "Admins insert special_announcements" ON public.special_announcements;
CREATE POLICY "Admins insert special_announcements"
  ON public.special_announcements FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins update special_announcements" ON public.special_announcements;
CREATE POLICY "Admins update special_announcements"
  ON public.special_announcements FOR UPDATE
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins delete special_announcements" ON public.special_announcements;
CREATE POLICY "Admins delete special_announcements"
  ON public.special_announcements FOR DELETE
  TO authenticated
  USING (public.is_active_admin());

DROP TRIGGER IF EXISTS trg_audit_special_announcements ON public.special_announcements;
CREATE TRIGGER trg_audit_special_announcements
  AFTER INSERT OR UPDATE OR DELETE ON public.special_announcements
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_mutation();

-- ============================================================================
-- 5. MINISTRY WEEKLY UPDATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ministry_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  week_label TEXT,
  event_date_label TEXT,
  location_label TEXT,
  action_url TEXT,
  action_label TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived')),
  sort_order INT NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ministry_updates_published
  ON public.ministry_updates (status, sort_order ASC, updated_at DESC);

ALTER TABLE public.ministry_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published ministry_updates" ON public.ministry_updates;
CREATE POLICY "Public read published ministry_updates"
  ON public.ministry_updates FOR SELECT
  USING (status = 'published' OR public.is_active_admin());

DROP POLICY IF EXISTS "Admins insert ministry_updates" ON public.ministry_updates;
CREATE POLICY "Admins insert ministry_updates"
  ON public.ministry_updates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins update ministry_updates" ON public.ministry_updates;
CREATE POLICY "Admins update ministry_updates"
  ON public.ministry_updates FOR UPDATE
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins delete ministry_updates" ON public.ministry_updates;
CREATE POLICY "Admins delete ministry_updates"
  ON public.ministry_updates FOR DELETE
  TO authenticated
  USING (public.is_active_admin());

DROP TRIGGER IF EXISTS trg_audit_ministry_updates ON public.ministry_updates;
CREATE TRIGGER trg_audit_ministry_updates
  AFTER INSERT OR UPDATE OR DELETE ON public.ministry_updates
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_mutation();

-- ============================================================================
-- 6. PUBLIC "LIKE / APPRECIATE" REACTIONS + BATCH / TOGGLE RPCS (NO N+1 QUERIES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.announcement_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('bulletin', 'special', 'ministry')),
  target_id TEXT NOT NULL,
  device_token TEXT NOT NULL,
  reaction_type TEXT NOT NULL DEFAULT 'pray' CHECK (reaction_type IN ('pray', 'heart', 'like')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_reaction_per_device UNIQUE (target_type, target_id, device_token)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reactions_target
  ON public.announcement_reactions (target_type, target_id);

ALTER TABLE public.announcement_reactions ENABLE ROW LEVEL SECURITY;

-- Restrict direct table reads to admins so anonymous device_tokens stay private.
-- Public clients use the two minimal-privilege RPCs below (`get_reaction_summaries` & `toggle_announcement_reaction`).
DROP POLICY IF EXISTS "Admins read announcement_reactions" ON public.announcement_reactions;
CREATE POLICY "Admins read announcement_reactions"
  ON public.announcement_reactions FOR SELECT
  TO authenticated
  USING (public.is_active_admin());

CREATE OR REPLACE FUNCTION public.get_reaction_summaries(p_device_token TEXT DEFAULT NULL)
RETURNS TABLE (
  target_type TEXT,
  target_id TEXT,
  reaction_count BIGINT,
  reacted_by_me BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.target_type,
    r.target_id,
    COUNT(*)::BIGINT AS reaction_count,
    CASE
      WHEN p_device_token IS NULL OR length(trim(p_device_token)) < 8 THEN false
      ELSE BOOL_OR(r.device_token = p_device_token)
    END AS reacted_by_me
  FROM public.announcement_reactions r
  GROUP BY r.target_type, r.target_id;
$$;

CREATE OR REPLACE FUNCTION public.toggle_announcement_reaction(
  p_target_type TEXT,
  p_target_id TEXT,
  p_device_token TEXT,
  p_reaction_type TEXT DEFAULT 'pray'
)
RETURNS TABLE (
  reaction_count BIGINT,
  reacted_by_me BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
  v_now_reacted BOOLEAN := false;
BEGIN
  IF p_target_type NOT IN ('bulletin', 'special', 'ministry') THEN
    RAISE EXCEPTION 'Invalid target_type';
  END IF;
  IF p_target_id IS NULL OR length(trim(p_target_id)) = 0 OR length(p_target_id) > 120 THEN
    RAISE EXCEPTION 'Invalid target_id';
  END IF;
  IF p_device_token IS NULL OR length(trim(p_device_token)) < 8 OR length(p_device_token) > 128 THEN
    RAISE EXCEPTION 'Invalid device_token';
  END IF;
  IF p_reaction_type NOT IN ('pray', 'heart', 'like') THEN
    RAISE EXCEPTION 'Invalid reaction_type';
  END IF;

  DELETE FROM public.announcement_reactions
  WHERE target_type = p_target_type
    AND target_id = p_target_id
    AND device_token = p_device_token;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    INSERT INTO public.announcement_reactions (target_type, target_id, device_token, reaction_type)
    VALUES (p_target_type, p_target_id, p_device_token, p_reaction_type)
    ON CONFLICT (target_type, target_id, device_token) DO NOTHING;
    v_now_reacted := true;
  ELSE
    v_now_reacted := false;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS reaction_count,
    v_now_reacted AS reacted_by_me
  FROM public.announcement_reactions
  WHERE target_type = p_target_type
    AND target_id = p_target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reaction_summaries(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_announcement_reaction(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
