import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/admin/team creates a real login. The property that matters: a
 * refused grant never leaves one behind — the refusal happens before
 * createUser, and a refusal from admin_team_save afterwards deletes it again.
 */

const state: {
  isSuper: boolean;
  member: Record<string, unknown> | null;
  sqlProblem: string | null;
  saveError: { code: string; message: string } | null;
} = { isSuper: false, member: null, sqlProblem: null, saveError: null };

const createUser = vi.fn(async () => ({ data: { user: { id: '11111111-1111-1111-1111-111111111111' } }, error: null }));
const deleteUser = vi.fn(async () => ({ error: null }));
const generateLink = vi.fn(async () => ({ data: { properties: { action_link: 'https://link.test/once', hashed_token: 'abc123' } }, error: null }));
const updateUserById = vi.fn(async () => ({ error: null }));
const rpc = vi.fn(async (fn: string) => {
  if (fn === 'admin_grant_problem') return { data: state.sqlProblem, error: null };
  if (fn === 'admin_team_save') return state.saveError ? { data: null, error: state.saveError } : { data: { tier: 'staff' }, error: null };
  return { data: null, error: null };
});

function builder(table: string, cols: string) {
  const result = () => {
    if (table === 'profiles' && cols === 'role') return { data: { role: 'admin' }, error: null };
    if (table === 'profiles' && cols === 'is_super_admin') return { data: { is_super_admin: state.isSuper }, error: null };
    if (table === 'admin_members') return { data: state.member, error: null };
    return { data: null, error: null };
  };
  const b: any = { eq: () => b, single: async () => result(), maybeSingle: async () => result() };
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'actor', email: 'actor@test.com' } }, error: null }),
      admin: { createUser, deleteUser, generateLink, updateUserById },
    },
    from: (table: string) => ({ select: (cols: string) => builder(table, cols) }),
    rpc,
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

const { POST } = await import('@/app/api/admin/team/route');

const post = (body: unknown) =>
  POST(
    new Request('https://app.test/api/admin/team', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json', host: 'app.test' },
      body: JSON.stringify(body),
    }),
  );

const base = { email: 'new@test.com', name: 'New', permissions: { users: 'view' }, hidden_fields: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
  state.isSuper = false;
  state.member = { tier: 'admin', permissions: { users: 'manage', team: 'manage' }, hidden_fields: [], disabled_at: null };
  state.sqlProblem = null;
  state.saveError = null;
});

describe('POST /api/admin/team', () => {
  it('an admin creating an admin is refused before any login exists', async () => {
    const res = await post({ ...base, tier: 'admin' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Admins can create staff, not other admins.');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('a grant beyond the admin\'s own access is refused before any login exists', async () => {
    const res = await post({ ...base, tier: 'staff', permissions: { payments: 'view' } });
    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('the SQL check is authoritative even when the TS mirror agrees', async () => {
    state.sqlProblem = 'Your account does not have permission to manage the team.';
    const res = await post({ ...base, tier: 'staff' });
    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('a refusal from admin_team_save deletes the login it just created', async () => {
    state.saveError = { code: '42501', message: 'This email already belongs to an Influnet account.' };
    const res = await post({ ...base, tier: 'staff' });
    expect(res.status).toBe(403);
    expect(createUser).toHaveBeenCalledOnce();
    expect(deleteUser).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('creates staff and returns a one-time invite link by default', async () => {
    const res = await post({ ...base, tier: 'staff' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.credentials.kind).toBe('invite');
    expect(body.credentials.link).toMatch(/^https?:\/\/[^/]+\/reset-password\?token_hash=abc123&type=recovery$/);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('returns a generated password once when asked', async () => {
    const res = await post({ ...base, tier: 'staff', delivery: 'password' });
    const body = await res.json();
    expect(body.credentials.kind).toBe('password');
    expect(body.credentials.password).toHaveLength(24);
  });

  it('a super admin may create an admin', async () => {
    state.isSuper = true;
    const res = await post({ ...base, tier: 'admin', permissions: { payments: 'manage', team: 'manage' } });
    expect(res.status).toBe(201);
  });

  it('staff cannot reach the endpoint at all', async () => {
    state.member = { tier: 'staff', permissions: { users: 'manage' }, hidden_fields: [], disabled_at: null };
    const res = await post({ ...base, tier: 'staff' });
    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });
});
