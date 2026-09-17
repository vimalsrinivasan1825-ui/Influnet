import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Column-level SELECT grants — the trap that takes whole features down silently.
 *
 * `authenticated` has NO table-level SELECT on these tables, only a column
 * allow-list. PostgREST does not null out an ungranted column: it fails the
 * ENTIRE query with 42501. Code that ignores `error` then renders blanks, and
 * code that treats "no profile" as unauthorised locks the user out.
 *
 * Real incidents this test would have caught:
 *   - withAuth selecting profiles.is_super_admin → every API call 403'd.
 *   - /api/profile/viewers selecting business_profiles.logo_url → every viewer
 *     rendered with no name.
 *   - /api/home selecting business_profiles.username → brand Home card empty.
 *
 * Refresh GRANTED from the live database when a migration changes grants:
 *
 *   select table_name, json_agg(column_name order by column_name)
 *   from information_schema.columns c
 *   where table_schema = 'public'
 *     and table_name in ('profiles', 'business_profiles')
 *     and has_column_privilege('authenticated',
 *           format('public.%I', table_name), column_name, 'SELECT')
 *   group by 1;
 */
const GRANTED: Record<string, Set<string>> = {
  profiles: new Set([
    'created_at', 'id', 'location', 'mediakit_nudge_dismissed_at', 'name',
    'ownership_nudge_dismissed_at', 'role', 'updated_at', 'verification_status',
    'verified_at', 'verified_badge', 'welcome_seen_at',
  ]),
  business_profiles: new Set(['approval_status', 'company_name', 'industry', 'user_id']),
};

/**
 * Files that read these tables with the SERVICE-ROLE key, where column grants
 * do not apply. Adding a file here is a claim that every such query in it uses
 * a service client — check before adding.
 */
const SERVICE_ROLE_FILES = [
  /^app\/api\/admin\//, // withAdmin / withSuperAdmin hand back a service client
  /^app\/api\/projects\/\[id\]\/documents\/route\.tsx$/, // `admin` client
  /^lib\/notify\.ts$/, // sendPush(sb) receives its service client
];

/** A query made directly on one of these receivers is service-role, wherever it sits. */
const SERVICE_RECEIVER = /(?:\bserviceClient|\bcreateServerClient\(\))\s*$/;

const SRC = join(__dirname, '..', '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const SELECT_RE = /\.from\(\s*['"](\w+)['"]\s*\)\s*\.select\(\s*['"`]([^'"`]*)['"`]/g;

function columnsOf(select: string): string[] {
  return select
    // Embedded relations, e.g. owner:profiles!fk(id, name), are checked by
    // PostgREST against the embedded table, not this one.
    .replace(/[\w!:]+\([^)]*\)/g, '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    // alias:column → column
    .map((c) => c.split(':').pop()!.trim());
}

describe('column-level SELECT grants', () => {
  it('no caller-scoped query selects a column authenticated cannot read', () => {
    const violations: string[] = [];

    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (SERVICE_ROLE_FILES.some((re) => re.test(rel))) continue;

      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(SELECT_RE)) {
        const granted = GRANTED[m[1]];
        if (!granted) continue;
        if (SERVICE_RECEIVER.test(source.slice(Math.max(0, m.index! - 80), m.index))) continue;
        const bad = columnsOf(m[2]).filter((c) => c === '*' || !granted.has(c));
        if (bad.length > 0) {
          const line = source.slice(0, m.index).split('\n').length;
          violations.push(`${rel}:${line} ${m[1]} → ${bad.join(', ')}`);
        }
      }
    }

    expect(violations, 'Use an RPC (e.g. get_own_business_profile) or a narrow service-role read').toEqual([]);
  });

  it('the scanner actually detects a violation', () => {
    const sample = `sb.from('profiles').select('role, is_super_admin')`;
    const [m] = [...sample.matchAll(SELECT_RE)];
    expect(columnsOf(m[2]).filter((c) => !GRANTED.profiles.has(c))).toEqual(['is_super_admin']);
  });
});
