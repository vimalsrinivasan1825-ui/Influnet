import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run with --env-file=apps/web/.env.local)');
}

export const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/**
 * Poll a table until a row matching `filter` appears, or throw.
 * filter: { column: value, ... } — exact-match eq() filters only.
 */
export async function waitForRow(table, filter, { timeoutMs = 8000, intervalMs = 400, orderBy = 'created_at' } = {}) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    let q = sb.from(table).select('*');
    for (const [col, val] of Object.entries(filter)) q = q.eq(col, val);
    // Re-runs across test sessions can leave multiple matching rows (e.g.
    // several collab_requests between the same pair) — always take the most
    // recent rather than assuming uniqueness, which .maybeSingle() would break on.
    const { data, error } = await q.order(orderBy, { ascending: false }).limit(1);
    if (error) { lastErr = error; }
    else if (data && data.length) return data[0];
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `waitForRow: no row in "${table}" matching ${JSON.stringify(filter)} after ${timeoutMs}ms` +
    (lastErr ? ` (last error: ${lastErr.message})` : '')
  );
}

export async function getRow(table, filter) {
  let q = sb.from(table).select('*');
  for (const [col, val] of Object.entries(filter)) q = q.eq(col, val);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`getRow(${table}): ${error.message}`);
  return data;
}

/**
 * Poll a single row by `filter` until `predicate(row)` is true, or give up
 * and return whatever the last read was. A UI action's effect (a stage
 * advance, a field update) can land a beat after the click that triggered it
 * resolves client-side — this avoids reading a stale row and reporting a
 * false failure. Always returns the row (never throws) so the caller's own
 * assertion still gets a real, informative diff if it truly never converges.
 */
export async function getRowSettled(table, filter, predicate, { timeoutMs = 4000, intervalMs = 700 } = {}) {
  const start = Date.now();
  let row = await getRow(table, filter);
  while (Date.now() - start < timeoutMs && !predicate(row)) {
    await new Promise((r) => setTimeout(r, intervalMs));
    row = await getRow(table, filter);
  }
  return row;
}

export async function countRows(table, filter = {}) {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  for (const [col, val] of Object.entries(filter)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) throw new Error(`countRows(${table}): ${error.message}`);
  return count;
}

/** Assert specific fields on a row match expected values (===, or a predicate fn). Throws with a precise diff on mismatch. */
export function assertFields(row, expected, label = 'row') {
  if (!row) throw new Error(`assertFields: ${label} is null/undefined`);
  const mismatches = [];
  for (const [key, expectedVal] of Object.entries(expected)) {
    const actual = row[key];
    const ok = typeof expectedVal === 'function' ? expectedVal(actual) : actual === expectedVal;
    if (!ok) mismatches.push(`${key}: expected ${typeof expectedVal === 'function' ? '(predicate)' : JSON.stringify(expectedVal)}, got ${JSON.stringify(actual)}`);
  }
  if (mismatches.length) throw new Error(`assertFields(${label}) mismatch:\n  ${mismatches.join('\n  ')}`);
}

export async function findAuthUserByEmail(email) {
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`findAuthUserByEmail: ${error.message}`);
  return data.users.find((u) => u.email === email) || null;
}

export async function confirmEmail(userId) {
  const { error } = await sb.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) throw new Error(`confirmEmail: ${error.message}`);
}
