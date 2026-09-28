import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * withAdmin is the server-side gate for every /api/admin route. The catalog
 * (admin-access.test.ts) decides which section a path belongs to; this proves
 * the gate actually refuses on that decision — and fails CLOSED for a member
 * row that is missing or disabled, while a missing TABLE (migration 176 not
 * applied) keeps the pre-team behaviour instead of locking every admin out.
 */

const state: {
  role: string;
  isSuper: boolean;
  member: Record<string, unknown> | null;
  memberError: { code?: string; message?: string } | null;
} = { role: 'admin', isSuper: false, member: null, memberError: null };

function builder(table: string, cols: string) {
  const result = () => {
    if (table === 'profiles' && cols === 'role') return { data: { role: state.role }, error: null };
    if (table === 'profiles' && cols === 'is_super_admin') return { data: { is_super_admin: state.isSuper }, error: null };
    if (table === 'admin_members') return { data: state.memberError ? null : state.member, error: state.memberError };
    return { data: null, error: null };
  };
  const b: any = {
    eq: () => b,
    single: async () => result(),
    maybeSingle: async () => result(),
  };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'u1@test.com' } }, error: null }) },
    from: (table: string) => ({ select: (cols: string) => builder(table, cols) }),
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

const { withAdmin, withSuperAdmin, adminAccessFor, adminJson, adminRows } = await import('@/lib/api');

const req = (path: string, method = 'GET') =>
  new Request(`https://app.test${path}`, { method, headers: { Authorization: 'Bearer t' } });

async function status(path: string, method = 'GET') {
  const r = await withAdmin(req(path, method));
  return r.ok ? 200 : r.res.status;
}

beforeEach(() => {
  state.role = 'admin';
  state.isSuper = false;
  state.member = null;
  state.memberError = null;
});

describe('withAdmin — section gate', () => {
  it('a super admin passes everything, developer routes included', async () => {
    state.isSuper = true;
    expect(await status('/api/admin/payments-anything')).toBe(200); // unmapped → super only
    expect(await status('/api/admin/health')).toBe(200);
    expect(await status('/api/admin/users/1', 'DELETE')).toBe(200);
  });

  it('staff reach only their sections, at their level', async () => {
    state.member = { tier: 'staff', permissions: { users: 'view', leads: 'manage' }, hidden_fields: [], disabled_at: null };
    expect(await status('/api/admin/users')).toBe(200);
    expect(await status('/api/admin/users/1', 'PATCH')).toBe(403);
    expect(await status('/api/admin/leads/1', 'PATCH')).toBe(200);
    expect(await status('/api/admin/insights/payments')).toBe(403);
    expect(await status('/api/admin/insights/leads')).toBe(200);
    expect(await status('/api/admin/health')).toBe(403);
    expect(await status('/api/admin/tier')).toBe(200);
  });

  it('says why: view-only vs no access', async () => {
    state.member = { tier: 'staff', permissions: { users: 'view' }, hidden_fields: [], disabled_at: null };
    const viewOnly = await withAdmin(req('/api/admin/users/1', 'DELETE'));
    const none = await withAdmin(req('/api/admin/support'));
    expect(!viewOnly.ok && (await viewOnly.res.json()).error).toBe('You have view-only access to Users.');
    expect(!none.ok && (await none.res.json()).error).toBe('Your account does not have access to Support.');
  });

  it('an unmapped route is super-admin-only', async () => {
    state.member = { tier: 'admin', permissions: { users: 'manage' }, hidden_fields: [], disabled_at: null };
    expect(await status('/api/admin/something-new')).toBe(403);
  });

  it('a disabled member is refused', async () => {
    state.member = { tier: 'admin', permissions: { users: 'manage' }, hidden_fields: [], disabled_at: '2026-09-28T00:00:00Z' };
    expect(await status('/api/admin/users')).toBe(403);
  });

  it('an admin with no member row fails closed', async () => {
    expect(await status('/api/admin/users')).toBe(403);
  });

  it('a missing admin_members table keeps pre-176 behaviour (all but developer)', async () => {
    state.memberError = { code: 'PGRST205', message: "Could not find the table 'public.admin_members' in the schema cache" };
    expect(await status('/api/admin/users/1', 'DELETE')).toBe(200);
    expect(await status('/api/admin/health')).toBe(403);
  });

  it('any other read error is a 503, not access', async () => {
    state.memberError = { code: '57014', message: 'canceling statement due to statement timeout' };
    expect(await status('/api/admin/users')).toBe(503);
  });

  it('a non-admin never reaches the section check', async () => {
    state.role = 'influencer';
    state.isSuper = true;
    expect(await status('/api/admin/users')).toBe(403);
  });

  it('records the access on the request for field hiding', async () => {
    state.member = { tier: 'staff', permissions: { users: 'view' }, hidden_fields: ['email'], disabled_at: null };
    const r = req('/api/admin/users');
    await withAdmin(r);
    expect(adminAccessFor(r)?.hiddenFields).toEqual(['email']);
  });
});

describe('withSuperAdmin', () => {
  it('refuses a full admin, admits a super admin', async () => {
    state.member = { tier: 'admin', permissions: { users: 'manage' }, hidden_fields: [], disabled_at: null };
    const r1 = await withSuperAdmin(req('/api/admin/tier'));
    expect(r1.ok).toBe(false);
    state.isSuper = true;
    const r2 = await withSuperAdmin(req('/api/admin/tier'));
    expect(r2.ok).toBe(true);
  });
});

describe('adminJson — hidden fields never leave the server', () => {
  const body = { users: [{ id: '1', name: 'Asha', email: 'a@x.com', phone: '+91999', city: 'Chennai' }] };

  it('masks the caller\'s hidden groups in JSON and CSV rows', async () => {
    state.member = { tier: 'staff', permissions: { users: 'view' }, hidden_fields: ['email', 'phone'], disabled_at: null };
    const r = req('/api/admin/users');
    await withAdmin(r);
    const out = await adminJson(r, body).json();
    expect(out.users[0]).toEqual({ id: '1', name: 'Asha', email: 'Hidden', phone: 'Hidden', city: 'Chennai' });
    expect(adminRows(r, body.users)[0].email).toBe('Hidden');
  });

  it('passes everything through for a super admin', async () => {
    state.isSuper = true;
    const r = req('/api/admin/users');
    await withAdmin(r);
    expect(await adminJson(r, body).json()).toEqual(body);
  });

  it('keeps the status and headers it was given', async () => {
    state.isSuper = true;
    const r = req('/api/admin/users');
    await withAdmin(r);
    const res = adminJson(r, { error: 'x' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    expect(res.status).toBe(409);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
