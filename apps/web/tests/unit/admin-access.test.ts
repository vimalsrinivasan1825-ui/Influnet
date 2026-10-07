import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_MODULES,
  ADMIN_MODULE_KEYS,
  FIELD_GROUP_KEYS,
  HIDDEN_VALUE,
  SUPER_ACCESS,
  allows,
  canOpenPage,
  creatableTiers,
  grantProblem,
  redactHidden,
  requiredLevel,
  sectionForApiPath,
  sectionForPage,
  type AdminAccess,
} from '@/lib/admin-access';
import { MODULES as INSIGHT_MODULES } from '@/lib/admin-insights';

const ROOT = join(__dirname, '..', '..', '..', '..');
const API_ADMIN = join(ROOT, 'apps/web/src/app/api/admin');
const PAGES_ADMIN = join(ROOT, 'apps/web/src/app/dashboard/admin');

const admin: AdminAccess = {
  tier: 'admin',
  permissions: { users: 'manage', payments: 'view', team: 'manage' },
  hiddenFields: ['email'],
};
const staff: AdminAccess = { tier: 'staff', permissions: { users: 'view' }, hiddenFields: ['email', 'phone'] };

/** Every /api/admin route directory, as the path segment after /api/admin/. */
function apiRouteDirs(dir = API_ADMIN, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const seg = e.name.startsWith('[') ? 'x' : e.name;
    const rel = prefix ? `${prefix}/${seg}` : seg;
    const full = join(dir, e.name);
    if (readdirSync(full).includes('route.ts')) out.push(rel);
    out.push(...apiRouteDirs(full, rel));
  }
  return out;
}

describe('catalog stays in step with migration 176', () => {
  const migration = readFileSync(join(ROOT, 'supabase/migrations/176_admin_team_roles.sql'), 'utf8');
  const sqlArray = (fn: string) => {
    const body = migration.split(`FUNCTION public.${fn}()`)[1].split('$$')[1];
    return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };

  it('sections match admin_delegable_modules()', () => {
    expect([...ADMIN_MODULE_KEYS].sort()).toEqual(sqlArray('admin_delegable_modules').sort());
  });

  it('field groups match admin_field_groups()', () => {
    expect([...FIELD_GROUP_KEYS].sort()).toEqual(sqlArray('admin_field_groups').sort());
  });
});

describe('every admin route and report belongs to a section', () => {
  it('no /api/admin route is unmapped (unmapped = super admin only)', () => {
    // insights/[module] is routed per report name — covered by the next test.
    const unmapped = apiRouteDirs()
      .filter((p) => p !== 'insights/x')
      .filter((p) => sectionForApiPath(`/api/admin/${p}`).kind === 'unknown');
    expect(unmapped).toEqual([]);
  });

  it('every insight module is claimed by exactly one section', () => {
    for (const name of Object.keys(INSIGHT_MODULES)) {
      const owners = ADMIN_MODULES.filter((m) => m.insights.includes(name));
      expect(owners.map((m) => m.key), name).toHaveLength(1);
    }
  });

  it('every console page is a section or a developer page', () => {
    const pages = readdirSync(PAGES_ADMIN, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `/dashboard/admin/${e.name}`);
    const unknown = pages.filter((p) => sectionForPage(p).kind === 'unknown');
    expect(unknown).toEqual([]);
  });
});

describe('sectionForApiPath', () => {
  it('longest prefix wins: report builder vs moderation', () => {
    expect(sectionForApiPath('/api/admin/reports/dataset')).toEqual({ kind: 'module', module: 'report_builder' });
    expect(sectionForApiPath('/api/admin/reports/saved')).toEqual({ kind: 'module', module: 'report_builder' });
    expect(sectionForApiPath('/api/admin/reports')).toEqual({ kind: 'module', module: 'moderation' });
  });

  it('matches whole segments only', () => {
    expect(sectionForApiPath('/api/admin/usersx').kind).toBe('unknown');
    expect(sectionForApiPath('/api/admin/users/abc')).toEqual({ kind: 'module', module: 'users' });
  });

  it('routes insights by report name', () => {
    expect(sectionForApiPath('/api/admin/insights/payments')).toEqual({ kind: 'module', module: 'payments' });
    expect(sectionForApiPath('/api/admin/insights/daily')).toEqual({ kind: 'module', module: 'analytics' });
    expect(sectionForApiPath('/api/admin/insights/nope').kind).toBe('unknown');
  });

  it('keeps developer routes developer-only and the tier route open', () => {
    for (const p of ['health', 'vendors', 'issues', 'rate-limits', 'emails', 'observability']) {
      expect(sectionForApiPath(`/api/admin/${p}`).kind).toBe('developer');
    }
    expect(sectionForApiPath('/api/admin/tier').kind).toBe('open');
  });

  it('puts the audit log under Team, so admins with Team can read it', () => {
    expect(sectionForApiPath('/api/admin/audit')).toEqual({ kind: 'module', module: 'team' });
    expect(sectionForPage('/dashboard/admin/audit')).toEqual({ kind: 'module', module: 'team' });
  });
});

describe('levels', () => {
  it('GET needs view, anything else needs manage', () => {
    expect(requiredLevel('GET')).toBe('view');
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) expect(requiredLevel(m)).toBe('manage');
  });

  it('view does not satisfy manage; super satisfies everything', () => {
    expect(allows(admin, 'payments', 'view')).toBe(true);
    expect(allows(admin, 'payments', 'manage')).toBe(false);
    expect(allows(admin, 'support', 'view')).toBe(false);
    expect(allows(SUPER_ACCESS, 'payments', 'manage')).toBe(true);
  });

  it('page gate', () => {
    expect(canOpenPage(staff, '/dashboard/admin/users/123')).toBe(true);
    expect(canOpenPage(staff, '/dashboard/admin/payments')).toBe(false);
    expect(canOpenPage(staff, '/dashboard/admin')).toBe(false);
    expect(canOpenPage(admin, '/dashboard/admin/health')).toBe(false);
    expect(canOpenPage(SUPER_ACCESS, '/dashboard/admin/health')).toBe(true);
  });
});

describe('grantProblem mirrors the SQL rule', () => {
  it('super admin may create admins and staff with anything', () => {
    expect(grantProblem(SUPER_ACCESS, 'admin', { payments: 'manage', team: 'manage' }, [])).toBeNull();
    expect(creatableTiers(SUPER_ACCESS)).toEqual(['admin', 'staff']);
  });

  it('an admin creates staff, not admins', () => {
    expect(grantProblem(admin, 'admin', {}, ['email'])).toBe('Admins can create staff, not other admins.');
    expect(creatableTiers(admin)).toEqual(['staff']);
  });

  it('an admin cannot exceed its own level or reach a section it lacks', () => {
    expect(grantProblem(admin, 'staff', { payments: 'manage' }, ['email'])).toMatch(/cannot grant manage access to "payments"/);
    expect(grantProblem(admin, 'staff', { support: 'view' }, ['email'])).toMatch(/cannot grant view access to "support"/);
    expect(grantProblem(admin, 'staff', { users: 'manage', payments: 'view' }, ['email'])).toBeNull();
  });

  it('an admin cannot reveal a hidden field', () => {
    expect(grantProblem(admin, 'staff', { users: 'view' }, [])).toBe('You cannot show fields that are hidden from you.');
  });

  it('staff never hold team, and never create anyone', () => {
    expect(grantProblem(SUPER_ACCESS, 'staff', { team: 'view' }, [])).toBe('Staff accounts cannot manage the team.');
    expect(grantProblem(staff, 'staff', {}, ['email', 'phone'])).toBe('Your account cannot create or change team members.');
    expect(creatableTiers(staff)).toEqual([]);
  });

  it('an admin without team access creates nobody', () => {
    const noTeam: AdminAccess = { ...admin, permissions: { users: 'manage' } };
    expect(grantProblem(noTeam, 'staff', {}, ['email'])).toBe('Your account does not have permission to manage the team.');
    expect(creatableTiers(noTeam)).toEqual([]);
  });

  it('refuses unknown sections, including developer ones', () => {
    expect(grantProblem(SUPER_ACCESS, 'staff', { health: 'view' }, [])).toMatch(/not recognised/);
    expect(grantProblem(SUPER_ACCESS, 'staff', { users: 'admin' as any }, [])).toMatch(/not recognised/);
  });
});

describe('redactHidden', () => {
  const payload = {
    rows: [
      {
        id: 'u1', name: 'Asha', email: 'a@x.com', actor_email: 'b@x.com', email_confirmed: true,
        phone: '+919999999999', city: 'Chennai', amount_paise: 50000, gmv: 10, status: 'paid',
        ip_address: '1.2.3.4', top_phones: [{ phone: '1', n: 2 }],
      },
    ],
    total: 1,
  };

  it('does nothing when nothing is hidden', () => {
    expect(redactHidden(payload, [])).toBe(payload);
  });

  it('masks every key of a hidden group at any depth, keeping the keys', () => {
    const out = redactHidden(payload, ['email', 'phone']);
    const r = out.rows[0];
    expect(r.email).toBe(HIDDEN_VALUE);
    expect(r.actor_email).toBe(HIDDEN_VALUE);
    expect(r.phone).toBe(HIDDEN_VALUE);
    expect(r.top_phones).toEqual([]);
    // Not in a hidden group, or a flag about the field rather than the field.
    expect(r.email_confirmed).toBe(true);
    expect(r.city).toBe('Chennai');
    expect(r.amount_paise).toBe(50000);
    expect(r.name).toBe('Asha');
    expect(out.total).toBe(1);
  });

  it('masks money, location and device', () => {
    const r = redactHidden(payload, ['money', 'location', 'device']).rows[0];
    expect(r.amount_paise).toBeNull();
    expect(r.gmv).toBeNull();
    expect(r.city).toBe(HIDDEN_VALUE);
    expect(r.ip_address).toBe(HIDDEN_VALUE);
    expect(r.status).toBe('paid');
  });

  it('does not mutate its input', () => {
    redactHidden(payload, ['email']);
    expect(payload.rows[0].email).toBe('a@x.com');
  });
});
