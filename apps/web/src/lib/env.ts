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
  NEXT_PUBLIC_PHONE_OTP_ENABLED: z
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

  const emailsOn = process.env.NOTIFY_EMAILS_ENABLED === 'true';

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
        process.env.NEXT_PUBLIC_PHONE_OTP_ENABLED === 'true'
          ? 'ENABLED (2Factor, signup gated)'
          : 'disabled (NEXT_PUBLIC_PHONE_OTP_ENABLED=false)',
      ok: true,
    },
    {
      label: 'Email sends',
      value: !present('RESEND_API_KEY')
        ? 'disabled (no RESEND_API_KEY)'
        : emailsOn
          ? `ENABLED as ${process.env.EMAIL_FROM || 'Influnet <noreply@influnet.io>'}`
          : 'disabled (NOTIFY_EMAILS_ENABLED=false)',
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
