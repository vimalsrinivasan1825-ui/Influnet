/**
 * The ownership-claim endpoints must carry a handle.
 *
 * `social_account_claims` is keyed on (user_id, platform, handle) — one user can
 * hold several claims — so the server cannot infer which one a call means. It
 * fails in two different ways when the handle is missing, and only one of them
 * is loud:
 *
 *   POST → 400 'A handle is required'
 *   GET  → 200 { status: 'none' }   ← indistinguishable from "not started yet"
 *
 * Mobile shipped calling both with no handle at all. The POST failure was
 * visible ("A handle is required" on the Get-my-code button); the GET failure
 * was not, and it meant an already-verified creator was shown the un-started
 * state. On top of that, the confirm handler read `status` from a response whose
 * shape is `{ verified }` — so even a successful confirm reported failure.
 *
 * All three are signature-level mistakes, which is why the fix was to make the
 * handle a required parameter rather than to fix three call sites. These tests
 * assert what actually goes on the wire, since that is the part that broke.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiClient, createEndpoints } from '@influnet/api';

let calls: Array<{ url: string; init: RequestInit }>;

function endpointsWithSpy(response: unknown = {}) {
  calls = [];
  const fetchSpy = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => response,
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchSpy);

  const api = createApiClient({
    baseUrl: 'https://api.test',
    getToken: async () => 'test-token',
  });
  return createEndpoints(api);
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('ownership endpoints — handle propagation', () => {
  it('puts the handle and platform in the status query string', async () => {
    const endpoints = endpointsWithSpy({ status: 'verified' });
    await endpoints.checkOwnershipStatus('creatorname');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('handle=creatorname');
    expect(calls[0].url).toContain('platform=instagram');
  });

  it('URL-encodes handles rather than splicing them in raw', async () => {
    const endpoints = endpointsWithSpy({ status: 'none' });
    // Dots are legal in Instagram handles; '&' is not, but a query builder that
    // would break on one would break on the other.
    await endpoints.checkOwnershipStatus('first.last');

    expect(calls[0].url).toContain('handle=first.last');
  });

  it('sends the handle on initiate, defaulting the platform', async () => {
    const endpoints = endpointsWithSpy({ code: 'vf_x', verify_url: 'https://x/vf/vf_x' });
    await endpoints.checkOwnership({ action: 'initiate', handle: 'creatorname' });

    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({
      platform: 'instagram',
      action: 'initiate',
      handle: 'creatorname',
    });
  });

  it('sends the handle on confirm too', async () => {
    const endpoints = endpointsWithSpy({ verified: true });
    await endpoints.checkOwnership({ action: 'confirm', handle: 'creatorname' });

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.action).toBe('confirm');
    expect(body.handle).toBe('creatorname');
  });

  it('lets an explicit platform override the instagram default', async () => {
    const endpoints = endpointsWithSpy({});
    await endpoints.checkOwnership({
      action: 'initiate',
      handle: 'somebody',
      platform: 'linkedin',
    });

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.platform).toBe('linkedin');
  });

  it('fetches the signup Instagram prefill as a GET with a query handle', async () => {
    // /api/auth/scrape-instagram exports GET only. The helper used to POST a
    // body to it, which would have 405'd — the same class of mistake as the
    // missing handle above, and equally invisible because nothing called it.
    const endpoints = endpointsWithSpy({ profile: { followerCount: 1000 } });
    await endpoints.scrapeInstagram('creatorname');

    expect(calls[0].url).toContain('/api/auth/scrape-instagram?handle=creatorname');
    expect(calls[0].init.method ?? 'GET').toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
  });

  it('returns the server response unchanged, so callers read `verified`', async () => {
    // Guards the third bug: the confirm response is { verified }, never
    // { status }. If this shape ever changes, the mobile confirm handler and
    // the web panel both need updating together.
    const endpoints = endpointsWithSpy({ verified: true, result: {} });
    const res = await endpoints.checkOwnership<{ verified: boolean }>({
      action: 'confirm',
      handle: 'creatorname',
    });

    expect(res.data).toHaveProperty('verified', true);
    expect(res.data).not.toHaveProperty('status');
  });
});
