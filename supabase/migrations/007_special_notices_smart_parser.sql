-- 007_special_notices_smart_parser.sql
-- Upgraded Smart Special Notices schema with structured_blocks JSONB,
-- Vicar/Trustee strict write RLS, audit logging, and safe backfill from special_announcements.

CREATE OR REPLACE FUNCTION public.is_vicar_or_trustee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
      AND au.is_active = true
      AND au.role IN ('super_admin', 'vicar', 'trustee')
  );
$$;

REVOKE ALL ON FUNCTION public.is_vicar_or_trustee() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vicar_or_trustee() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.special_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category_badge text NOT NULL DEFAULT 'Vicar Note'
    CHECK (category_badge IN ('Vicar Note', 'Sunday Liturgy', 'Media & Highlights', 'Youth & Events', 'Urgent')),
  summary_preview text NOT NULL DEFAULT '',
  raw_message text NOT NULL DEFAULT '',
  structured_blocks jsonb NOT NULL DEFAULT '{}'::jsonb,
  flyer_url text,
  flyer_storage_path text,
  flyer_mime_type text,
  sign_off text NOT NULL DEFAULT 'Rajeev Achan',
  is_pinned boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'archived')),
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS special_notices_status_pinned_created_idx
  ON public.special_notices (status, is_pinned DESC, created_at DESC);

ALTER TABLE public.special_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "special_notices_public_select" ON public.special_notices;
CREATE POLICY "special_notices_public_select"
  ON public.special_notices
  FOR SELECT
  USING (status = 'published' OR public.is_vicar_or_trustee());

DROP POLICY IF EXISTS "special_notices_vicar_trustee_insert" ON public.special_notices;
CREATE POLICY "special_notices_vicar_trustee_insert"
  ON public.special_notices
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vicar_or_trustee());

DROP POLICY IF EXISTS "special_notices_vicar_trustee_update" ON public.special_notices;
CREATE POLICY "special_notices_vicar_trustee_update"
  ON public.special_notices
  FOR UPDATE
  TO authenticated
  USING (public.is_vicar_or_trustee())
  WITH CHECK (public.is_vicar_or_trustee());

DROP POLICY IF EXISTS "special_notices_vicar_trustee_delete" ON public.special_notices;
CREATE POLICY "special_notices_vicar_trustee_delete"
  ON public.special_notices
  FOR DELETE
  TO authenticated
  USING (public.is_vicar_or_trustee());

DROP TRIGGER IF EXISTS special_notices_audit_trg ON public.special_notices;
CREATE TRIGGER special_notices_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.special_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.log_admin_mutation();

-- Backfill existing special_announcements rows cleanly so nothing published is lost.
INSERT INTO public.special_notices (
  id,
  title,
  category_badge,
  summary_preview,
  raw_message,
  structured_blocks,
  flyer_url,
  flyer_storage_path,
  flyer_mime_type,
  sign_off,
  is_pinned,
  status,
  published_at,
  created_at,
  updated_at,
  updated_by
)
SELECT
  sa.id,
  sa.title,
  CASE
    WHEN COALESCE(sa.description, '') ~* '(Holy Qurbana|AM\s*[–-]|PM\s*[–-]|Sunday)' THEN 'Sunday Liturgy'
    WHEN COALESCE(sa.web_url, '') <> '' THEN 'Youth & Events'
    ELSE 'Vicar Note'
  END AS category_badge,
  left(trim(regexp_replace(COALESCE(sa.description, sa.title), E'https?://\\S+', '', 'g')), 140) AS summary_preview,
  COALESCE(sa.description, '') AS raw_message,
  jsonb_strip_nulls(
    jsonb_build_object(
      'paragraphs', to_jsonb(
        ARRAY(
          SELECT trim(p)
          FROM unnest(string_to_array(COALESCE(sa.description, ''), E'\n')) AS p
          WHERE trim(p) <> ''
        )
      ),
      'eventDateLabel', sa.event_date_label,
      'locationLabel', sa.location_label,
      'externalLinks',
        CASE
          WHEN sa.web_url IS NOT NULL AND sa.web_url ~* '^https://'
          THEN jsonb_build_array(
            jsonb_build_object(
              'label', COALESCE(NULLIF(trim(sa.web_link_label), ''), 'Open Link'),
              'url', sa.web_url
            )
          )
          ELSE '[]'::jsonb
        END,
      'locations',
        CASE
          WHEN sa.maps_url IS NOT NULL AND sa.maps_url ~* '^https://'
          THEN jsonb_build_array(
            jsonb_build_object(
              'label', COALESCE(NULLIF(trim(sa.location_label), ''), 'Open Map'),
              'mapsUrl', sa.maps_url
            )
          )
          ELSE '[]'::jsonb
        END
    )
  ) AS structured_blocks,
  sa.flyer_url,
  sa.flyer_storage_path,
  sa.flyer_mime_type,
  'Rajeev Achan' AS sign_off,
  sa.is_pinned,
  sa.status,
  sa.published_at,
  sa.created_at,
  sa.updated_at,
  sa.updated_by
FROM public.special_announcements sa
ON CONFLICT (id) DO NOTHING;
