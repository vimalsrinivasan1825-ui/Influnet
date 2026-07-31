/**
 * Supabase connection pooler configuration.
 *
 * Without the pooler, every serverless invocation opens a direct Postgres
 * connection — on Vercel (or any multi-instance environment) the database
 * hits its max_connections limit in seconds under load, and Supabase
 * starts rejecting new connections with "remaining connection slots are
 * reserved". The pooler (Supabase's own PgBouncer) reuses a fixed set of
 * connections across all instances, so one deployment can scale to dozens
 * of concurrent requests without exhausting the DB.
 *
 * Two pool modes exist:
 *
 *   Transaction mode (port 6543)
 *     A connection is borrowed for the duration of one SQL transaction and
 *     returned to the pool when it ends. Best for serverless / edge, where
 *     a single request handler opens one transaction, runs one query, and
 *     returns — exactly the pattern of every API route in this app.
 *     SET statements (prepared statements, session variables) are NOT
 *     preserved across transactions. This is fine for Supabase's usual
 *     usage (single-query mutations) but means you cannot rely on session
 *     state set by one query being visible to the next.
 *
 *   Session mode (port 6544)
 *     A connection is pinned to the client for the whole session. Use for
 *     pg_cron, LISTEN/NOTIFY, or when you need prepared statements / SET
 *     ROLE to persist across queries. Not recommended for HTTP request
 *     handlers — each one holds a DB connection until the response is sent.
 *
 * For this app all API routes create transient clients per request, so
 * transaction mode (6543) is the right choice.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────────
 *
 * In your Supabase project dashboard (https://supabase.com/dashboard/project/<ref>/settings/database)
 * find the "Connection pooling" section. The pooler URL is:
 *
 *   postgresql://<user>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
 *
 * For the REST/HTTP client (what supabase-js uses), the pooler URL is:
 *
 *   https://<project-ref>.supabase.co     → direct (default, port 5432)
 *   https://<project-ref>-pooler.supabase.co?pgbouncer=true  → pooler (port 6543)
 *
 * Set SUPABASE_URL to the pooler URL in production:
 *
 *   # .env.production.local
 *   SUPABASE_URL=https://<project-ref>-pooler.supabase.co
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co  ← unchanged
 *
 * The supabase-js / @supabase/ssr clients automatically use the URL you
 * give them. The server-side client (lib/supabase/server.ts) reads
 * SUPABASE_URL; setting it to the pooler URL is sufficient.
 */

/**
 * Pooler-aware URL builder.
 *
 * In production, returns the pooler URL (port 6543) so every server-side
 * connection goes through PgBouncer. In development, returns the direct
 * URL as-is since only one instance ever connects.
 */
export function poolerUrl(input: string): string {
  const isProduction = process.env.NODE_ENV === 'production' && process.env.APP_ENV === 'production';
  if (!isProduction) return input;

  // Already a pooler URL.
  if (input.includes('-pooler.')) return input;
  if (input.includes('pooler.supabase.co')) return input;

  // Transform: https://<ref>.supabase.co → https://<ref>-pooler.supabase.co
  try {
    const u = new URL(input);
    const hostParts = u.hostname.split('.');
    if (hostParts.length >= 3 && hostParts[0] && hostParts[1] === 'supabase') {
      const ref = hostParts[0];
      u.hostname = `${ref}-pooler.supabase.co`;
      u.port = '6543';
      return u.toString();
    }
  } catch {
    // Not a valid URL — return as-is.
  }
  return input;
}

/**
 * supabase-js connection options for the pooler.
 *
 * supabase-js communicates with PostgREST over HTTP, so PgBouncer's
 * transaction-mode limitation on prepared statements does not apply —
 * PostgREST handles its own connection pooling internally. The `db` option
 * below is a no-op when using the REST client; it only takes effect if you
 * switch to the Postgres wire-protocol channel or use @supabase/postgrest-js
 * directly with prepared statements.
 *
 * Enforce a short timeout so a pool-saturated database doesn't hold
 * serverless instances open.
 */
export function poolerOptions() {
  return {
    global: {
      fetch: (url: RequestInfo | URL, init?: RequestInit) =>
        fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  };
}
