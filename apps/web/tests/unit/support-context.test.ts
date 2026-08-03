import { describe, it, expect } from 'vitest';
import { sanitizeContext } from '@/app/api/support/tickets/route';

/**
 * The support ticket `context` blob is the one place a client hands us an
 * arbitrary object that gets persisted and then read by an admin. An
 * allowlist is the only safe shape: a blocklist would have to anticipate every
 * key a future client might attach, and the failure mode is an access token
 * sitting in a support ticket forever.
 */
describe('sanitizeContext', () => {
  it('keeps only the allowlisted diagnostic keys', () => {
    const out = sanitizeContext({
      route: '/dashboard/projects',
      platform: 'web',
      app_version: '1.0.0',
      user_agent: 'Mozilla/5.0',
      project_id: '42',
    });

    expect(out).toEqual({
      route: '/dashboard/projects',
      platform: 'web',
      app_version: '1.0.0',
      user_agent: 'Mozilla/5.0',
      project_id: '42',
    });
  });

  it('drops anything not on the allowlist, including credentials', () => {
    const out = sanitizeContext({
      route: '/dashboard',
      access_token: 'eyJhbGciOi.super.secret',
      password: 'hunter2',
      supabase_session: '{"refresh_token":"leak"}',
      cookies: 'sb-auth=abc',
    });

    expect(out).toEqual({ route: '/dashboard' });
    expect(JSON.stringify(out)).not.toContain('secret');
    expect(JSON.stringify(out)).not.toContain('hunter2');
    expect(JSON.stringify(out)).not.toContain('leak');
  });

  it('truncates long values so one field cannot bloat the row', () => {
    const out = sanitizeContext({ user_agent: 'x'.repeat(5000) });
    expect(out.user_agent).toHaveLength(300);
  });

  it('ignores non-string values rather than coercing them', () => {
    const out = sanitizeContext({
      route: 123,
      platform: { nested: true },
      app_version: null,
      user_agent: ['a'],
    });
    expect(out).toEqual({});
  });

  it('returns an empty object for junk input', () => {
    expect(sanitizeContext(null)).toEqual({});
    expect(sanitizeContext(undefined)).toEqual({});
    expect(sanitizeContext('a string')).toEqual({});
    expect(sanitizeContext(42)).toEqual({});
  });
});
