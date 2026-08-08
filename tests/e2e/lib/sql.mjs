// Direct SQL access to the Supabase project via the Management API.
//
// PostgREST alone can't answer the questions an audit needs to ask — schema
// introspection, applied-migration state, cross-table aggregate checks, or
// "did this constraint actually fire". The Management API's query endpoint
// runs real SQL against the project's database, so assertions can be written
// against the truth rather than against whatever the REST surface chooses to
// expose.
//
// Requires SUPABASE_ACCESS_TOKEN (sbp_...) in the environment; run scripts
// with `node --env-file=apps/web/.env.local`.

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!TOKEN || !URL_) {
  throw new Error(
    'SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL must be set ' +
    '(run with --env-file=apps/web/.env.local)'
  );
}

export const PROJECT_REF = URL_.match(/https:\/\/([a-z0-9]+)\./)[1];

/**
 * Run SQL against the project database. Returns the rows array. Throws on error.
 *
 * The Management API throttles aggressively (HTTP 429 "ThrottlerException"),
 * and an audit run issues a lot of statements, so 429 is retried with backoff
 * rather than surfaced — a throttle is a fact about the API's rate limiter, not
 * a fact about the software under test, and letting it abort a phase would
 * produce a false finding. Real SQL errors (4xx other than 429) still throw.
 *
 * Multiple statements may be separated by semicolons; the endpoint returns the
 * rows of the LAST statement, which is why the batch helpers below put their
 * SELECT last.
 */
export async function sql(query, { retries = 6 } = {}) {
  let delay = 1000;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      }
    );
    const text = await res.text();
    if (res.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 20_000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`sql(${res.status}): ${text.slice(0, 600)}\n--- query ---\n${query.slice(0, 400)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

/** Run SQL and return the first row, or null. */
export async function sqlOne(query) {
  const rows = await sql(query);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** Escape a JS string for inlining as a SQL literal. */
export function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
}
