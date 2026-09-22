-- Migration 149: vendor kill switches
--
-- Migration 137 made the four PRODUCT switches runtime-toggleable. This adds
-- the other half: a switch per third party, so that when a vendor starts
-- failing you can take it out of the request path without a deploy.
--
-- ── Why this is the missing piece ────────────────────────────────────────
-- The product flags answer "is this feature live". They do not answer the
-- question you actually have at 2am, which is "Apify is timing out and every
-- profile refresh is hanging — make it stop". Today that needs a container
-- update, which is the last thing you want to be doing while something is
-- already broken.
--
-- ── Default ON, unlike the product flags ─────────────────────────────────
-- This is the important difference. A product flag defaults to FALSE, because
-- turning a restriction on must be deliberate. A vendor flag defaults to TRUE,
-- because a missing row must never silently disable payments. So:
--
--   row present, enabled = false  →  vendor is OFF (deliberate)
--   row present, enabled = true   →  vendor is ON
--   NO ROW AT ALL                 →  vendor is ON  (the safe default)
--
-- lib/feature-flags.ts implements exactly that in vendorEnabled(), separately
-- from flag(), so the two defaults can never be confused with each other.
--
-- ── Turning a vendor off ─────────────────────────────────────────────────
--   insert into public.feature_flags (key, enabled, description)
--   values ('vendor_apify', false, 'Apify timing out — disabled 02:10 IST')
--   on conflict (key) do update
--     set enabled = excluded.enabled, description = excluded.description;
--
-- and back on again by setting enabled = true. Takes effect within ~45s.
--
-- What each switch degrades to, rather than what it breaks:
--   vendor_apify     Instagram scraping returns no snapshot. Profiles render
--                    with whatever is already cached.
--   vendor_hikerapi  Same, for the alternate Instagram provider.
--   vendor_razorpay  Payment order creation refuses with a clear 503 rather
--                    than hanging. Existing paid projects are unaffected —
--                    the gates were opened by past webhooks, not by this.
--   vendor_stream    Chat degrades. Nothing else uses it.
--   vendor_resend    Notification emails are skipped. NOTE this is not the
--                    same as notify_emails: that is the product decision
--                    ("should we email at all"), this is the operational one
--                    ("is the vendor healthy"). Either being off skips the
--                    send, and they are deliberately separate so turning the
--                    vendor off for an hour does not lose the product setting.
--   vendor_expo_push Push notifications are skipped.

ALTER TABLE public.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_key_known;

ALTER TABLE public.feature_flags
  ADD CONSTRAINT feature_flags_key_known
  CHECK (key IN (
    -- Product switches (137). Default FALSE via the env fallback.
    'phone_otp',
    'notify_emails',
    'subscriptions',
    'ownership_gate',
    -- Vendor kill switches (149). Default TRUE when absent.
    'vendor_apify',
    'vendor_hikerapi',
    'vendor_razorpay',
    'vendor_stream',
    'vendor_resend',
    'vendor_expo_push'
  ));

-- Deliberately seeded EMPTY, same as 137. No row means "on", so applying this
-- migration changes nothing anywhere until someone deliberately turns a vendor
-- off. Applying it to production is therefore a no-op you can do at any time.

COMMENT ON TABLE public.feature_flags IS
  'Runtime switches. Product keys (phone_otp, notify_emails, subscriptions, '
  'ownership_gate) default FALSE via env fallback — see lib/feature-flags.ts. '
  'Vendor keys (vendor_*) default TRUE when no row exists, so a missing row '
  'can never silently disable payments. Changes apply within ~45s.';
