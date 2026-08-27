/**
 * Centralised, validated environment configuration.
 *
 * This module is ADDITIVE — existing code may still read `process.env.*`
 * directly. New code should prefer `getEnv()` for type-safety and fail-fast
 * validation. The startup banner (see `src/instrumentation.ts`) is rendered
 * from `describeEnv()`.
 *
 * Key idea: `APP_ENV` (local | dev | staging | production) selects WHICH
 * backend/credentials we run against. It is deliberately separate from
 * `NODE_ENV`, which Next.js controls (development | production | test) and
 * which cannot express a "staging" value.
 */
import { z } from 'zod';

export const APP_ENVS = ['local', 'dev', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** The active application environment (defaults to `local`). */
export const appEnv: AppEnv = (() => {
  const raw = process.env.APP_ENV;
  return (APP_ENVS as readonly string[]).includes(raw ?? '')
    ? (raw as AppEnv)
    : 'local';
})();

/**
 * Schema for the runtime environment. Required vars cause a fail-fast error;
 * optional integrations (Stream, Resend, Sentry) may be absent in local/dev.
 */
const envSchema = z.object({
  APP_ENV: z.enum(APP_ENVS).default('local'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // Supabase — required for the app to function at all.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Stream Chat — optional (chat disabled if absent).
  NEXT_PUBLIC_STREAM_API_KEY: z.string().optional(),
  STREAM_API_KEY: z.string().optional(),
  STREAM_API_SECRET: z.string().optional(),

  // Mobile-number OTP (2Factor). The provider key is NOT here — it lives only
  // as the phone-otp Edge Function's TWOFACTOR_API_KEY secret. This flag is the
  // signup gate, and defaults to false on purpose: switching it on before that
  // function is deployed would block every new registration.
  // Legacy build-time copy. Still read as a fallback, but the browser no longer
  // depends on it — the signup wizard fetches /api/auth/config now — so flipping
  // OTP no longer needs a web rebuild.
  NEXT_PUBLIC_PHONE_OTP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Runtime server copy, and the env fallback for feature_flags.phone_otp
  // (migration 137). Set this per-environment; the DB row overrides it.
  PHONE_OTP_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),

  // Signup-completion gate (lib/ownership-gate.ts): blocks a creator from
  // accepting collabs/projects until they've proven Instagram ownership.
  // Server-only — the client never needs to branch on this, it just gets a
  // 403 with an explanatory message. Defaults off for the same reason
  // phone-otp does: flipping it on instantly restricts every existing
  // unverified creator, so it needs to be a deliberate switch.
  OWNERSHIP_GATE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Paid plans (migration 115). The master switch for the whole Free/Pro
  // split: false means the product has no paid tier at all — every gate is
  // open, and the UI shows no pricing, no upgrade prompt and no Pro badge.
  //
  // Server-only, with NO NEXT_PUBLIC_ prefix, on purpose. A NEXT_PUBLIC_ value
  // is inlined into the bundle at build time — the server's copy too — so it
  // could not be flipped without a rebuild. The browser reads this at runtime
  // from GET /api/billing/entitlements instead.
  //
  // Defaults off for the same reason the OTP and ownership gates do: switching
  // it on instantly restricts every existing user, so it must be deliberate.
  SUBSCRIPTIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Email — optional; sends are gated by NOTIFY_EMAILS_ENABLED anyway.
  // Full setup: docs/operations/EMAIL_SYSTEM.md
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  /** Comma-separated addresses or "@domain" suffixes. Set → only these can be mailed. */
  EMAIL_ALLOWLIST: z.string().optional(),
  EMAIL_UNSUBSCRIBE_SECRET: z.string().optional(),
  EMAIL_LOGO_URL: z.string().optional(),
  EMAIL_REQUIRE_VERIFIED: z.enum(['true', 'false']).optional(),
  EMAIL_DAILY_CAP: z.coerce.number().int().positive().optional(),
  /** Comma-separated template ids to silence, e.g. "payment_failed,unread_messages". */
  EMAIL_DISABLED_TEMPLATES: z.string().optional(),
  /** Resend webhook signing secret — without it, bounces are never suppressed. */
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  NOTIFY_EMAILS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Observability — optional.
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  // Product analytics (PostHog) — optional, and absent by default.
  // With no key the analytics module is a no-op: the SDK is never even
  // downloaded (it is behind a dynamic import), so an unconfigured deploy
  // behaves exactly as it did before analytics existed.
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),

  // The browser copy of APP_ENV. APP_ENV itself is server-only (no
  // NEXT_PUBLIC_ prefix), so client-side error reports and analytics events
  // cannot read it and would otherwise all be tagged 'unknown'.
  NEXT_PUBLIC_APP_ENV: z.enum(APP_ENVS).optional(),

  // Distributed rate limiting — optional. Absent → limiter uses an in-process
  // fixed-window floor (fine for single instance; NOT correct across serverless
  // instances). Present → shared counters across all instances.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Live Instagram verification providers — optional. Absent → verification
  // falls back to structural-only signals + human review (never blocks access).
  // Provider is chosen by VERIFICATION_PROVIDER, else auto (prefers Apify).
  VERIFICATION_PROVIDER: z.enum(['apify', 'hikerapi']).optional(),
  APIFY_TOKEN: z.string().optional(),
  HIKERAPI_ACCESS_KEY: z.string().optional(),
  HIKERAPI_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Returns the validated environment, memoised. Throws a descriptive error
 * listing every missing/invalid required variable on first call.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ✗ ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration (APP_ENV=${appEnv}):\n${issues}\n\n` +
        `Check your env file against apps/web/.env.example.`,
    );
  }
  cached = parsed.data;
  return cached;
}

// ── Banner support ────────────────────────────────────────────────────────────

/** Which of the required variables are missing (for the boot banner). */
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** Best-effort host extraction, e.g. "abc.supabase.co" from the URL. */
function hostOf(url: string | undefined): string {
  if (!url) return '—';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export interface EnvRow {
  label: string;
  value: string;
  ok: boolean;
}

/**
 * Produces a non-throwing, display-safe description of the current environment
 * for the startup banner. Secrets are never printed — only presence/host.
 */
export function describeEnv(): {
  appEnv: AppEnv;
  nodeEnv: string;
  envFile: string;
  rows: EnvRow[];
  missingRequired: string[];
} {
  const present = (k: string) => Boolean(process.env[k]?.trim());
  const missingRequired = REQUIRED.filter((k) => !present(k));

  // These are the ENV-VAR fallbacks only. The authoritative value for each is a
  // `feature_flags` row (migration 137), resolved at runtime by lib/feature-flags.ts
  // — which can't be read synchronously here at boot, hence the "overrides at
  // runtime" note on each row below.
  const emailsOn = (process.env.NOTIFY_EMAILS_ENABLED || '').trim().split(/\s+/)[0] === 'true';
  const phoneOtpFallback =
    process.env.PHONE_OTP_ENABLED === 'true' ||
    process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === 'true';
  const subscriptionsFallback = process.env.SUBSCRIPTIONS_ENABLED === 'true';

  const rows: EnvRow[] = [
    {
      label: 'App URL',
      value: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      ok: true,
    },
    {
      label: 'Supabase',
      value: hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL),
      ok: present('NEXT_PUBLIC_SUPABASE_URL'),
    },
    {
      label: 'Anon key',
      value: present('NEXT_PUBLIC_SUPABASE_ANON_KEY') ? 'present' : 'MISSING',
      ok: present('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    },
    {
      label: 'Service-role',
      value: present('SUPABASE_SERVICE_ROLE_KEY')
        ? 'present (server-only)'
        : 'MISSING',
      ok: present('SUPABASE_SERVICE_ROLE_KEY'),
    },
    {
      label: 'Stream Chat',
      value: present('NEXT_PUBLIC_STREAM_API_KEY')
        ? process.env.NEXT_PUBLIC_STREAM_API_KEY!
        : 'disabled',
      ok: true,
    },
    {
      label: 'Mobile OTP',
      value:
        (phoneOtpFallback
          ? 'ENABLED (2Factor, signup gated)'
          : 'disabled') + ' · env fallback; feature_flags.phone_otp overrides at runtime',
      ok: true,
    },
    {
      label: 'Paid plans',
      value:
        (subscriptionsFallback
          ? present('RAZORPAY_KEY_ID')
            ? 'ENABLED (Free/Pro gates active)'
            : 'ENABLED but Razorpay is NOT configured — nobody can upgrade'
          : 'disabled — everyone gets everything') +
        ' · env fallback; feature_flags.subscriptions overrides at runtime',
      // Gates on with no way to pay is the one combination that strands users
      // at a paywall they cannot clear, so flag it rather than let it look fine.
      ok: !subscriptionsFallback || present('RAZORPAY_KEY_ID'),
    },
    {
      label: 'Email sends',
      value: !present('RESEND_API_KEY')
        ? 'disabled (no RESEND_API_KEY)'
        : (emailsOn
            ? `ENABLED as ${process.env.EMAIL_FROM || 'Influnet <noreply@influnet.io>'}`
            : 'disabled') + ' · env fallback; feature_flags.notify_emails overrides at runtime',
      ok: true,
    },
    {
      label: 'Email allowlist',
      value: process.env.EMAIL_ALLOWLIST?.trim() || 'none (anyone can be mailed)',
      // Sending enabled with no allowlist is correct in production and a
      // liability anywhere else — flag it so a staging box pointed at real
      // data doesn't quietly mail real users.
      ok: true,
    },
    {
      label: 'Bounce webhook',
      value: present('RESEND_WEBHOOK_SECRET')
        ? 'configured'
        : 'NOT configured (bounces will not be suppressed)',
      ok: !emailsOn || present('RESEND_WEBHOOK_SECRET'),
    },
    {
      label: 'Sentry',
      value: present('NEXT_PUBLIC_SENTRY_DSN') || present('SENTRY_DSN') ? 'enabled' : 'disabled',
      ok: true,
    },
    {
      label: 'Rate limiting',
      value:
        present('UPSTASH_REDIS_REST_URL') && present('UPSTASH_REDIS_REST_TOKEN')
          ? 'distributed (Upstash)'
          : 'in-process floor',
      ok: true,
    },
    {
      label: 'Verification provider',
      value: present('APIFY_TOKEN')
        ? `Apify${process.env.VERIFICATION_PROVIDER ? ` (pinned: ${process.env.VERIFICATION_PROVIDER})` : ''}`
        : present('HIKERAPI_ACCESS_KEY')
          ? 'HikerAPI'
          : 'disabled (structural-only)',
      ok: true,
    },
  ];

  // Which file the active APP_ENV conventionally loads (for display only).
  const envFileByAppEnv: Record<AppEnv, string> = {
    local: '.env.local',
    dev: '.env.dev.local',
    staging: '.env.staging.local',
    production: '.env.production.local',
  };

  return {
    appEnv,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    envFile: envFileByAppEnv[appEnv],
    rows,
    missingRequired,
  };
}
