// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * The web signup reads the phone-OTP gate from GET /api/auth/config at RUNTIME
 * (not from a NEXT_PUBLIC_ constant baked in at build). This pins what the
 * wizard sees in each state, including the two awkward ones: while the fetch is
 * in flight, and when it fails.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderHook(fetchImpl: () => Promise<unknown>): Promise<{ first: boolean; final: boolean; calls: number }> {
  // The module caches the flag for the life of the page, so each case needs a fresh module.
  vi.resetModules();
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal('fetch', fetchMock);
  const { usePhoneOtpEnabled } = await import('@/components/signup/phone-otp-field');

  const seen: boolean[] = [];
  function Probe() {
    const v = usePhoneOtpEnabled();
    seen.push(v);
    return createElement('span', null, String(v));
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(Probe));
  });
  // let the fetch promise chain settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { first: seen[0], final: seen[seen.length - 1], calls: fetchMock.mock.calls.length };
}

const json = (body: unknown, ok = true) => () => Promise.resolve({ ok, json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('usePhoneOtpEnabled', () => {
  it('turns ON when /api/auth/config says the gate is on', async () => {
    const r = await renderHook(json({ phoneOtpEnabled: true }));
    expect(r.final).toBe(true);
    expect(r.calls).toBe(1);
  });

  it('stays OFF when /api/auth/config says the gate is off', async () => {
    const r = await renderHook(json({ phoneOtpEnabled: false }));
    expect(r.final).toBe(false);
  });

  it('reads the config at runtime, not a build-time constant: the first render is unknown (off) until the fetch answers', async () => {
    const r = await renderHook(json({ phoneOtpEnabled: true }));
    expect(r.first).toBe(false); // before the answer
    expect(r.final).toBe(true); //  after it
  });

  it('treats a failed fetch as OFF (the server still refuses an unverified number)', async () => {
    const r = await renderHook(() => Promise.reject(new Error('offline')));
    expect(r.final).toBe(false);
  });

  it('treats a non-200 config response as OFF', async () => {
    const r = await renderHook(json({ error: 'x' }, false));
    expect(r.final).toBe(false);
  });

  it('only a real boolean true counts (a truthy string does not)', async () => {
    const r = await renderHook(json({ phoneOtpEnabled: 'true' }));
    expect(r.final).toBe(false);
  });
});
