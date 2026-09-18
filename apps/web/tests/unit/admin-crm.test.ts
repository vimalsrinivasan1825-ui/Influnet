import { describe, expect, it } from 'vitest';
import {
  MODULES,
  DATASETS,
  intParam,
  istToday,
  parseRange,
  shiftDays,
  strParam,
  toCsv,
  CSV_SENSITIVE,
} from '@/lib/admin-insights';
import { BroadcastCreateSchema, AudienceSchema, approvalThreshold } from '@/lib/broadcast-schema';
import { broadcastLink } from '@/lib/broadcasts';
import { withDefaults, EXPO_BATCH } from '@/lib/expo-push';
import { identifierHash, DELETION_REASONS } from '@/lib/account-deletion';
import { renewalCopy } from '@/lib/renewal-reminders';

/**
 * The admin CRM's pure logic. Everything here decides what an admin can ask
 * for, what leaves the building, or what a person is told — the parts worth
 * pinning down without a database.
 */

describe('date ranges', () => {
  it('defaults to the last 30 IST days', () => {
    const r = parseRange(new URLSearchParams());
    expect(r.to).toBe(istToday());
    expect(r.from).toBe(shiftDays(r.to, -29));
  });

  it('accepts an explicit range', () => {
    const r = parseRange(new URLSearchParams({ from: '2026-01-01', to: '2026-01-31' }));
    expect(r).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('never lets a range exceed a year — the RPCs refuse wider', () => {
    const r = parseRange(new URLSearchParams({ from: '2000-01-01', to: '2026-01-31' }));
    expect(r.from).toBe(shiftDays('2026-01-31', -366));
  });

  it('ignores a backwards or malformed range and falls back to days', () => {
    expect(parseRange(new URLSearchParams({ from: '2026-05-05', to: '2026-01-01' })).to).toBe(istToday());
    expect(parseRange(new URLSearchParams({ from: 'nonsense', to: 'also' })).to).toBe(istToday());
  });

  it('clamps ?days and rejects junk', () => {
    expect(parseRange(new URLSearchParams({ days: '9999' })).from).toBe(shiftDays(istToday(), -365));
    expect(parseRange(new URLSearchParams({ days: '-5' })).from).toBe(istToday());
    expect(parseRange(new URLSearchParams({ days: 'abc' })).from).toBe(shiftDays(istToday(), -29));
  });

  it('never returns a future end date', () => {
    const future = shiftDays(istToday(), 30);
    expect(parseRange(new URLSearchParams({ from: '2026-01-01', to: future })).to).toBe(istToday());
  });
});

describe('query parameters', () => {
  it('clamps integers into range', () => {
    const q = new URLSearchParams({ limit: '99999', offset: '-1' });
    expect(intParam(q, 'limit', 50, 1, 500)).toBe(500);
    expect(intParam(q, 'offset', 0, 0, 1000)).toBe(0);
  });

  it('treats blank strings as "no filter", not as an empty match', () => {
    const q = new URLSearchParams({ role: '   ', stage: 'verified' });
    expect(strParam(q, 'role')).toBeNull();
    expect(strParam(q, 'stage')).toBe('verified');
    expect(strParam(q, 'missing')).toBeNull();
  });

  it('truncates over-long values rather than passing them through', () => {
    const q = new URLSearchParams({ search: 'x'.repeat(500) });
    expect(strParam(q, 'search')?.length).toBe(120);
  });
});

describe('insight module registry', () => {
  it('only exposes whitelisted reports', () => {
    expect(MODULES['payments']).toBeTruthy();
    expect(MODULES['profiles' as keyof typeof MODULES]).toBeUndefined();
    expect(MODULES['drop table' as keyof typeof MODULES]).toBeUndefined();
  });

  it('maps every module to an admin_* function and a known tier', () => {
    for (const [name, mod] of Object.entries(MODULES)) {
      expect(mod.rpc, name).toMatch(/^admin_/);
      expect(['admin', 'super']).toContain(mod.tier);
    }
  });

  it('builds RPC arguments without leaking raw query keys', () => {
    const q = new URLSearchParams({ status: 'paid', limit: '10' });
    const args = MODULES.payments.args(q, { from: '2026-01-01', to: '2026-01-31' });
    expect(args).toMatchObject({ p_status: 'paid', p_limit: 10, p_from: '2026-01-01' });
    for (const key of Object.keys(args)) expect(key.startsWith('p_')).toBe(true);
  });

  it('keeps the report-builder dataset list closed', () => {
    expect(DATASETS).toContain('users');
    expect(DATASETS as readonly string[]).not.toContain('phone_otp_sessions');
  });
});

describe('CSV export', () => {
  const rows = [
    { name: 'Asha', phone: '+91 98765 43210', note: 'said "yes"' },
    { name: 'Ravi, Jr', phone: '+91 91234 56789', note: null },
  ];

  it('quotes separators and doubles embedded quotes', () => {
    const csv = toCsv(rows);
    expect(csv.split('\r\n')[0]).toBe('name,phone,note');
    expect(csv).toContain('"Ravi, Jr"');
    expect(csv).toContain('"said ""yes"""');
  });

  it('omits sensitive columns for a non-super admin', () => {
    const csv = toCsv(rows, CSV_SENSITIVE);
    expect(csv).not.toContain('phone');
    expect(csv).not.toContain('98765');
    expect(csv).toContain('Asha');
  });

  it('returns nothing for no rows rather than a stray header', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('broadcast validation', () => {
  const valid = {
    name: 'September update',
    kind: 'announcement' as const,
    title: 'Three new campaigns',
    body: 'Brands are looking for creators like you.',
    channels: ['push', 'in_app'],
  };

  it('accepts a well-formed one-off broadcast', () => {
    expect(BroadcastCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses a title longer than a lock screen shows', () => {
    expect(BroadcastCreateSchema.safeParse({ ...valid, title: 'x'.repeat(66) }).success).toBe(false);
  });

  it('refuses an off-site deep link', () => {
    expect(BroadcastCreateSchema.safeParse({ ...valid, deep_link: 'https://evil.example/pwn' }).success).toBe(false);
    expect(BroadcastCreateSchema.safeParse({ ...valid, deep_link: '/dashboard/campaigns' }).success).toBe(true);
  });

  it('refuses a non-HTTPS image', () => {
    expect(BroadcastCreateSchema.safeParse({ ...valid, image_url: 'http://x.example/a.png' }).success).toBe(false);
  });

  it('refuses an unknown guide id', () => {
    expect(BroadcastCreateSchema.safeParse({ ...valid, kind: 'tutorial', guide_id: 'not-a-guide' }).success).toBe(false);
  });

  it('requires a time for anything repeating, and a weekday for weekly', () => {
    expect(BroadcastCreateSchema.safeParse({ ...valid, frequency: 'daily' }).success).toBe(false);
    expect(BroadcastCreateSchema.safeParse({ ...valid, frequency: 'daily', time_ist: '09:30' }).success).toBe(true);
    expect(BroadcastCreateSchema.safeParse({ ...valid, frequency: 'weekly', time_ist: '09:30' }).success).toBe(false);
    expect(BroadcastCreateSchema.safeParse({ ...valid, frequency: 'weekly', time_ist: '09:30', by_weekday: [2] }).success).toBe(true);
  });

  it('requires at least one channel', () => {
    expect(BroadcastCreateSchema.safeParse({ ...valid, channels: [] }).success).toBe(false);
  });
});

describe('audience segments', () => {
  it('rejects an unknown key rather than silently widening the audience', () => {
    expect(AudienceSchema.safeParse({ role: 'both', everyone_everywhere: true }).success).toBe(false);
  });

  it('rejects a role that is not one of ours (admins are never targetable)', () => {
    expect(AudienceSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('caps an explicit id list', () => {
    const ids = Array.from({ length: 5001 }, () => '11111111-1111-1111-1111-111111111111');
    expect(AudienceSchema.safeParse({ user_ids: ids }).success).toBe(false);
  });

  it('accepts the segments the composer offers', () => {
    expect(AudienceSchema.safeParse({ role: 'influencer', creator_verification: ['verified'] }).success).toBe(true);
    expect(AudienceSchema.safeParse({ role: 'both', pro_expiring_within_days: 7 }).success).toBe(true);
    expect(AudienceSchema.safeParse({ role: 'both', dormant_for_days: 14 }).success).toBe(true);
  });

  it('has a sane approval threshold', () => {
    expect(approvalThreshold()).toBeGreaterThan(0);
  });
});

describe('push payloads', () => {
  it('always names the Android channel and high priority', () => {
    const m = withDefaults({ to: 'ExponentPushToken[x]', title: 'a', body: 'b' });
    expect(m.channelId).toBe('default');
    expect(m.priority).toBe('high');
    expect(m.sound).toBe('default');
  });

  it('lets a caller override a default', () => {
    expect(withDefaults({ to: 't', title: 'a', body: 'b', priority: 'normal' }).priority).toBe('normal');
  });

  it('batches at Expo’s documented limit', () => {
    expect(EXPO_BATCH).toBe(100);
  });

  it('falls back from deep link to guide to home', () => {
    expect(broadcastLink({ deep_link: '/dashboard/projects', guide_id: null })).toBe('/dashboard/projects');
    expect(broadcastLink({ deep_link: null, guide_id: 'payments' })).toBe('/dashboard?guide=payments');
    expect(broadcastLink({ deep_link: null, guide_id: null })).toBe('/dashboard/home');
  });
});

describe('deletion tombstones', () => {
  it('hashes an identifier stably and never returns it in clear', () => {
    process.env.DELETION_HASH_SALT = 'test-salt';
    const a = identifierHash('Person@Example.com ', 'email');
    const b = identifierHash('person@example.com', 'email');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('person');
  });

  it('matches a phone on its last ten digits, ignoring formatting', () => {
    process.env.DELETION_HASH_SALT = 'test-salt';
    expect(identifierHash('+91 98765 43210', 'phone')).toBe(identifierHash('9876543210', 'phone'));
  });

  it('returns null when there is nothing to hash', () => {
    expect(identifierHash(null, 'email')).toBeNull();
    expect(identifierHash('', 'phone')).toBeNull();
  });

  it('offers reasons without exposing an admin-only one', () => {
    expect(DELETION_REASONS).toContain('privacy');
    expect(DELETION_REASONS as readonly string[]).not.toContain('admin_action');
  });
});

describe('renewal reminders', () => {
  const end = '2026-10-17T01:50:58Z';

  it('counts down before expiry', () => {
    expect(renewalCopy(7, end).title).toContain('7 days');
    expect(renewalCopy(1, end).title).toContain('tomorrow');
  });

  it('switches to past tense once the plan has ended', () => {
    expect(renewalCopy(0, end).title).toMatch(/has ended/);
  });

  it('puts the date in the body, in IST', () => {
    expect(renewalCopy(3, end).body).toContain('17 Oct');
  });
});
