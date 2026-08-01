/**
 * The public origin, and why the server may not simply believe the Host header.
 *
 * publicOrigin() prefers the real browser origin so one build served from
 * localhost, dev and prod does not show all three whichever domain happened to
 * be set at build time (NEXT_PUBLIC_* is inlined when the bundle is built).
 *
 * originFromHeaders() is the server-side counterpart, and is the sharp one.
 * The ownership bio marker is `<origin>/<username>`, both halves of which a
 * caller can influence: Host / X-Forwarded-Host are client-controlled, and a
 * user picks their own username. Unvalidated, that lets someone mint an
 * arbitrary `A/B` marker, choose one that already appears in another person's
 * Instagram bio (linktr.ee/<name> and friends are everywhere), and have the
 * confirm step scrape that bio, find the string, and grant them a verified
 * claim on a handle they do not own. These tests pin the allowlist shut.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { originFromHeaders } from '@/lib/site';

const CONFIGURED = 'https://influnet.com';

function headers(h: Record<string, string>): Headers {
  return new Headers(h);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('originFromHeaders — trusted hosts', () => {
  it('honours a host on a deployment domain', () => {
    expect(originFromHeaders(headers({ host: 'dev.influnet.io' }))).toBe('https://dev.influnet.io');
  });

  it('honours the staging container host', () => {
    const host = 'influnet-staging.icysky-7414f4c6.southindia.azurecontainerapps.io';
    expect(originFromHeaders(headers({ host }))).toBe(`https://${host}`);
  });

  it('honours localhost over http, so local dev shows a link that resolves', () => {
    expect(originFromHeaders(headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });

  it('honours the configured canonical host even if it is not in the suffix list', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://some-other-domain.example');
    expect(originFromHeaders(headers({ host: 'some-other-domain.example' }))).toBe(
      'https://some-other-domain.example',
    );
  });

  it('prefers x-forwarded-host, which is what a proxy actually sets', () => {
    const h = headers({ host: 'internal:8080', 'x-forwarded-host': 'dev.influnet.io' });
    expect(originFromHeaders(h)).toBe('https://dev.influnet.io');
  });
});

describe('originFromHeaders — forged hosts cannot reach the bio marker', () => {
  it('ignores a forged Host and falls back to the configured origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', CONFIGURED);
    expect(originFromHeaders(headers({ host: 'linktr.ee' }))).toBe(CONFIGURED);
  });

  it('ignores a forged X-Forwarded-Host', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', CONFIGURED);
    const h = headers({ host: 'dev.influnet.io', 'x-forwarded-host': 'youtube.com' });
    expect(originFromHeaders(h)).toBe(CONFIGURED);
  });

  it('is not fooled by a trusted domain appearing as a prefix', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', CONFIGURED);
    expect(originFromHeaders(headers({ host: 'influnet.io.evil.test' }))).toBe(CONFIGURED);
  });

  it('is not fooled by a trusted domain appearing as a bare suffix', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', CONFIGURED);
    // Must match the domain or a subdomain of it — not merely end with the
    // text. This is what the leading dot in the suffix check is guarding.
    expect(originFromHeaders(headers({ host: 'notinflunet.io' }))).toBe(CONFIGURED);
  });

  it('the concrete attack: a bio-lookalike host cannot become the marker', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', CONFIGURED);
    // Attacker sets username "vimal" and forges linktr.ee, aiming for the
    // marker "linktr.ee/vimal" that already sits in the victim's bio.
    const origin = originFromHeaders(headers({ host: 'linktr.ee' }));
    expect(`${origin}/vimal`).toBe(`${CONFIGURED}/vimal`);
    expect(`${origin}/vimal`).not.toContain('linktr.ee');
  });
});
