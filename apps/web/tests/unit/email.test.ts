import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TEMPLATES, getTemplate, listTemplates, type TemplateDef } from '@/lib/email/templates';
import { esc, escUrl, renderEmail, panel } from '@/lib/email/layout';
import { unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl } from '@/lib/email/unsubscribe';
import { emailsEnabled, isValidEmail } from '@/lib/email/client';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ALL = Object.values(TEMPLATES) as TemplateDef<any>[];

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-for-unsubscribe-tokens';
  process.env.NEXT_PUBLIC_APP_URL = 'https://influnet.io';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('template registry', () => {
  it('renders every template from its own sample without throwing', () => {
    for (const tpl of ALL) {
      const html = tpl.render(tpl.sample, { unsubscribeUrl: 'https://influnet.io/u?t=x' });
      expect(html, tpl.id).toContain('<!DOCTYPE html');
      expect(html, tpl.id).toContain('</html>');
      expect(tpl.subject(tpl.sample).length, tpl.id).toBeGreaterThan(0);
    }
  });

  it('never leaks "undefined" into rendered output', () => {
    for (const tpl of ALL) {
      const html = tpl.render(tpl.sample);
      expect(html, `${tpl.id} rendered "undefined"`).not.toContain('undefined');
      expect(tpl.subject(tpl.sample), `${tpl.id} subject`).not.toContain('undefined');
    }
  });

  it('gives account-tier mail no unsubscribe link even when one is supplied', () => {
    // A password reset with an "unsubscribe" footer reads as phishing, and we
    // cannot honour it anyway — security mail is not optional.
    const html = TEMPLATES.password_reset.render(TEMPLATES.password_reset.sample, {
      unsubscribeUrl: 'https://influnet.io/api/email/unsubscribe?t=leak',
    });
    expect(html).not.toContain('t=leak');
    expect(html).not.toContain('Unsubscribe');
  });

  it('puts an unsubscribe link in every activity-tier mail', () => {
    for (const tpl of ALL.filter((t) => t.tier === 'activity')) {
      const html = tpl.render(tpl.sample, { unsubscribeUrl: 'https://influnet.io/api/email/unsubscribe?t=abc' });
      expect(html, tpl.id).toContain('t=abc');
      expect(html, tpl.id).toContain('Unsubscribe');
    }
  });

  it('exposes each template through getTemplate and listTemplates', () => {
    expect(getTemplate('nope')).toBeNull();
    const listed = listTemplates();
    expect(listed).toHaveLength(ALL.length);
    for (const tpl of ALL) {
      expect(getTemplate(tpl.id)?.id).toBe(tpl.id);
    }
  });
});

describe('escaping', () => {
  it('escapes markup in interpolated values', () => {
    expect(esc('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(esc(`O'Brien & "co"`)).toBe('O&#39;Brien &amp; &quot;co&quot;');
  });

  it('escapes an attacker-controlled display name inside a real template', () => {
    // Display names are user-supplied; unescaped they can break out of the
    // layout or smuggle markup into someone else's inbox.
    const html = TEMPLATES.collab_request.render({
      ...TEMPLATES.collab_request.sample,
      businessName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('rejects javascript: and data: URLs in hrefs', () => {
    expect(escUrl('javascript:alert(1)')).toBe('https://influnet.io');
    expect(escUrl('data:text/html,<script>')).toBe('https://influnet.io');
  });

  it('makes app-relative links absolute', () => {
    expect(escUrl('/dashboard/projects')).toBe('https://influnet.io/dashboard/projects');
    expect(escUrl('https://example.com/x')).toBe('https://example.com/x');
  });

  it('escapes panel content passed as structured fields', () => {
    const html = panel({ title: '<b>hi</b>', eyebrow: '<i>x</i>' }, 'brand');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;x&lt;/i&gt;');
  });
});

describe('shell', () => {
  it('includes a preheader and the heading', () => {
    const html = renderEmail({ preheader: 'Peek at this', heading: 'A heading', body: '<p>hi</p>' });
    expect(html).toContain('Peek at this');
    expect(html).toContain('A heading');
    expect(html).toContain('mso-hide:all');
  });

  it('pairs every dark-mode class it emits with a rule in the style block', () => {
    // A block helper that emits dk-body without a matching rule keeps its
    // light-mode colour on a dark card — invisible in the light-mode preview,
    // unreadable in Apple Mail.
    const html = ALL.map((t) => t.render(t.sample)).join('');
    const used = new Set(
      [...html.matchAll(/class="([^"]*)"/g)]
        .flatMap((m) => m[1].split(/\s+/))
        .filter((c) => c.startsWith('dk-')),
    );
    const shell = renderEmail({ preheader: 'x', heading: 'x', body: '' });
    for (const cls of used) {
      expect(shell, `no dark rule for .${cls}`).toContain(`.${cls}`);
    }
  });
});

describe('unsubscribe tokens', () => {
  const USER = '11111111-1111-4111-8111-111111111111';

  it('round-trips a user and category', () => {
    const token = unsubscribeToken(USER, 'message');
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: USER, category: 'message' });
  });

  it('rejects a tampered payload', () => {
    // Without the signature check, `?t=<other-user-id>` would let anyone
    // unsubscribe anyone.
    const token = unsubscribeToken(USER, 'message');
    const [payload, signature] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)];
    const forged = Buffer.from('22222222-2222-4222-8222-222222222222.message', 'utf8').toString('base64url');
    expect(verifyUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}.deadbeef`)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = unsubscribeToken(USER, 'collab');
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'a-completely-different-secret';
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it('rejects malformed input instead of throwing', () => {
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('garbage')).toBeNull();
    expect(verifyUnsubscribeToken('...')).toBeNull();
  });

  it('builds an absolute unsubscribe URL', () => {
    expect(unsubscribeUrl(USER, 'all')).toMatch(/^https:\/\/influnet\.io\/api\/email\/unsubscribe\?t=/);
  });
});

describe('send gate', () => {
  it('treats anything but "true" as disabled', () => {
    process.env.NOTIFY_EMAILS_ENABLED = 'false';
    expect(emailsEnabled()).toBe(false);
    delete process.env.NOTIFY_EMAILS_ENABLED;
    expect(emailsEnabled()).toBe(false);
    process.env.NOTIFY_EMAILS_ENABLED = 'true';
    expect(emailsEnabled()).toBe(true);
  });

  it('survives a trailing inline comment in the .env value', () => {
    // .env.local ships as `NOTIFY_EMAILS_ENABLED=true   # comment`, and not
    // every loader strips that. A raw === 'true' comparison would silently
    // disable email in exactly the environment that meant to enable it.
    process.env.NOTIFY_EMAILS_ENABLED = 'true      # "false" suppresses all app sends';
    expect(emailsEnabled()).toBe(true);
  });

  it('validates recipient addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('no-at-sign')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });
});
