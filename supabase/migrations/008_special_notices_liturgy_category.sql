-- 008_special_notices_liturgy_category.sql
-- Adds 'Liturgy' as an allowed Special Notice category badge alongside existing categories.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.special_notices'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%category_badge%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.special_notices DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.special_notices
  ADD CONSTRAINT special_notices_category_badge_check
  CHECK (
    category_badge IN (
      'Vicar Note',
      'Liturgy',
      'Sunday Liturgy',
      'Media & Highlights',
      'Youth & Events',
      'Urgent'
    )
  );
