-- 009_scheduled_publishing.sql
-- Adds optional scheduled_publish_at timestamp to weekly_bulletins and special_notices.
-- Items with status = 'published' and a future scheduled_publish_at remain hidden from public
-- parishioners until scheduled_publish_at <= now(), while active admins can view/edit them.

ALTER TABLE public.weekly_bulletins
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz;

ALTER TABLE public.special_notices
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz;

DROP POLICY IF EXISTS "Public read published bulletins" ON public.weekly_bulletins;
CREATE POLICY "Public read published bulletins"
  ON public.weekly_bulletins
  FOR SELECT
  USING (
    (status = 'published' AND (scheduled_publish_at IS NULL OR scheduled_publish_at <= now()))
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "special_notices_public_select" ON public.special_notices;
CREATE POLICY "special_notices_public_select"
  ON public.special_notices
  FOR SELECT
  USING (
    (status = 'published' AND (scheduled_publish_at IS NULL OR scheduled_publish_at <= now()))
    OR public.is_vicar_or_trustee()
  );
