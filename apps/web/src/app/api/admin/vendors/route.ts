import { NextResponse } from 'next/server';
import { jsonError, withSuperAdmin } from '@/lib/api';
import { VENDOR_KEYS, allVendors, type VendorKey } from '@/lib/feature-flags';
import { breakerStatus } from '@/lib/circuit-breaker';

/**
 * The break-glass panel: which third parties are switched on, and which ones
 * this instance has given up calling.
 *
 * Two different things are reported side by side, and the difference matters:
 *
 *   switch   the `feature_flags` row (migration 149). Deliberate, durable,
 *            shared by every instance, and only a human changes it.
 *   breaker  in-process, automatic, time-limited. Each instance learns on its
 *            own and a deploy resets it.
 *
 * So a breaker showing "open" is the app telling YOU a vendor is unwell. A
 * switch showing "off" is you telling the app. Reading them in one place is
 * the point — "payments are failing" is answered by looking at which of the
 * two is responsible.
 *
 * ── Why the breaker numbers are per-instance and that is fine ────────────
 * This reports the instance that happened to serve the request. With more
 * than one replica you may see a different picture on refresh. That is
 * accurate rather than broken: the breakers genuinely are independent. The
 * durable, all-instances control is the switch.
 */

/** Which env var proves the vendor is even configured on this deployment. */
const CREDENTIAL: Record<VendorKey, string> = {
  vendor_apify: 'APIFY_TOKEN',
  vendor_hikerapi: 'HIKERAPI_ACCESS_KEY',
  vendor_razorpay: 'RAZORPAY_KEY_SECRET',
  vendor_stream: 'STREAM_API_SECRET',
  vendor_resend: 'RESEND_API_KEY',
  vendor_expo_push: '',
};

/** What actually degrades when this one is off — so the operator can weigh it. */
const IMPACT: Record<VendorKey, string> = {
  vendor_apify: 'Instagram scraping stops. Profiles render from cached snapshots.',
  vendor_hikerapi: 'The alternate Instagram provider stops. Same degradation.',
  vendor_razorpay:
    'New payment orders refuse with a 503. Already-paid projects are unaffected — their gates were opened by past webhooks.',
  vendor_stream: 'Chat stops working. Nothing else uses it.',
  vendor_resend: 'Notification emails are skipped. Separate from the notify_emails product flag.',
  vendor_expo_push: 'Push notifications are skipped. In-app notifications still appear.',
};

const BREAKER_OF: Record<VendorKey, string> = {
  vendor_apify: 'apify',
  vendor_hikerapi: 'hikerapi',
  vendor_razorpay: 'razorpay',
  vendor_stream: 'stream',
  vendor_resend: 'resend',
  vendor_expo_push: 'expo_push',
};

export async function GET(req: Request) {
  try {
    const auth = await withSuperAdmin(req);
    if (!auth.ok) return auth.res;

    const switches = allVendors();
    const breakers = breakerStatus() as Record<string, {
      state: 'closed' | 'open' | 'half-open';
      consecutiveFailures: number;
      retryInMs: number;
    }>;

    const vendors = VENDOR_KEYS.map((key) => {
      const breaker = breakers[BREAKER_OF[key]];
      const credential = CREDENTIAL[key];
      return {
        key,
        // The operator-controlled switch.
        enabled: switches[key],
        // The app's own opinion, right now, on this instance.
        breaker: breaker?.state ?? 'closed',
        consecutive_failures: breaker?.consecutiveFailures ?? 0,
        retry_in_ms: breaker?.retryInMs ?? 0,
        configured: credential ? Boolean(process.env[credential]) : true,
        credential: credential || null,
        impact: IMPACT[key],
        // The single thing an operator wants: is this vendor currently in the
        // request path at all?
        serving: switches[key] && (breaker?.state ?? 'closed') !== 'open',
      };
    });

    return NextResponse.json({
      vendors,
      // Everything healthy is the boring, expected answer.
      healthy: vendors.every((v) => v.serving || !v.configured),
      note:
        'Switches are shared and durable (feature_flags, migration 149) and change within ~45s. ' +
        'Breakers are per-instance, automatic and reset on deploy.',
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(500, 'Could not read vendor status', error);
  }
}
