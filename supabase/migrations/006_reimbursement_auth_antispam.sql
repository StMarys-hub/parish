-- St. Mary's Syro-Malabar Parish PWA - Phase 3.2 Security Upgrade
-- Enforces Authenticated Device Login + Admin-Configurable Anti-Spam Gate for Reimbursements:
-- 1. Tracks `submitter_user_id` & `submitter_email` on `public.reimbursements`
-- 2. Private `public.reimbursement_security_config` (gate mode, salted PIN hash, daily rate limit)
-- 3. `public.reimbursement_submitters` allowlist / PIN-verified / blocked tracking
-- 4. Strictly zero anonymous access to receipts or reimbursement submissions

ALTER TABLE public.reimbursements
  ADD COLUMN IF NOT EXISTS submitter_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitter_email TEXT;

CREATE INDEX IF NOT EXISTS idx_reimbursements_submitter_user
  ON public.reimbursements (submitter_user_id, created_at DESC);

-- Server-only anti-spam security config (NO public/anon read policy so PIN hashes never leak)
CREATE TABLE IF NOT EXISTS public.reimbursement_security_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  gate_mode TEXT NOT NULL DEFAULT 'pin_and_login'
    CHECK (gate_mode IN ('pin_and_login', 'allowlist_only', 'login_with_rate_limit')),
  pin_hash TEXT,
  max_submissions_per_24h SMALLINT NOT NULL DEFAULT 3 CHECK (max_submissions_per_24h BETWEEN 1 AND 25),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.reimbursement_security_config (id, gate_mode, max_submissions_per_24h)
VALUES (1, 'pin_and_login', 3)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.reimbursement_security_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read reimbursement_security_config" ON public.reimbursement_security_config;
CREATE POLICY "Admins read reimbursement_security_config"
  ON public.reimbursement_security_config FOR SELECT
  TO authenticated
  USING (public.is_active_admin());

-- Verified / Approved / Blocked submitter accounts
CREATE TABLE IF NOT EXISTS public.reimbursement_submitters (
  email TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT,
  ministry TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  pin_verified_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reimbursement_submitters_user_id
  ON public.reimbursement_submitters (user_id);

ALTER TABLE public.reimbursement_submitters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage reimbursement_submitters" ON public.reimbursement_submitters;
CREATE POLICY "Admins manage reimbursement_submitters"
  ON public.reimbursement_submitters FOR ALL
  TO authenticated
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- Allow signed-in users to read their OWN claims directly if ever queried via user-scoped client
DROP POLICY IF EXISTS "Submitters read own reimbursements" ON public.reimbursements;
CREATE POLICY "Submitters read own reimbursements"
  ON public.reimbursements FOR SELECT
  TO authenticated
  USING (submitter_user_id = auth.uid() OR public.is_active_admin());
