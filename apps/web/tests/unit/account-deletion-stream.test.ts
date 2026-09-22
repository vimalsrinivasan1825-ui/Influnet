import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Account deletion must also remove the person from Stream Chat (F6), and a
 * Stream failure must be REPORTED but never block the deletion: the account is
 * already gone by then, and both app stores require deletion to keep working
 * through a chat-vendor outage.
 */
const stream = vi.hoisted(() => ({
  deleteStreamUser: vi.fn(),
  deleteStreamChannels: vi.fn(),
}));
vi.mock('@/lib/stream', () => stream);
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { hardDeleteAccount } from '@/lib/account-deletion';
import { logger } from '@/lib/logger';

/** A chainable, thenable fake of the supabase-js query builder. */
function fakeClient(opts: { participants: string[]; stillThere: string[]; deleteUserError?: string }) {
  const calls: string[] = [];
  const queue = [
    opts.participants.map((c) => ({ conversation_id: c })), // first read: who was in which conversation
    opts.stillThere.map((c) => ({ conversation_id: c })), //   second read: who still is
  ];
  const chain = (table: string): any =>
    new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'then') {
          const data = table === 'conversation_participants' ? queue.shift() ?? [] : [];
          return (resolve: (v: unknown) => void) => resolve({ data, error: null });
        }
        return (..._a: unknown[]) => {
          calls.push(`${table}.${String(prop)}`);
          return chain(table);
        };
      },
    });
  return {
    calls,
    from: (t: string) => chain(t),
    auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: opts.deleteUserError ? { message: opts.deleteUserError } : null }) } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stream.deleteStreamUser.mockResolvedValue({ ok: true });
  stream.deleteStreamChannels.mockResolvedValue({ deleted: 0 });
});

describe('hardDeleteAccount → Stream', () => {
  it('removes the Stream user after the account is deleted', async () => {
    const c = fakeClient({ participants: [], stillThere: [] });
    const r = await hardDeleteAccount(c, 'user-1');
    expect(r.ok).toBe(true);
    expect(c.auth.admin.deleteUser).toHaveBeenCalledWith('user-1');
    expect(stream.deleteStreamUser).toHaveBeenCalledWith('user-1');
    if (r.ok) expect(r.stream.userRemoved).toBe(true);
  });

  it('deletes the Stream channel of a conversation nobody is left in, and only that one', async () => {
    stream.deleteStreamChannels.mockResolvedValue({ deleted: 1 });
    // conv-a still has the other person; conv-b is now empty
    const c = fakeClient({ participants: ['conv-a', 'conv-b'], stillThere: ['conv-a'] });
    const r = await hardDeleteAccount(c, 'user-1');
    expect(stream.deleteStreamChannels).toHaveBeenCalledWith(['conv-b']);
    if (r.ok) expect(r.conversationsSwept).toBe(1);
  });

  it('a Stream failure does NOT block the deletion — it is logged and reported', async () => {
    stream.deleteStreamUser.mockResolvedValue({ ok: false, error: 'Stream is down' });
    const c = fakeClient({ participants: [], stillThere: [] });
    const r = await hardDeleteAccount(c, 'user-1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.stream.userRemoved).toBe(false);
      expect(r.stream.error).toBe('Stream is down');
    }
    expect(logger.error).toHaveBeenCalled();
  });

  it('never touches Stream when the account itself could not be deleted', async () => {
    const c = fakeClient({ participants: [], stillThere: [], deleteUserError: 'db said no' });
    const r = await hardDeleteAccount(c, 'user-1');
    expect(r).toEqual({ ok: false, error: 'db said no' });
    expect(stream.deleteStreamUser).not.toHaveBeenCalled();
  });
});
