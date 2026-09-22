/**
 * Read-side of observability: what Sentry and PostHog KNOW, for the developer
 * dashboard (/dashboard/admin/observability).
 *
 * `observability.ts` / `analytics.ts` SEND. This module READS back, which
 * needs different credentials — the send keys (DSN, `phc_` project key) are
 * write-only by design:
 *
 *   SENTRY_API_TOKEN          a USER auth token (Settings → Account → API →
 *                             Auth Tokens) with `event:read`. NOT an
 *                             Organization Token (Settings → Auth Tokens) —
 *                             Sentry restricted those to the fixed `org:ci`
 *                             scope (source maps / releases only), so
 *                             `event:read` isn't offered there. Also distinct
 *                             from SENTRY_AUTH_TOKEN, which CI uses to upload
 *                             source maps and holds only project:releases.
 *   SENTRY_ORG, SENTRY_PROJECT slugs (the same values CI already has).
 *   POSTHOG_PERSONAL_API_KEY  `phx_` personal key with "Query Read".
 *   POSTHOG_PROJECT_ID        numeric project id (Project settings).
 *
 * Every source is independent and optional. A missing credential is reported
 * as `configured: false` with no network call; a vendor failure is reported
 * as `ok: false` with the reason. Neither ever fails the page.
 *
 * Results are cached per instance for CACHE_MS: PostHog's query API allows 3
 * concurrent queries and 240/min per key, and a dashboard left open in two tabs
 * must not spend that budget.
 */
import { fetchWithTimeout, isTimeout } from './fetch-timeout';

const CACHE_MS = 60_000;
const VENDOR_TIMEOUT_MS = 12_000;
const SENTRY_PAGE = 25;

export const FUNNEL_EVENTS = [
  'signup_completed',
  'profile_completed',
  'collab_request_sent',
  'collab_request_accepted',
  'deal_agreed',
  'project_created',
  'project_completed',
  'payment_succeeded',
  'payment_failed',
] as const;

// ── Hosts ──────────────────────────────────────────────────────────────────

/**
 * Sentry's API lives on the org's region domain: an EU DSN
 * (`o123.ingest.de.sentry.io`) must be queried at `de.sentry.io`.
 */
export function sentryApiBase(dsn: string | undefined, override?: string): string {
  if (override) return override.replace(/\/+$/, '');
  try {
    const host = new URL(dsn ?? '').hostname;
    const m = host.match(/\.ingest\.([a-z]{2})\.sentry\.io$/);
    if (m) return `https://${m[1]}.sentry.io`;
  } catch {
    /* no or malformed DSN */
  }
  return 'https://sentry.io';
}

/**
 * PostHog ingests on `eu.i.posthog.com` but serves the private API on
 * `eu.posthog.com`. Querying the ingest host returns 404.
 */
export function posthogApiBase(ingestHost: string | undefined, override?: string): string {
  if (override) return override.replace(/\/+$/, '');
  const raw = (ingestHost || 'https://us.i.posthog.com').replace(/\/+$/, '');
  return raw.replace(/^(https?:\/\/)(eu|us)\.i\.posthog\.com$/, '$1$2.posthog.com');
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SourceStatus {
  configured: boolean;
  ok: boolean;
  /** Human-readable reason when !configured or !ok. Never contains a secret. */
  reason: string | null;
  /** Env vars still needed, when !configured. */
  missing: string[];
  /** Link to the vendor's own UI. */
  dashboardUrl: string | null;
}

export interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string | null;
  isNew: boolean;
}

export interface SentryPanel extends SourceStatus {
  issues: SentryIssue[];
  /** Totals over the fetched page (top SENTRY_PAGE by frequency); `truncated` when there may be more. */
  totals: { unresolved: number; newIn24h: number; events24h: number; usersAffected24h: number; truncated: boolean };
}

export interface PosthogPanel extends SourceStatus {
  activeUsers: { date: string; users: number }[];
  funnel: { event: string; events: number; users: number }[];
  webVitals: { metric: string; p75: number; samples: number }[];
  clientErrors24h: number;
}

export interface ObservabilitySnapshot {
  sentry: SentryPanel;
  posthog: PosthogPanel;
  generatedAt: string;
  cached: boolean;
}

// ── Sentry ─────────────────────────────────────────────────────────────────

function describeFailure(vendor: string, err: unknown, status?: number): string {
  if (isTimeout(err)) return `${vendor} did not answer within ${VENDOR_TIMEOUT_MS / 1000}s.`;
  if (status === 401) return `${vendor} rejected the token (401). Check it has not been revoked.`;
  if (status === 403) return `${vendor} token lacks the required scope (403).`;
  if (status === 404) return `${vendor} returned 404 — check the org/project identifiers and region host.`;
  if (status === 429) return `${vendor} rate limit hit (429). The next refresh will retry.`;
  if (status) return `${vendor} returned HTTP ${status}.`;
  return `${vendor} request failed: ${err instanceof Error ? err.message : 'unknown error'}`;
}

export function mapSentryIssues(raw: unknown, now = Date.now()): SentryIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((i: Record<string, any>) => {
    const firstSeen = String(i.firstSeen ?? '');
    return {
      id: String(i.id ?? ''),
      shortId: String(i.shortId ?? ''),
      title: String(i.title ?? 'Untitled issue'),
      culprit: i.culprit ? String(i.culprit) : null,
      level: String(i.level ?? 'error'),
      // Sentry sends `count` as a string.
      count: Number(i.count ?? 0) || 0,
      userCount: Number(i.userCount ?? 0) || 0,
      firstSeen,
      lastSeen: String(i.lastSeen ?? ''),
      permalink: typeof i.permalink === 'string' ? i.permalink : null,
      isNew: firstSeen ? now - Date.parse(firstSeen) < 24 * 3600_000 : false,
    };
  });
}

async function loadSentry(env: NodeJS.ProcessEnv): Promise<SentryPanel> {
  const token = env.SENTRY_API_TOKEN;
  const org = env.SENTRY_ORG;
  const project = env.SENTRY_PROJECT;
  const missing = [
    !token && 'SENTRY_API_TOKEN',
    !org && 'SENTRY_ORG',
    !project && 'SENTRY_PROJECT',
  ].filter(Boolean) as string[];

  const base = sentryApiBase(env.SENTRY_DSN, env.SENTRY_API_URL);
  const empty: SentryPanel = {
    configured: missing.length === 0,
    ok: false,
    reason: null,
    missing,
    // The web UI is org-subdomained on sentry.io regardless of data region.
    dashboardUrl: org ? `https://${encodeURIComponent(org)}.sentry.io/issues/` : null,
    issues: [],
    totals: { unresolved: 0, newIn24h: 0, events24h: 0, usersAffected24h: 0, truncated: false },
  };
  if (missing.length > 0) {
    return { ...empty, reason: 'Not configured — errors are still being reported, this panel just cannot read them back.' };
  }

  const url =
    `${base}/api/0/organizations/${encodeURIComponent(org!)}/issues/` +
    `?project=${encodeURIComponent(project!)}&query=${encodeURIComponent('is:unresolved')}` +
    `&statsPeriod=24h&sort=freq&limit=${SENTRY_PAGE}`;

  let status: number | undefined;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: VENDOR_TIMEOUT_MS,
      cache: 'no-store',
    });
    status = res.status;
    if (!res.ok) return { ...empty, reason: describeFailure('Sentry', null, status) };
    const issues = mapSentryIssues(await res.json());
    return {
      ...empty,
      ok: true,
      issues,
      totals: {
        unresolved: issues.length,
        newIn24h: issues.filter((i) => i.isNew).length,
        events24h: issues.reduce((n, i) => n + i.count, 0),
        usersAffected24h: issues.reduce((n, i) => n + i.userCount, 0),
        truncated: issues.length >= SENTRY_PAGE,
      },
    };
  } catch (err) {
    return { ...empty, reason: describeFailure('Sentry', err, status) };
  }
}

// ── PostHog ────────────────────────────────────────────────────────────────

const Q_ACTIVE_USERS = `
  SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS users
  FROM events
  WHERE timestamp > now() - INTERVAL 14 DAY
  GROUP BY day
  ORDER BY day`;

const Q_FUNNEL = `
  SELECT event, count() AS events, count(DISTINCT person_id) AS users
  FROM events
  WHERE timestamp > now() - INTERVAL 7 DAY
    AND event IN (${FUNNEL_EVENTS.map((e) => `'${e}'`).join(', ')})
  GROUP BY event`;

// Web vitals and client errors share the `client_error` event, separated by
// `kind` (see components/observability-provider.tsx).
const Q_HEALTH = `
  SELECT
    if(properties.kind = 'web_vital', toString(properties.metric), '__error__') AS metric,
    quantile(0.75)(toFloat(properties.value)) AS p75,
    countIf(timestamp > now() - INTERVAL 1 DAY) AS last_day,
    count() AS samples
  FROM events
  WHERE event = 'client_error' AND timestamp > now() - INTERVAL 7 DAY
  GROUP BY metric`;

export function mapPosthogRows(results: unknown): unknown[][] {
  return Array.isArray(results) ? (results.filter(Array.isArray) as unknown[][]) : [];
}

async function hogql(base: string, projectId: string, key: string, name: string, query: string) {
  const res = await fetchWithTimeout(`${base}/api/projects/${encodeURIComponent(projectId)}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, query: { kind: 'HogQLQuery', query } }),
    timeoutMs: VENDOR_TIMEOUT_MS,
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const body = (await res.json()) as { results?: unknown };
  return mapPosthogRows(body.results);
}

async function loadPosthog(env: NodeJS.ProcessEnv): Promise<PosthogPanel> {
  const key = env.POSTHOG_PERSONAL_API_KEY;
  const projectId = env.POSTHOG_PROJECT_ID;
  const missing = [!key && 'POSTHOG_PERSONAL_API_KEY', !projectId && 'POSTHOG_PROJECT_ID'].filter(
    Boolean,
  ) as string[];

  const base = posthogApiBase(env.NEXT_PUBLIC_POSTHOG_HOST, env.POSTHOG_API_URL);
  const empty: PosthogPanel = {
    configured: missing.length === 0,
    ok: false,
    reason: null,
    missing,
    dashboardUrl: projectId ? `${base}/project/${projectId}` : null,
    activeUsers: [],
    funnel: [],
    webVitals: [],
    clientErrors24h: 0,
  };
  if (missing.length > 0) {
    return {
      ...empty,
      reason: env.NEXT_PUBLIC_POSTHOG_KEY
        ? 'Not configured — events are being captured, this panel just cannot query them back.'
        : 'Not configured — and NEXT_PUBLIC_POSTHOG_KEY is unset, so nothing is being captured either.',
    };
  }

  try {
    // Sequential on purpose: PostHog allows 3 concurrent queries per key, and a
    // second open tab would otherwise trip that on its first refresh.
    const active = await hogql(base, projectId!, key!, 'influnet admin: active users', Q_ACTIVE_USERS);
    const funnel = await hogql(base, projectId!, key!, 'influnet admin: funnel', Q_FUNNEL);
    const health = await hogql(base, projectId!, key!, 'influnet admin: client health', Q_HEALTH);

    const byEvent = new Map(funnel.map((r) => [String(r[0]), { events: Number(r[1]) || 0, users: Number(r[2]) || 0 }]));
    const errorsRow = health.find((r) => r[0] === '__error__');

    return {
      ...empty,
      ok: true,
      activeUsers: active.map((r) => ({ date: String(r[0]), users: Number(r[1]) || 0 })),
      // Keep funnel order and show zeros: a step nobody reached is the finding.
      funnel: FUNNEL_EVENTS.map((event) => ({ event, ...(byEvent.get(event) ?? { events: 0, users: 0 }) })),
      webVitals: health
        .filter((r) => r[0] !== '__error__')
        .map((r) => ({ metric: String(r[0]), p75: Number(r[1]) || 0, samples: Number(r[3]) || 0 }))
        .sort((a, b) => a.metric.localeCompare(b.metric)),
      clientErrors24h: errorsRow ? Number(errorsRow[2]) || 0 : 0,
    };
  } catch (err) {
    return { ...empty, reason: describeFailure('PostHog', err, (err as { status?: number }).status) };
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

let cache: { at: number; value: ObservabilitySnapshot } | null = null;

export async function loadObservability(
  opts: { refresh?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<ObservabilitySnapshot> {
  const env = opts.env ?? process.env;
  if (!opts.refresh && !opts.env && cache && Date.now() - cache.at < CACHE_MS) {
    return { ...cache.value, cached: true };
  }
  // The two loaders catch their own failures, so allSettled is belt-and-braces
  // against a bug in a mapper taking the other panel down with it.
  const [sentry, posthog] = await Promise.allSettled([loadSentry(env), loadPosthog(env)]);
  const value: ObservabilitySnapshot = {
    sentry:
      sentry.status === 'fulfilled'
        ? sentry.value
        : { configured: true, ok: false, reason: 'Sentry panel failed to build.', missing: [], dashboardUrl: null, issues: [], totals: { unresolved: 0, newIn24h: 0, events24h: 0, usersAffected24h: 0, truncated: false } },
    posthog:
      posthog.status === 'fulfilled'
        ? posthog.value
        : { configured: true, ok: false, reason: 'PostHog panel failed to build.', missing: [], dashboardUrl: null, activeUsers: [], funnel: [], webVitals: [], clientErrors24h: 0 },
    generatedAt: new Date().toISOString(),
    cached: false,
  };
  if (!opts.env) cache = { at: Date.now(), value };
  return value;
}

export function __resetObservabilityCache() {
  cache = null;
}
