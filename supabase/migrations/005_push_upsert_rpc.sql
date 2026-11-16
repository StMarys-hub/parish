-- St. Mary's Syro-Malabar Parish PWA - iOS/iPadOS Push Subscription Reactivation Fix
-- Ensures re-subscribing an existing browser endpoint always reactivates `is_active = true`
-- and refreshes p256dh / auth / platform without weakening zero-trust RLS on `push_subscriptions`.

CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_platform TEXT DEFAULT 'other'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform TEXT;
BEGIN
  IF p_endpoint IS NULL OR length(trim(p_endpoint)) < 10 OR p_endpoint NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Invalid push subscription endpoint';
  END IF;
  IF p_p256dh IS NULL OR length(trim(p_p256dh)) < 10 THEN
    RAISE EXCEPTION 'Invalid p256dh key';
  END IF;
  IF p_auth IS NULL OR length(trim(p_auth)) < 8 THEN
    RAISE EXCEPTION 'Invalid auth secret';
  END IF;

  v_platform := CASE
    WHEN p_platform IN ('ios_pwa', 'android', 'desktop', 'other') THEN p_platform
    ELSE 'other'
  END;

  INSERT INTO public.push_subscriptions (endpoint, p256dh, auth, platform, is_active)
  VALUES (trim(p_endpoint), trim(p_p256dh), trim(p_auth), v_platform, true)
  ON CONFLICT (endpoint) DO UPDATE
  SET
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    platform = EXCLUDED.platform,
    is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
