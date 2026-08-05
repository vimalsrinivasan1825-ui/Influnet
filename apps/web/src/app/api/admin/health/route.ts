import { NextResponse } from 'next/server';
import { callerClient, jsonError, withAdmin } from '@/lib/api';
import { appEnv } from '@/lib/env';
import { isDistributedRateLimit } from '@/lib/rate-limit';
import { isObservabilityEnabled } from '@/lib/observability';

/**
 * Deep system health, for an admin rather than for a load balancer.
 *
 * `/api/health` answers "is the process up" for the uptime monitor and must
 * stay fast and anonymous. This answers the developer's question — which
 * integrations are actually configured, which migrations this database has,
 * and what this deployment is pointed at — and is admin-only because that
 * information describes the infrastructure.
 *
 * It reports **configuration** and cheap reachability. It deliberately does not
 * call out to Razorpay or Apify on every load: those are paid, rate-limited
 * APIs, and turning a status page into a billing line item is a bad trade.
 */

/** Migrations whose absence changes behaviour, newest first. */
const FEATURE_PROBES: { migration: string; label: string; probe: string; kind: 'rpc' | 'table' }[] = [
  { migration: '109', label: 'Rate-limit visibility', probe: 'rate_limit_stats', kind: 'table' },
  { migration: '108', label: 'Admin user activity', probe: 'admin_get_user_activity', kind: 'rpc' },
  { migration: '099', label: 'Live activity feed', probe: 'get_platform_activity', kind: 'rpc' },
  { migration: '098', label: 'Support & feedback', probe: 'support_tickets', kind: 'table' },
  { migration: '098', label: 'Admin analytics', probe: 'get_admin_funnel', kind: 'rpc' },
  { migration: '073', label: 'User activity timeline', probe: 'get_user_activity', kind: 'rpc' },
  { migration: '070', label: 'Admin audit log', probe: 'admin_audit_log', kind: 'table' },
  { migration: '058', label: 'Ownership verification', probe: 'social_account_claims', kind: 'table' },
];

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const scoped = callerClient(req);

    // ── Integrations: configured or not ──────────────────────────────────
    // Presence of a credential, not a live call. "Configured" is the question
    // that actually explains a broken feature nine times out of ten.
    const integrations = [
      { name: 'Supabase', configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), required: true },
      { name: 'Service role key', configured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), required: true },
      { name: 'Stream Chat', configured: Boolean(process.env.STREAM_API_SECRET), required: true },
      { name: 'Razorpay', configured: Boolean(process.env.RAZORPAY_KEY_SECRET), required: true },
      { name: 'Razorpay webhook', configured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET), required: true },
      { name: 'Cloudinary', configured: Boolean(process.env.CLOUDINARY_API_SECRET), required: true },
      { name: 'Instagram (Apify)', configured: Boolean(process.env.APIFY_TOKEN), required: false },
      { name: 'Email (Resend)', configured: Boolean(process.env.RESEND_API_KEY), required: false },
      { name: 'Email sending ON', configured: process.env.NOTIFY_EMAILS_ENABLED === 'true', required: false },
      { name: 'Sentry', configured: isObservabilityEnabled(), required: false },
      { name: 'PostHog analytics', configured: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY), required: false },
      { name: 'Distributed rate limiting', configured: isDistributedRateLimit(), required: false },
      { name: 'Phone OTP gate', configured: process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === 'true', required: false },
    ];

    // ── Database reachability + latency ──────────────────────────────────
    const started = Date.now();
    const { error: pingError } = await supabase.from('profiles').select('id').limit(1);
    const dbLatencyMs = Date.now() - started;

    // ── Which migrations this database actually has ──────────────────────
    // The recurring question on this project is "is migration N applied?".
    // Probing the object each one creates answers it from the live database
    // instead of from someone's memory.
    const features = await Promise.all(
      FEATURE_PROBES.map(async (f) => {
        try {
          if (f.kind === 'table') {
            const { error } = await supabase.from(f.probe).select('*').limit(0);
            return { ...f, applied: !error };
          }
          // An RPC that exists but rejects us (e.g. 'forbidden') still proves
          // it is installed. PGRST202 is PostgREST's "no function with this
          // name/signature in the schema cache" — the actual "missing" signal.
          // (A plain message-substring check on "does not exist" looked
          // right but never matched PostgREST's real wording — "Could not
          // find the function ... in the schema cache" — so every RPC probe
          // silently reported applied:true no matter what. Every probed RPC
          // here must stay callable with zero args for this check to work.)
          const { error } = await scoped.rpc(f.probe, {});
          return { ...f, applied: error?.code !== 'PGRST202' };
        } catch {
          return { ...f, applied: false };
        }
      }),
    );

    return NextResponse.json({
      environment: {
        app_env: appEnv,
        node_env: process.env.NODE_ENV,
        app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
        // Which Supabase project this deployment talks to — the fastest way to
        // catch "staging is pointed at the wrong database".
        supabase_project:
          process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, '').split('.')[0] ?? null,
      },
      database: {
        reachable: !pingError,
        latency_ms: dbLatencyMs,
      },
      integrations,
      features,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(500, 'Could not read system health', error);
  }
}
