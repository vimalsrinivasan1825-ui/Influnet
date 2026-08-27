-- Migration 127: Campaign limits in billing_settings
--
-- Conservative defaults, changeable with an UPDATE. No subscriptions yet —
-- free limits apply while SUBSCRIPTIONS_ENABLED is off.

INSERT INTO public.billing_settings (key, value, updated_at)
VALUES
  ('free_live_campaigns', '3', now()),
  ('free_applications_per_week', '10', now()),
  ('campaign_default_days', '30', now())
ON CONFLICT (key) DO NOTHING;
