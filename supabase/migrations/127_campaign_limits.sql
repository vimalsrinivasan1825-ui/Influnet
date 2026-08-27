-- Migration 127: Campaign limits in billing_settings
--
-- billing_settings is a single-row table with one column per setting.
-- Conservative defaults, changeable with an UPDATE. No subscriptions yet —
-- free limits apply while SUBSCRIPTIONS_ENABLED is off.

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS free_live_campaigns      INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS free_applications_per_week INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS campaign_default_days    INT NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.billing_settings.free_live_campaigns IS
  'Max live campaigns a free-tier brand can publish at once.';
COMMENT ON COLUMN public.billing_settings.free_applications_per_week IS
  'Max campaign applications a free-tier creator can submit per week.';
COMMENT ON COLUMN public.billing_settings.campaign_default_days IS
  'Default campaign duration in days when the brand does not specify.';
